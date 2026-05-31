mod config;
mod models;
mod exchange;
mod orderbook;
mod metrics;
mod websocket;

use std::sync::Arc;
use tokio::sync::Mutex;
use tracing_subscriber::{EnvFilter, fmt};
use rust_decimal_macros::dec;

use crate::config::AppConfig;
use crate::exchange::{ExchangeClient, ExchangeMessage, MockExchangeClient, BinanceClient};
use crate::metrics::calculate_market_metrics;
use crate::models::{WebSocketMessage, VwapData};
use crate::orderbook::{OrderBook, VwapCalculator};
use crate::websocket::{AppState, MessageBroker, configure_routes};

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let config = AppConfig::load().expect("Failed to load config");

    fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new(&config.logging.level)),
        )
        .init();

    tracing::info!("Starting orderbook service on {}:{}", config.server.host, config.server.port);

    let broker = MessageBroker::new();
    let orderbooks: Arc<Mutex<std::collections::HashMap<String, OrderBook>>> = Arc::new(Mutex::new(std::collections::HashMap::new()));
    let vwap_calculators: Arc<Mutex<std::collections::HashMap<String, VwapCalculator>>> = Arc::new(Mutex::new(std::collections::HashMap::new()));

    let app_state = AppState {
        config: config.clone(),
        broker: broker.clone(),
        orderbooks: orderbooks.clone(),
    };

    let exchange_client: Arc<Box<dyn ExchangeClient>> = if config.exchange.use_mock {
        tracing::info!("Using mock exchange client");
        Arc::new(Box::new(MockExchangeClient::new(
            dec!(50000),
            config.exchange.symbols.clone(),
        )))
    } else {
        tracing::info!("Using Binance exchange client");
        Arc::new(Box::new(BinanceClient::new(config.exchange.ws_url.clone())))
    };

    let broker_clone = broker.clone();
    let orderbooks_clone = orderbooks.clone();
    let vwap_calculators_clone = vwap_calculators.clone();
    let depth_levels = config.orderbook.depth_calculation_levels;

    tokio::spawn(async move {
        let mut active_symbols = std::collections::HashSet::new();

        loop {
            let subscribed_symbols = broker_clone.get_subscribed_symbols().await;

            for symbol in &subscribed_symbols {
                if !active_symbols.contains(symbol) {
                    tracing::info!("Starting data stream for symbol: {}", symbol);
                    active_symbols.insert(symbol.clone());

                    let exchange = exchange_client.clone();
                    let symbol_clone = symbol.clone();
                    let broker_spawn = broker_clone.clone();
                    let orderbooks_spawn = orderbooks_clone.clone();
                    let vwap_calculators_spawn = vwap_calculators_clone.clone();
                    let depth_levels_clone = depth_levels;

                    tokio::spawn(async move {
                        match exchange.connect(symbol_clone.clone()).await {
                            Ok(mut rx) => {
                                tracing::info!("Connected to exchange for {}", symbol_clone);
                                loop {
                                    match rx.recv().await {
                                        Ok(msg) => {
                                            let symbol = match &msg {
                                                ExchangeMessage::Depth(d) => d.symbol.clone(),
                                                ExchangeMessage::Trade(t) => t.symbol.clone(),
                                                ExchangeMessage::Kline(k) => k.symbol.clone(),
                                                ExchangeMessage::Ticker(t) => t.symbol.clone(),
                                            };

                                            if let ExchangeMessage::Depth(depth) = &msg {
                                                let mut books = orderbooks_spawn.lock().await;
                                                if let Some(book) = books.get_mut(&symbol) {
                                                    book.update(
                                                        depth.bids.clone(),
                                                        depth.asks.clone(),
                                                        depth.last_update_id,
                                                    );

                                                    if let Some(metrics) = calculate_market_metrics(book, depth_levels_clone) {
                                                        let metrics_msg = WebSocketMessage::Metrics(metrics);
                                                        broker_spawn.broadcast(&symbol, metrics_msg, "depth").await;
                                                    }
                                                }
                                            }

                                            if let ExchangeMessage::Trade(trade) = &msg {
                                                let mut vwap_calcs = vwap_calculators_spawn.lock().await;
                                                let vwap_calc = vwap_calcs.entry(symbol.clone()).or_insert_with(|| {
                                                    VwapCalculator::new(None, Some(3600000))
                                                });
                                                
                                                vwap_calc.add_trade(trade.price, trade.quantity, trade.timestamp);
                                                
                                                let vwap_data = VwapData {
                                                    symbol: symbol.clone(),
                                                    vwap: vwap_calc.calculate(),
                                                    cumulative_volume: vwap_calc.cumulative_volume(),
                                                    cumulative_value: vwap_calc.cumulative_value(),
                                                    trade_count: vwap_calc.trades.len() as u64,
                                                    timestamp: trade.timestamp,
                                                };
                                                
                                                let vwap_msg = WebSocketMessage::Vwap(vwap_data);
                                                broker_spawn.broadcast(&symbol, vwap_msg, "vwap").await;
                                            }

                                            let ws_msg = match msg {
                                                ExchangeMessage::Depth(d) => WebSocketMessage::Depth(d),
                                                ExchangeMessage::Trade(t) => WebSocketMessage::Trade(t),
                                                ExchangeMessage::Kline(k) => WebSocketMessage::Kline(k),
                                                ExchangeMessage::Ticker(t) => WebSocketMessage::Ticker(t),
                                            };

                                            let channel = match &ws_msg {
                                                WebSocketMessage::Ticker(_) => "ticker",
                                                WebSocketMessage::Depth(_) => "depth",
                                                WebSocketMessage::Kline(_) => "kline",
                                                WebSocketMessage::Trade(_) => "trade",
                                                WebSocketMessage::Metrics(_) => "metrics",
                                                WebSocketMessage::Vwap(_) => "vwap",
                                            };

                                            broker_spawn.broadcast(&symbol, ws_msg, channel).await;
                                        }
                                        Err(e) => {
                                            tracing::warn!("Exchange stream error for {}: {}", symbol_clone, e);
                                            tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
                                        }
                                    }
                                }
                            }
                            Err(e) => {
                                tracing::error!("Failed to connect to exchange for {}: {}", symbol_clone, e);
                            }
                        }
                    });
                }
            }

            let mut to_remove = Vec::new();
            for symbol in &active_symbols {
                if !subscribed_symbols.contains(symbol) {
                    to_remove.push(symbol.clone());
                }
            }
            for symbol in to_remove {
                active_symbols.remove(&symbol);
                orderbooks_clone.lock().await.remove(&symbol);
                vwap_calculators_clone.lock().await.remove(&symbol);
                tracing::info!("Stopped data stream for symbol: {}", symbol);
            }

            tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
        }
    });

    let server_config = config.clone();
    actix_web::HttpServer::new(move || {
        actix_web::App::new()
            .app_data(actix_web::web::Data::new(app_state.clone()))
            .wrap(actix_web::middleware::Logger::default())
            .wrap(actix_cors::Cors::permissive())
            .configure(configure_routes)
    })
    .bind((server_config.server.host.as_str(), server_config.server.port))?
    .run()
    .await?;

    Ok(())
}
