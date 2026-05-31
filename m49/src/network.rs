use crate::broker::{resend_offline_messages, Broker};
use crate::protocol::{decode_packet, Packet};
use log::{error, info, trace, warn};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::io::AsyncReadExt;
use tokio::io::AsyncWriteExt;
use tokio::net::TcpListener;
use tokio::sync::mpsc;
use tokio::sync::RwLock;

pub struct NetworkServer {
    broker: Arc<Broker>,
    addr: String,
}

impl NetworkServer {
    pub fn new(broker: Arc<Broker>, addr: String) -> Self {
        Self { broker, addr }
    }

    pub async fn run(&self) -> Result<(), Box<dyn std::error::Error>> {
        let listener = TcpListener::bind(&self.addr).await?;
        info!("MQTT Broker listening on {}", self.addr);

        loop {
            let (stream, addr) = listener.accept().await?;
            info!("New connection from {}", addr);

            let broker = self.broker.clone();
            tokio::spawn(async move {
                if let Err(e) = handle_connection(stream, addr, broker).await {
                    error!("Connection error from {}: {}", addr, e);
                }
            });
        }
    }
}

pub struct ClientHandle {
    pub tx: mpsc::Sender<Vec<u8>>,
}

async fn handle_connection(
    stream: tokio::net::TcpStream,
    addr: std::net::SocketAddr,
    broker: Arc<Broker>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let (mut reader, mut writer) = stream.into_split();

    let (tx, mut rx) = mpsc::channel::<Vec<u8>>(256);

    let client_id: Arc<RwLock<String>> = Arc::new(RwLock::new(String::new()));
    let client_id_clone = client_id.clone();

    let last_activity = Arc::new(RwLock::new(Instant::now()));
    let last_activity_clone = last_activity.clone();

    let keep_alive_secs: Arc<RwLock<Option<u16>>> = Arc::new(RwLock::new(None));
    let keep_alive_secs_clone = keep_alive_secs.clone();

    let connected = Arc::new(RwLock::new(false));
    let connected_clone = connected.clone();

    let write_task = tokio::spawn(async move {
        while let Some(data) = rx.recv().await {
            if writer.write_all(&data).await.is_err() {
                break;
            }
        }
    });

    let mut timeout_task = tokio::spawn(async move {
        loop {
            let ka = *keep_alive_secs_clone.read().await;
            let is_connected = *connected_clone.read().await;

            if !is_connected {
                tokio::time::sleep(Duration::from_secs(1)).await;
                continue;
            }

            match ka {
                Some(ka_secs) if ka_secs > 0 => {
                    let timeout = Duration::from_secs((ka_secs as f64 * 1.5) as u64);
                    let last = *last_activity_clone.read().await;
                    let elapsed = last.elapsed();

                    if elapsed >= timeout {
                        warn!("Keep Alive timeout for client after {:?}", elapsed);
                        return;
                    }

                    let remaining = timeout.saturating_sub(elapsed);
                    tokio::time::sleep(Duration::min(remaining, Duration::from_secs(1))).await;
                }
                _ => {
                    tokio::time::sleep(Duration::from_secs(1)).await;
                }
            }
        }
    });

    let mut buf = bytes::BytesMut::with_capacity(4096);
    let mut has_sent_disconnect = false;

    loop {
        let mut tmp = [0u8; 4096];

        let read_result = tokio::select! {
            result = reader.read(&mut tmp) => Some(result),
            _ = &mut timeout_task => {
                info!("Connection {} timed out", addr);
                None
            }
        };

        let n = match read_result {
            None => break,
            Some(Ok(0)) => {
                info!("Client {} disconnected (EOF)", addr);
                break;
            }
            Some(Ok(n)) => n,
            Some(Err(e)) => {
                warn!("Read error from {}: {}", addr, e);
                break;
            }
        };

        *last_activity.write().await = Instant::now();

        buf.extend_from_slice(&tmp[..n]);

        while !buf.is_empty() {
            let mut decode_buf = buf.clone();
            match decode_packet(&mut decode_buf) {
                Ok(Some(packet)) => {
                    buf = decode_buf;
                    match packet {
                        Packet::Connect(connect) => {
                            let cid = connect.client_id.clone();
                            info!("CONNECT from {} (client_id={}, keep_alive={})",
                                addr, cid, connect.keep_alive);

                            *client_id.write().await = cid.clone();
                            *keep_alive_secs.write().await = Some(connect.keep_alive);
                            *connected.write().await = true;

                            broker.handle_connect(
                                cid.clone(),
                                ClientHandle { tx: tx.clone() },
                            );

                            let broker_clone = broker.clone();
                            tokio::spawn(async move {
                                resend_offline_messages(broker_clone, cid).await;
                            });

                            let connack =
                                crate::protocol::ConnackPacket {
                                    session_present: false,
                                    return_code: 0,
                                };
                            let data = crate::protocol::encode_connack(&connack);
                            if tx.send(data).await.is_err() {
                                break;
                            }
                        }
                        Packet::Subscribe(subscribe) => {
                            info!(
                                "SUBSCRIBE from {} (packet_id={}, topics={:?})",
                                addr, subscribe.packet_id, subscribe.topics
                            );

                            let cid = client_id.read().await.clone();
                            let mut return_codes = Vec::new();
                            for (topic_filter, qos) in &subscribe.topics {
                                broker.handle_subscribe(
                                    &cid,
                                    topic_filter.clone(),
                                    *qos,
                                );
                                return_codes.push(*qos as u8);
                            }

                            let suback =
                                crate::protocol::SubackPacket {
                                    packet_id: subscribe.packet_id,
                                    return_codes,
                                };
                            let data =
                                crate::protocol::encode_suback(&suback);
                            if tx.send(data).await.is_err() {
                                break;
                            }
                        }
                        Packet::Publish(publish) => {
                            let cid = client_id.read().await.clone();
                            info!(
                                "PUBLISH from {} (topic={}, qos={:?})",
                                addr, publish.topic, publish.qos
                            );

                            if let Some(pid) = publish.packet_id {
                                let data =
                                    crate::protocol::encode_puback(pid);
                                if tx.send(data).await.is_err() {
                                    break;
                                }
                            }

                            broker.handle_publish(
                                &cid,
                                publish,
                            );
                        }
                        Packet::Pingreq => {
                            trace!("PINGREQ from {}", addr);
                            let data = crate::protocol::encode_pingresp();
                            if tx.send(data).await.is_err() {
                                break;
                            }
                        }
                        Packet::Disconnect => {
                            info!("DISCONNECT from {}", addr);
                            let cid = client_id.read().await.clone();
                            broker.handle_disconnect(&cid);
                            has_sent_disconnect = true;
                            break;
                        }
                        _ => {
                            warn!("Unhandled packet from {}: {:?}", addr, packet);
                        }
                    }
                }
                Ok(None) => break,
                Err(e) => {
                    warn!("Decode error from {}: {}", addr, e);
                    break;
                }
            }
        }

        if has_sent_disconnect {
            break;
        }
    }

    if !has_sent_disconnect {
        let cid = client_id_clone.read().await.clone();
        if !cid.is_empty() {
            info!("Cleaning up session for client {} (abnormal disconnect)", cid);
            broker.handle_disconnect(&cid);
        }
    }

    drop(tx);
    let _ = write_task.await;

    Ok(())
}
