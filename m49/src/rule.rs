use crate::protocol::topic_matches;
use dashmap::DashMap;
use log::{info, warn};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Rule {
    pub id: String,
    pub topic_pattern: String,
    pub webhook_url: String,
    #[serde(default = "default_enabled")]
    pub enabled: bool,
}

fn default_enabled() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebhookPayload {
    pub topic: String,
    pub payload: String,
    pub rule_id: String,
    pub timestamp: u64,
}

pub struct RuleEngine {
    rules: DashMap<String, Rule>,
    http_client: reqwest::Client,
}

impl RuleEngine {
    pub fn new() -> Self {
        Self {
            rules: DashMap::new(),
            http_client: reqwest::Client::new(),
        }
    }

    pub fn add_rule(&self, rule: Rule) -> bool {
        let existing = self.rules.iter().any(|r| {
            r.value().topic_pattern == rule.topic_pattern
                && r.value().webhook_url == rule.webhook_url
        });

        if existing {
            warn!(
                "Rule with topic_pattern='{}' and webhook_url='{}' already exists, skipping",
                rule.topic_pattern, rule.webhook_url
            );
            return false;
        }

        info!(
            "Adding rule: id={}, topic={}, url={}",
            rule.id, rule.topic_pattern, rule.webhook_url
        );
        self.rules.insert(rule.id.clone(), rule);
        true
    }

    pub fn remove_rule(&self, id: &str) -> bool {
        self.rules.remove(id).is_some()
    }

    pub fn get_rule(&self, id: &str) -> Option<Rule> {
        self.rules.get(id).map(|r| r.value().clone())
    }

    pub fn list_rules(&self) -> Vec<Rule> {
        self.rules.iter().map(|r| r.value().clone()).collect()
    }

    pub async fn evaluate(&self, topic: &str, payload: &[u8]) {
        let mut triggered_webhooks: HashSet<String> = HashSet::new();

        for entry in self.rules.iter() {
            let rule = entry.value();
            if !rule.enabled {
                continue;
            }

            if !topic_matches(&rule.topic_pattern, topic) {
                continue;
            }

            if triggered_webhooks.contains(&rule.webhook_url) {
                info!(
                    "Rule '{}' matched topic '{}' but webhook '{}' already triggered for this message, skipping duplicate",
                    rule.id, topic, rule.webhook_url
                );
                continue;
            }

            triggered_webhooks.insert(rule.webhook_url.clone());

            info!(
                "Rule '{}' matched topic '{}', forwarding to {}",
                rule.id, topic, rule.webhook_url
            );

            let payload_str = String::from_utf8_lossy(payload).to_string();
            let webhook_payload = WebhookPayload {
                topic: topic.to_string(),
                payload: payload_str,
                rule_id: rule.id.clone(),
                timestamp: std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs(),
            };

            let url = rule.webhook_url.clone();
            let client = self.http_client.clone();
            let rule_id = rule.id.clone();

            tokio::spawn(async move {
                match client.post(&url).json(&webhook_payload).send().await {
                    Ok(resp) => {
                        info!(
                            "Webhook for rule '{}' returned status: {}",
                            rule_id,
                            resp.status()
                        );
                    }
                    Err(e) => {
                        warn!(
                            "Webhook for rule '{}' failed: {}",
                            rule_id, e
                        );
                    }
                }
            });
        }
    }
}

pub fn load_rules_from_file(path: &str) -> Result<Vec<Rule>, Box<dyn std::error::Error>> {
    let content = std::fs::read_to_string(path)?;
    let rules: Vec<Rule> = serde_json::from_str(&content)?;
    Ok(rules)
}

pub fn save_rules_to_file(rules: &[Rule], path: &str) -> Result<(), Box<dyn std::error::Error>> {
    let content = serde_json::to_string_pretty(rules)?;
    std::fs::write(path, content)?;
    Ok(())
}
