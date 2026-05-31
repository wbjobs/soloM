use async_trait::async_trait;
use futures::{SinkExt, StreamExt};
use rust_decimal::Decimal;
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{broadcast, Mutex};
use tokio_tungstenite::{connect_async, tungstenite::protocol::Message};
use tracing::{error, info, warn};

use crate::exchange::{ExchangeClient, ExchangeMessage};
use crate::models::{KlineData, OrderBookSnapshot, TradeData, TickerData};

#[derive(Debug, Deserialize)]
struct BinanceDepthUpdate {
    #[serde(rename = "lastUpdateId")]
    last_update_id: u64,
    bids: Vec<(String, String)>,
    asks: Vec<(String, String)>,
}

#[derive(Debug, Deserialize)]
struct BinanceTrade {
    #[serde(rename = "t")]
    trade_id: u64,
    #[serde(rename = "p")]
    price: String,
    #[serde(rename = "q")]
    quantity: String,
    #[serde(rename = "T")]
    timestamp: u64,
    #[serde(rename = "m")]
    is_buyer_maker: bool,
}

#[derive(Debug, Deserialize)]
struct BinanceTicker {
    #[serde(rename = "s")]
    symbol: String,
    #[serde(rename = "c")]
    price: String,
    #[serde(rename = "p")]
    price_change: String,
    #[serde(rename = "P")]
    price_change_percent: String,
    #[serde(rename = "h")]
    high_24h: String,
    #[serde(rename = "l")]
    low_24h: String,
    #[serde(rename = "v")]
    volume_24h: String,
    #[serde(rename = "q")]
    quote_volume_24h: String,
}

#[derive(Debug, Deserialize)]
struct BinanceKline {
    #[serde(rename = "s")]
    symbol: String,
    #[serde(rename = "k")]
    kline: BinanceKlineData,
}

#[derive(Debug, Deserialize)]
struct BinanceKlineData {
    #[serde(rename = "t")]
    start_time: u64,
    #[serde(rename = "T")]
    close_time: u64,
    #[serde(rename = "i")]
    interval: String,
    #[serde(rename = "o")]
    open: String,
    #[serde(rename = "h")]
    high: String,
    #[serde(rename = "l")]
    low: String,
    #[serde(rename = "c")]
    close: String,
    #[serde(rename = "v")]
    volume: String,
    #[serde(rename = "x")]
    is_final: bool,
}

pub struct BinanceClient {
    ws_url: String,
    senders: Arc<Mutex<HashMap<String, broadcast::Sender<ExchangeMessage>>>>,
}

impl BinanceClient {
    pub fn new(ws_url: String) -> Self {
        Self {
            ws_url,
            senders: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    fn parse_price(s: &str) -> Decimal {
        s.parse::<Decimal>().unwrap_or_default()
    }
}

#[async_trait]
impl ExchangeClient for BinanceClient {
    async fn connect(&self, symbol: String) -> Result<broadcast::Receiver<ExchangeMessage>, Box<dyn std::error::Error>> {
        info!("Connecting to Binance for symbol: {}", symbol);

        let mut senders = self.senders.lock().await;
        if let Some(sender) = senders.get(&symbol) {
            return Ok(sender.subscribe());
        }

        let (tx, rx) = broadcast::channel(1024);
        senders.insert(symbol.clone(), tx.clone());

        let ws_url = self.ws_url.clone();
        let symbol_lower = symbol.to_lowercase();

        tokio::spawn(async move {
            let streams = format!(
                "{}@depth@100ms/{}@trade/{}@ticker/{}@kline_1m",
                symbol_lower, symbol_lower, symbol_lower, symbol_lower
            );
            let url = format!("{}/{}", ws_url, streams);

            loop {
                match connect_async(&url).await {
                    Ok((ws_stream, _)) => {
                        info!("Connected to Binance WebSocket for {}", symbol);
                        let (mut write, mut read) = ws_stream.split();

                        loop {
                            tokio::select! {
                                msg = read.next() => {
                                    match msg {
                                        Some(Ok(Message::Text(text))) => {
                                            if let Ok(depth) = serde_json::from_str::<BinanceDepthUpdate>(&text) {
                                                let bids: Vec<(Decimal, Decimal)> = depth.bids
                                                    .iter()
                                                    .map(|(p, q)| (Self::parse_price(p), Self::parse_price(q)))
                                                    .collect();
                                                let asks: Vec<(Decimal, Decimal)> = depth.asks
                                                    .iter()
                                                    .map(|(p, q)| (Self::parse_price(p), Self::parse_price(q)))
                                                    .collect();

                                                let snapshot = OrderBookSnapshot {
                                                    symbol: symbol.clone(),
                                                    last_update_id: depth.last_update_id,
                                                    bids,
                                                    asks,
                                                    timestamp: std::time::SystemTime::now()
                                                        .duration_since(std::time::UNIX_EPOCH)
                                                        .unwrap()
                                                        .as_millis() as u64,
                                                };
                                                let _ = tx.send(ExchangeMessage::Depth(snapshot));
                                            } else if let Ok(trade) = serde_json::from_str::<BinanceTrade>(&text) {
                                                let trade_data = TradeData {
                                                    symbol: symbol.clone(),
                                                    trade_id: trade.trade_id,
                                                    price: Self::parse_price(&trade.price),
                                                    quantity: Self::parse_price(&trade.quantity),
                                                    timestamp: trade.timestamp,
                                                    is_buyer_maker: trade.is_buyer_maker,
                                                };
                                                let _ = tx.send(ExchangeMessage::Trade(trade_data));
                                            } else if let Ok(ticker) = serde_json::from_str::<BinanceTicker>(&text) {
                                                let ticker_data = TickerData {
                                                    symbol: ticker.symbol,
                                                    price: Self::parse_price(&ticker.price),
                                                    price_change: Self::parse_price(&ticker.price_change),
                                                    price_change_percent: Self::parse_price(&ticker.price_change_percent),
                                                    high_24h: Self::parse_price(&ticker.high_24h),
                                                    low_24h: Self::parse_price(&ticker.low_24h),
                                                    volume_24h: Self::parse_price(&ticker.volume_24h),
                                                    quote_volume_24h: Self::parse_price(&ticker.quote_volume_24h),
                                                    timestamp: std::time::SystemTime::now()
                                                        .duration_since(std::time::UNIX_EPOCH)
                                                        .unwrap()
                                                        .as_millis() as u64,
                                                };
                                                let _ = tx.send(ExchangeMessage::Ticker(ticker_data));
                                            } else if let Ok(kline) = serde_json::from_str::<BinanceKline>(&text) {
                                                let kline_data = KlineData {
                                                    symbol: kline.symbol,
                                                    interval: kline.kline.interval,
                                                    start_time: kline.kline.start_time,
                                                    open: Self::parse_price(&kline.kline.open),
                                                    high: Self::parse_price(&kline.kline.high),
                                                    low: Self::parse_price(&kline.kline.low),
                                                    close: Self::parse_price(&kline.kline.close),
                                                    volume: Self::parse_price(&kline.kline.volume),
                                                    is_final: kline.kline.is_final,
                                                };
                                                let _ = tx.send(ExchangeMessage::Kline(kline_data));
                                            }
                                        }
                                        Some(Ok(Message::Close(_))) => {
                                            warn!("Binance WebSocket closed for {}", symbol);
                                            break;
                                        }
                                        Some(Err(e)) => {
                                            error!("Binance WebSocket error for {}: {}", symbol, e);
                                            break;
                                        }
                                        None => {
                                            warn!("Binance WebSocket stream ended for {}", symbol);
                                            break;
                                        }
                                        _ => {}
                                    }
                                }
                            }
                        }
                    }
                    Err(e) => {
                        error!("Failed to connect to Binance for {}: {}", symbol, e);
                        tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                    }
                }
            }
        });

        Ok(rx)
    }

    fn name(&self) -> &str {
        "binance"
    }
}
