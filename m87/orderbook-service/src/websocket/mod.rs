pub mod session;
pub mod broker;

pub use session::WsSession;
pub use broker::MessageBroker;

use actix_web::{get, web, Error, HttpResponse};
use actix_web_actors::ws;

use std::sync::Arc;
use tokio::sync::Mutex;

use crate::config::AppConfig;
use crate::orderbook::OrderBook;
use crate::websocket::broker::MessageBroker;

#[derive(Clone)]
pub struct AppState {
    pub config: AppConfig,
    pub broker: MessageBroker,
    pub orderbooks: Arc<Mutex<std::collections::HashMap<String, OrderBook>>>,
}

#[get("/ws")]
async fn ws_endpoint(
    req: actix_web::HttpRequest,
    stream: web::Payload,
    state: web::Data<AppState>,
) -> Result<HttpResponse, Error> {
    let resp = ws::start(WsSession::new(state.get_ref().clone()), &req, stream);
    resp
}

#[get("/api/health")]
async fn health_check() -> HttpResponse {
    HttpResponse::Ok().json(serde_json::json!({
        "status": "healthy",
        "timestamp": std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64
    }))
}

pub fn configure_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(ws_endpoint);
    cfg.service(health_check);
}
