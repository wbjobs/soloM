use actix_web_actors::ws;
use std::time::{Duration, Instant};
use tokio::sync::broadcast;
use uuid::Uuid;

use crate::models::{SubscribeMessage, UnsubscribeMessage, WebSocketMessage};
use crate::websocket::AppState;

pub struct WsSession {
    state: AppState,
    client_id: Option<Uuid>,
    receiver: Option<broadcast::Receiver<WebSocketMessage>>,
    heartbeat: Instant,
}

const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(10);
const CLIENT_TIMEOUT: Duration = Duration::from_secs(30);

impl WsSession {
    pub fn new(state: AppState) -> Self {
        Self {
            state,
            client_id: None,
            receiver: None,
            heartbeat: Instant::now(),
        }
    }

    fn handle_message(&mut self, text: String, ctx: &mut ws::WebsocketContext<Self>) {
        if let Ok(sub_msg) = serde_json::from_str::<SubscribeMessage>(&text) {
            if sub_msg.msg_type == "subscribe" {
                let client_id = self.client_id.unwrap();
                let symbol = sub_msg.symbol.clone();
                let channels = sub_msg.channels.clone();
                let kline_interval = sub_msg.kline_interval.clone();

                let state = self.state.clone();
                let broker = state.broker.clone();
                let orderbooks = state.orderbooks.clone();
                let config = state.config.clone();

                actix_web::rt::spawn(async move {
                    broker.subscribe(client_id, symbol.clone(), channels, kline_interval).await;
                    
                    if !orderbooks.lock().await.contains_key(&symbol) {
                        let book = crate::orderbook::OrderBook::new(
                            symbol.clone(),
                            config.orderbook.max_levels,
                        );
                        orderbooks.lock().await.insert(symbol.clone(), book);
                    }
                });
            }
        } else if let Ok(unsub_msg) = serde_json::from_str::<UnsubscribeMessage>(&text) {
            if unsub_msg.msg_type == "unsubscribe" {
                let client_id = self.client_id.unwrap();
                let symbol = unsub_msg.symbol.clone();
                let channels = unsub_msg.channels.clone();

                let broker = self.state.broker.clone();
                actix_web::rt::spawn(async move {
                    broker.unsubscribe(client_id, symbol, channels).await;
                });
            }
        }
    }

    fn start_heartbeat(&self, ctx: &mut ws::WebsocketContext<Self>) {
        ctx.run_interval(HEARTBEAT_INTERVAL, |act, ctx| {
            if Instant::now().duration_since(act.heartbeat) > CLIENT_TIMEOUT {
                if let Some(client_id) = act.client_id {
                    let broker = act.state.broker.clone();
                    actix_web::rt::spawn(async move {
                        broker.unregister_client(client_id).await;
                    });
                }
                ctx.stop();
                return;
            }
            ctx.ping(b"");
        });
    }
}

impl actix::Actor for WsSession {
    type Context = ws::WebsocketContext<Self>;

    fn started(&mut self, ctx: &mut Self::Context) {
        let state = self.state.clone();
        let broker = state.broker.clone();
        
        let fut = async move {
            broker.register_client().await
        };

        let addr = ctx.address();
        actix_web::rt::spawn(async move {
            let (client_id, rx) = fut.await;
            addr.do_send(RegisterResult { client_id, rx });
        });

        self.start_heartbeat(ctx);
    }

    fn stopped(&mut self, ctx: &mut Self::Context) {
        if let Some(client_id) = self.client_id {
            let broker = self.state.broker.clone();
            actix_web::rt::spawn(async move {
                broker.unregister_client(client_id).await;
            });
        }
    }
}

#[derive(actix::Message)]
#[rtype(result = "()")]
struct RegisterResult {
    client_id: Uuid,
    rx: broadcast::Receiver<WebSocketMessage>,
}

impl actix::Handler<RegisterResult> for WsSession {
    type Result = ();

    fn handle(&mut self, msg: RegisterResult, ctx: &mut Self::Context) {
        self.client_id = Some(msg.client_id);
        self.receiver = Some(msg.rx);
        
        let addr = ctx.address();
        let mut rx = self.receiver.take().unwrap();
        
        actix_web::rt::spawn(async move {
            while let Ok(msg) = rx.recv().await {
                addr.do_send(WsMessage(msg));
            }
        });
    }
}

#[derive(actix::Message)]
#[rtype(result = "()")]
struct WsMessage(WebSocketMessage);

impl actix::Handler<WsMessage> for WsSession {
    type Result = ();

    fn handle(&mut self, msg: WsMessage, ctx: &mut Self::Context) {
        if let Ok(text) = serde_json::to_string(&msg.0) {
            ctx.text(text);
        }
    }
}

impl actix::StreamHandler<Result<ws::Message, ws::ProtocolError>> for WsSession {
    fn handle(&mut self, msg: Result<ws::Message, ws::ProtocolError>, ctx: &mut Self::Context) {
        match msg {
            Ok(ws::Message::Ping(msg)) => {
                self.heartbeat = Instant::now();
                ctx.pong(&msg);
            }
            Ok(ws::Message::Pong(_)) => {
                self.heartbeat = Instant::now();
            }
            Ok(ws::Message::Text(text)) => {
                self.handle_message(text, ctx);
            }
            Ok(ws::Message::Binary(_)) => {}
            Ok(ws::Message::Close(reason)) => {
                ctx.close(reason);
                ctx.stop();
            }
            Ok(ws::Message::Nop) => {}
            Err(e) => {
                ctx.stop();
            }
        }
    }
}
