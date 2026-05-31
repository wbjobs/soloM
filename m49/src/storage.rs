use crate::protocol::{PublishPacket, QoS};
use log::{error, info, warn};
use redis::{aio::MultiplexedConnection, AsyncCommands};
use serde::{Deserialize, Serialize};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredMessage {
    pub topic: String,
    pub payload: Vec<u8>,
    pub qos: u8,
    pub timestamp: u64,
    pub packet_id: Option<u16>,
}

impl From<&PublishPacket> for StoredMessage {
    fn from(packet: &PublishPacket) -> Self {
        Self {
            topic: packet.topic.clone(),
            payload: packet.payload.clone(),
            qos: packet.qos as u8,
            timestamp: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
            packet_id: packet.packet_id,
        }
    }
}

impl StoredMessage {
    pub fn to_publish_packet(&self) -> PublishPacket {
        PublishPacket {
            topic: self.topic.clone(),
            payload: self.payload.clone(),
            qos: match self.qos {
                1 => QoS::AtLeastOnce,
                2 => QoS::ExactlyOnce,
                _ => QoS::AtMostOnce,
            },
            retain: false,
            dup: false,
            packet_id: self.packet_id,
        }
    }
}

pub struct MessageStore {
    conn: MultiplexedConnection,
    ttl_seconds: u64,
    key_prefix: String,
}

impl MessageStore {
    pub async fn new(redis_url: &str, ttl_seconds: u64) -> Result<Self, Box<dyn std::error::Error>> {
        let client = redis::Client::open(redis_url)?;
        let conn = client.get_multiplexed_async_connection().await?;
        info!("Connected to Redis at {}", redis_url);
        Ok(Self {
            conn,
            ttl_seconds,
            key_prefix: "mqtt:offline:".to_string(),
        })
    }

    fn client_key(&self, client_id: &str) -> String {
        format!("{}{}", self.key_prefix, client_id)
    }

    pub async fn store_offline_message(
        &mut self,
        client_id: &str,
        message: &StoredMessage,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let key = self.client_key(client_id);
        let serialized = serde_json::to_string(message)?;

        let score = message.timestamp as f64;

        redis::pipe()
            .zadd(&key, serialized, score)
            .expire(&key, self.ttl_seconds as i64)
            .query_async::<_, ()>(&mut self.conn)
            .await?;

        info!(
            "Stored offline message for client '{}' (topic={}, score={})",
            client_id, message.topic, score
        );

        Ok(())
    }

    pub async fn get_offline_messages(
        &mut self,
        client_id: &str,
    ) -> Result<Vec<StoredMessage>, Box<dyn std::error::Error>> {
        let key = self.client_key(client_id);

        let messages: Vec<String> = self
            .conn
            .zrangebyscore(&key, "-inf", "+inf")
            .await?;

        let mut result = Vec::new();
        for msg_str in messages {
            match serde_json::from_str::<StoredMessage>(&msg_str) {
                Ok(msg) => result.push(msg),
                Err(e) => {
                    warn!("Failed to deserialize stored message: {}", e);
                }
            }
        }

        Ok(result)
    }

    pub async fn clear_offline_messages(
        &mut self,
        client_id: &str,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let key = self.client_key(client_id);
        let count: u64 = self.conn.del(&key).await?;
        info!("Cleared {} offline messages for client '{}'", count, client_id);
        Ok(())
    }

    pub async fn cleanup_expired(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        let pattern = format!("{}*", self.key_prefix);
        let keys: Vec<String> = match self.conn.keys(&pattern).await {
            Ok(k) => k,
            Err(e) => {
                error!("Failed to get keys for cleanup: {}", e);
                return Err(e.into());
            }
        };

        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as f64;

        let cutoff = now - self.ttl_seconds as f64;

        for key in keys {
            let _: () = self.conn.zrembyscore(&key, "-inf", cutoff).await?;
        }

        Ok(())
    }

    pub async fn start_cleanup_task(mut self, interval: Duration) {
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(interval).await;
                if let Err(e) = self.cleanup_expired().await {
                    error!("Offline message cleanup failed: {}", e);
                }
            }
        });
    }
}
