use clap::{Parser, Subcommand};
use mqtt_broker::rule::Rule;
use reqwest::Client;
use std::error::Error;

#[derive(Parser)]
#[command(name = "mqtt-cli", about = "CLI tool for MQTT Broker rule management")]
struct Cli {
    #[arg(long, default_value = "http://localhost:8080", help = "Broker API base URL")]
    api_url: String,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    #[command(about = "Add a new webhook rule")]
    AddRule {
        #[arg(short, long, help = "Rule ID")]
        id: String,

        #[arg(short, long, help = "Topic pattern (e.g. sensor/temp, sensor/#)")]
        topic: String,

        #[arg(short, long, help = "Webhook URL to forward matching messages")]
        url: String,

        #[arg(short, long, default_value = "true", help = "Enable rule immediately")]
        enabled: String,
    },

    #[command(about = "Remove a rule by ID")]
    RemoveRule {
        #[arg(short, long, help = "Rule ID to remove")]
        id: String,
    },

    #[command(about = "List all rules")]
    ListRules,

    #[command(about = "Get a specific rule by ID")]
    GetRule {
        #[arg(short, long, help = "Rule ID")]
        id: String,
    },
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let cli = Cli::parse();
    let client = Client::new();

    match cli.command {
        Commands::AddRule {
            id,
            topic,
            url,
            enabled,
        } => {
            let enabled_bool = enabled.parse::<bool>().unwrap_or(true);
            let rule = Rule {
                id,
                topic_pattern: topic,
                webhook_url: url,
                enabled: enabled_bool,
            };

            let resp = client
                .post(format!("{}/rules", cli.api_url))
                .json(&rule)
                .send()
                .await?;

            if resp.status().is_success() {
                println!("Rule added successfully");
            } else {
                println!("Failed to add rule: {}", resp.status());
            }
        }
        Commands::RemoveRule { id } => {
            let resp = client
                .delete(format!("{}/rules/{}", cli.api_url, id))
                .send()
                .await?;

            if resp.status().is_success() {
                println!("Rule '{}' removed successfully", id);
            } else {
                println!("Failed to remove rule: {}", resp.status());
            }
        }
        Commands::ListRules => {
            let resp = client
                .get(format!("{}/rules", cli.api_url))
                .send()
                .await?;

            let rules: Vec<Rule> = resp.json().await?;

            if rules.is_empty() {
                println!("No rules configured");
            } else {
                println!("{:<20} {:<25} {:<40} {:<8}", "ID", "TOPIC", "WEBHOOK URL", "ENABLED");
                println!("{}", "-".repeat(95));
                for rule in &rules {
                    println!(
                        "{:<20} {:<25} {:<40} {:<8}",
                        rule.id,
                        rule.topic_pattern,
                        rule.webhook_url,
                        rule.enabled
                    );
                }
            }
        }
        Commands::GetRule { id } => {
            let resp = client
                .get(format!("{}/rules/{}", cli.api_url, id))
                .send()
                .await?;

            if resp.status().is_success() {
                let rule: Rule = resp.json().await?;
                println!("ID:          {}", rule.id);
                println!("Topic:       {}", rule.topic_pattern);
                println!("Webhook URL: {}", rule.webhook_url);
                println!("Enabled:     {}", rule.enabled);
            } else {
                println!("Rule '{}' not found", id);
            }
        }
    }

    Ok(())
}
