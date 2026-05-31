use crate::protocol::{encode_publish, topic_matches, PublishPacket, QoS};
use crate::rule::RuleEngine;
use crate::storage::{MessageStore, StoredMessage};
use dashmap::DashMap;
use log::{error, info};
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock};

struct Subscription {
    topic_filter: String,
    qos: QoS,
}

struct ClientState {
    tx: mpsc::Sender<Vec<u8>>,
    subscriptions: Vec<Subscription>,
}

pub struct Broker {
    clients: DashMap<String, ClientState>,
    rule_engine: Arc<RuleEngine>,
    message_store: Arc<RwLock<MessageStore>>,
    persistent_subscribers: DashMap<String, Vec<String>>,
}

impl Broker {
    pub fn new(rule_engine: Arc<RuleEngine>, message_store: MessageStore) -> Self {
        Self {
            clients: DashMap::new(),
            rule_engine,
            message_store: Arc::new(RwLock::new(message_store)),
            persistent_subscribers: DashMap::new(),
        }
    }

    pub fn handle_connect(
        &self,
        client_id: String,
        handle: crate::network::ClientHandle,
    ) {
        info!("Client connected: {}", client_id);

        self.clients.insert(
            client_id,
            ClientState {
                tx: handle.tx,
                subscriptions: Vec::new(),
            },
        );
    }

    pub fn handle_subscribe(
        &self,
        client_id: &str,
        topic_filter: String,
        qos: QoS,
    ) {
        info!(
            "Client {} subscribes to {} (QoS {:?})",
            client_id, topic_filter, qos
        );

        if let Some(mut client) = self.clients.get_mut(client_id) {
            if let Some(existing) = client
                .subscriptions
                .iter_mut()
                .find(|s| s.topic_filter == topic_filter)
            {
                existing.qos = qos;
            } else {
                client.subscriptions.push(Subscription {
                    topic_filter: topic_filter.clone(),
                    qos,
                });
            }
        }

        if qos > QoS::AtMostOnce {
            self.persistent_subscribers
                .entry(client_id.to_string())
                .and_modify(|filters| {
                    if !filters.contains(&topic_filter) {
                        filters.push(topic_filter.clone());
                    }
                })
                .or_insert_with(|| vec![topic_filter]);
        }
    }

    pub fn handle_publish(
        &self,
        _client_id: &str,
        publish: PublishPacket,
    ) {
        info!(
            "Publishing to topic '{}' ({} bytes, qos={:?})",
            publish.topic,
            publish.payload.len(),
            publish.qos
        );

        let msg_topic = publish.topic.clone();
        let msg_payload = publish.payload.clone();

        let mut online_clients: Vec<String> = Vec::new();
        let mut offline_clients: Vec<(String, QoS)> = Vec::new();

        for entry in self.persistent_subscribers.iter() {
            let sub_client_id = entry.key();
            let filters = entry.value();

            let matched_qos = filters
                .iter()
                .filter(|f| topic_matches(f, &publish.topic))
                .map(|_| QoS::AtLeastOnce)
                .max();

            if let Some(qos) = matched_qos {
                if self.clients.contains_key(sub_client_id) {
                    online_clients.push(sub_client_id.clone());
                } else {
                    offline_clients.push((sub_client_id.clone(), qos));
                }
            }
        }

        for entry in self.clients.iter() {
            let client_id = entry.key();
            if online_clients.contains(client_id) {
                continue;
            }

            let matched_sub = entry
                .subscriptions
                .iter()
                .filter(|s| topic_matches(&s.topic_filter, &publish.topic))
                .max_by_key(|s| s.qos);

            if let Some(sub) = matched_sub {
                let effective_qos = std::cmp::min(sub.qos, publish.qos);

                let outgoing = PublishPacket {
                    topic: publish.topic.clone(),
                    packet_id: if effective_qos > QoS::AtMostOnce {
                        publish.packet_id
                    } else {
                        None
                    },
                    payload: publish.payload.clone(),
                    qos: effective_qos,
                    retain: false,
                    dup: false,
                };

                let data = encode_publish(&outgoing);
                let tx = entry.value().tx.clone();
                tokio::spawn(async move {
                    let _ = tx.send(data).await;
                });
            }
        }

        if publish.qos >= QoS::AtLeastOnce && !offline_clients.is_empty() {
            let stored = StoredMessage::from(&publish);
            let store_clone = self.message_store.clone();

            tokio::spawn(async move {
                let mut store = store_clone.write().await;
                for (client_id, _) in offline_clients {
                    if let Err(e) = store.store_offline_message(&client_id, &stored).await {
                        error!(
                            "Failed to store offline message for '{}': {}",
                            client_id, e
                        );
                    }
                }
            });
        }

        let engine = self.rule_engine.clone();
        tokio::spawn(async move {
            engine.evaluate(&msg_topic, &msg_payload).await;
        });
    }

    pub fn handle_disconnect(&self, client_id: &str) {
        info!("Client disconnected: {}", client_id);
        self.clients.remove(client_id);
    }

    pub fn get_client_sender(&self, client_id: &str) -> Option<mpsc::Sender<Vec<u8>>> {
        self.clients.get(client_id).map(|c| c.tx.clone())
    }
}

pub async fn resend_offline_messages(
    broker: Arc<Broker>,
    client_id: String,
) {
    let tx = match broker.get_client_sender(&client_id) {
        Some(tx) => tx,
        None => return,
    };

    let messages = {
        let mut store = broker.message_store.write().await;
        match store.get_offline_messages(&client_id).await {
            Ok(m) => m,
            Err(e) => {
                error!("Failed to get offline messages for '{}': {}", client_id, e);
                return;
            }
        }
    };

    if messages.is_empty() {
        return;
    }

    info!(
        "Resending {} offline messages for client '{}'",
        messages.len(),
        client_id
    );

    for msg in messages {
        let packet = msg.to_publish_packet();
        let data = encode_publish(&packet);
        if tx.send(data).await.is_err() {
            break;
        }
    }

    {
        let mut store = broker.message_store.write().await;
        if let Err(e) = store.clear_offline_messages(&client_id).await {
            error!(
                "Failed to clear offline messages for '{}': {}",
                client_id, e
            );
        }
    }
}
