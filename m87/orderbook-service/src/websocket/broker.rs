use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tokio::sync::{broadcast, Mutex, RwLock};
use uuid::Uuid;

use crate::models::WebSocketMessage;

pub type ClientId = Uuid;

#[derive(Debug, Clone)]
pub struct Subscription {
    pub symbol: String,
    pub channels: HashSet<String>,
    pub kline_interval: Option<String>,
}

pub struct MessageBroker {
    clients: Arc<Mutex<HashMap<ClientId, broadcast::Sender<WebSocketMessage>>>>,
    subscriptions: Arc<RwLock<HashMap<ClientId, Subscription>>>,
    symbol_subscribers: Arc<RwLock<HashMap<String, HashSet<ClientId>>>>,
}

impl Clone for MessageBroker {
    fn clone(&self) -> Self {
        Self {
            clients: Arc::clone(&self.clients),
            subscriptions: Arc::clone(&self.subscriptions),
            symbol_subscribers: Arc::clone(&self.symbol_subscribers),
        }
    }
}

impl MessageBroker {
    pub fn new() -> Self {
        Self {
            clients: Arc::new(Mutex::new(HashMap::new())),
            subscriptions: Arc::new(RwLock::new(HashMap::new())),
            symbol_subscribers: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn register_client(&self) -> (ClientId, broadcast::Receiver<WebSocketMessage>) {
        let id = Uuid::new_v4();
        let (tx, rx) = broadcast::channel(256);
        self.clients.lock().await.insert(id, tx);
        (id, rx)
    }

    pub async fn unregister_client(&self, client_id: ClientId) {
        self.clients.lock().await.remove(&client_id);
        self.subscriptions.write().await.remove(&client_id);
        
        let mut subscribers = self.symbol_subscribers.write().await;
        for clients in subscribers.values_mut() {
            clients.remove(&client_id);
        }
    }

    pub async fn subscribe(&self, client_id: ClientId, symbol: String, channels: Vec<String>, kline_interval: Option<String>) {
        let mut subs = self.subscriptions.write().await;
        let sub = Subscription {
            symbol: symbol.clone(),
            channels: channels.into_iter().collect(),
            kline_interval,
        };
        subs.insert(client_id, sub);

        let mut subscribers = self.symbol_subscribers.write().await;
        subscribers
            .entry(symbol)
            .or_insert_with(HashSet::new)
            .insert(client_id);
    }

    pub async fn unsubscribe(&self, client_id: ClientId, symbol: String, channels: Vec<String>) {
        let mut subs = self.subscriptions.write().await;
        if let Some(sub) = subs.get_mut(&client_id) {
            if sub.symbol == symbol {
                for channel in &channels {
                    sub.channels.remove(channel);
                }
            }
        }

        if let Some(sub) = subs.get(&client_id) {
            if sub.channels.is_empty() {
                subs.remove(&client_id);
                let mut subscribers = self.symbol_subscribers.write().await;
                if let Some(clients) = subscribers.get_mut(&symbol) {
                    clients.remove(&client_id);
                }
            }
        }
    }

    pub async fn broadcast(&self, symbol: &str, message: WebSocketMessage, channel: &str) {
        let subscribers = self.symbol_subscribers.read().await;
        let subscriptions = self.subscriptions.read().await;

        if let Some(client_ids) = subscribers.get(symbol) {
            for client_id in client_ids {
                if let Some(sub) = subscriptions.get(client_id) {
                    if sub.channels.contains(channel) {
                        if let Some(sender) = self.clients.lock().await.get(client_id) {
                            let _ = sender.send(message.clone());
                        }
                    }
                }
            }
        }
    }

    pub async fn get_subscribed_symbols(&self) -> HashSet<String> {
        self.symbol_subscribers
            .read()
            .await
            .keys()
            .cloned()
            .collect()
    }

    pub async fn has_subscribers(&self, symbol: &str) -> bool {
        self.symbol_subscribers
            .read()
            .await
            .get(symbol)
            .map(|s| !s.is_empty())
            .unwrap_or(false)
    }
}

impl Default for MessageBroker {
    fn default() -> Self {
        Self::new()
    }
}
