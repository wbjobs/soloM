use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::routing::{delete, get, post};
use axum::{Json, Router};
use clap::Parser;
use mqtt_broker::broker::Broker;
use mqtt_broker::network::NetworkServer;
use mqtt_broker::rule::{load_rules_from_file, Rule, RuleEngine};
use mqtt_broker::storage::MessageStore;
use std::sync::Arc;

#[derive(Debug, Parser)]
#[command(name = "mqtt-broker", about = "Lightweight MQTT Broker")]
struct Opt {
    #[arg(long, default_value = "0.0.0.0:1883", help = "MQTT listen address")]
    mqtt_addr: String,

    #[arg(long, default_value = "0.0.0.0:8080", help = "Management API address")]
    api_addr: String,

    #[arg(long, help = "Rules config file path")]
    rules_file: Option<String>,

    #[arg(long, default_value = "redis://127.0.0.1:6379", help = "Redis URL for offline message storage")]
    redis_url: String,

    #[arg(long, default_value = "86400", help = "Offline message TTL in seconds (default 24h)")]
    message_ttl: u64,
}

#[tokio::main]
async fn main() {
    env_logger::init();

    let opt = Opt::parse();

    let rule_engine = Arc::new(RuleEngine::new());

    if let Some(ref path) = opt.rules_file {
        match load_rules_from_file(path) {
            Ok(rules) => {
                let mut loaded = 0;
                let mut skipped = 0;
                for rule in rules {
                    if rule_engine.add_rule(rule) {
                        loaded += 1;
                    } else {
                        skipped += 1;
                    }
                }
                log::info!("Loaded {} rules from {} ({} skipped duplicates)", loaded, path, skipped);
            }
            Err(e) => {
                log::error!("Failed to load rules from {}: {}", path, e);
            }
        }
    }

    let message_store = match MessageStore::new(&opt.redis_url, opt.message_ttl).await {
        Ok(store) => store,
        Err(e) => {
            log::error!("Failed to connect to Redis at {}: {}", opt.redis_url, e);
            log::error!("Offline message storage disabled");
            return;
        }
    };

    let broker = Arc::new(Broker::new(rule_engine.clone(), message_store));

    let mqtt_server = NetworkServer::new(broker.clone(), opt.mqtt_addr.clone());

    let app = Router::new()
        .route("/rules", get(list_rules))
        .route("/rules", post(add_rule))
        .route("/rules/:id", delete(remove_rule))
        .route("/rules/:id", get(get_rule))
        .with_state(rule_engine);

    let api_addr: std::net::SocketAddr = opt.api_addr.parse().unwrap();

    log::info!("Management API listening on {}", api_addr);

    let mqtt_task = tokio::spawn(async move {
        if let Err(e) = mqtt_server.run().await {
            log::error!("MQTT server error: {}", e);
        }
    });

    let api_task = tokio::spawn(async move {
        let listener = tokio::net::TcpListener::bind(api_addr).await.unwrap();
        axum::serve(listener, app).await.unwrap();
    });

    tokio::select! {
        _ = mqtt_task => log::info!("MQTT server stopped"),
        _ = api_task => log::info!("API server stopped"),
    }
}

async fn list_rules(
    State(engine): State<Arc<RuleEngine>>,
) -> Json<Vec<Rule>> {
    Json(engine.list_rules())
}

async fn add_rule(
    State(engine): State<Arc<RuleEngine>>,
    Json(rule): Json<Rule>,
) -> StatusCode {
    if engine.add_rule(rule) {
        StatusCode::CREATED
    } else {
        StatusCode::CONFLICT
    }
}

async fn remove_rule(
    State(engine): State<Arc<RuleEngine>>,
    Path(id): Path<String>,
) -> StatusCode {
    if engine.remove_rule(&id) {
        StatusCode::NO_CONTENT
    } else {
        StatusCode::NOT_FOUND
    }
}

async fn get_rule(
    State(engine): State<Arc<RuleEngine>>,
    Path(id): Path<String>,
) -> Result<Json<Rule>, StatusCode> {
    engine
        .get_rule(&id)
        .map(Json)
        .ok_or(StatusCode::NOT_FOUND)
}
