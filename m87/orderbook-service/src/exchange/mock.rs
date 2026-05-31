use async_trait::async_trait;
use rust_decimal::Decimal;
use rust_decimal_macros::dec;
use std::collections::VecDeque;
use std::sync::Arc;
use tokio::sync::{broadcast, Mutex};
use tokio::time::{self, Duration};
use tracing::info;

use crate::exchange::{ExchangeClient, ExchangeMessage};
use crate::models::{KlineData, OrderBookSnapshot, TradeData, TickerData};

#[derive(Clone)]
pub struct MockExchangeClient {
    base_price: Decimal,
    symbols: Vec<String>,
    senders: Arc<Mutex<std::collections::HashMap<String, broadcast::Sender<ExchangeMessage>>>>,
}

impl MockExchangeClient {
    pub fn new(base_price: Decimal, symbols: Vec<String>) -> Self {
        Self {
            base_price,
            symbols,
            senders: Arc::new(Mutex::new(std::collections::HashMap::new())),
        }
    }

    fn generate_depth(&self, base_price: Decimal, symbol: String, update_id: u64) -> OrderBookSnapshot {
        let mut bids = Vec::new();
        let mut asks = Vec::new();

        for i in 0..20 {
            let bid_price = base_price - Decimal::from(i) * dec!(0.1);
            let bid_qty = Decimal::from(rand::random::<u32>() % 1000) / dec!(100) + dec!(0.1);
            bids.push((bid_price.round_dp(2), bid_qty.round_dp(4)));

            let ask_price = base_price + Decimal::from(i + 1) * dec!(0.1);
            let ask_qty = Decimal::from(rand::random::<u32>() % 1000) / dec!(100) + dec!(0.1);
            asks.push((ask_price.round_dp(2), ask_qty.round_dp(4)));
        }

        OrderBookSnapshot {
            symbol,
            last_update_id: update_id,
            bids,
            asks,
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64,
        }
    }

    fn generate_trade(&self, base_price: Decimal, symbol: String, trade_id: u64) -> TradeData {
        let price_variation = Decimal::from(rand::random::<i32>() % 100) / dec!(100) - dec!(0.5);
        let price = base_price + price_variation;
        let quantity = Decimal::from(rand::random::<u32>() % 500) / dec!(100) + dec!(0.01);
        let is_buyer_maker = rand::random::<bool>();

        TradeData {
            symbol,
            trade_id,
            price: price.round_dp(2),
            quantity: quantity.round_dp(4),
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64,
            is_buyer_maker,
        }
    }

    fn generate_kline(&self, base_price: Decimal, symbol: String, start_time: u64, interval: String, is_final: bool) -> KlineData {
        let volatility = dec!(50);
        let open = base_price;
        let close = base_price + Decimal::from(rand::random::<i32>() % 100) / dec!(10) - dec!(5);
        let high = open.max(close) + Decimal::from(rand::random::<u32>() % 50) / dec!(10);
        let low = open.min(close) - Decimal::from(rand::random::<u32>() % 50) / dec!(10);
        let volume = Decimal::from(rand::random::<u32>() % 10000) / dec!(100) + dec!(10);

        KlineData {
            symbol,
            interval,
            start_time,
            open: open.round_dp(2),
            high: high.round_dp(2),
            low: low.round_dp(2),
            close: close.round_dp(2),
            volume: volume.round_dp(4),
            is_final,
        }
    }

    fn generate_ticker(&self, base_price: Decimal, symbol: String) -> TickerData {
        let price_change = Decimal::from(rand::random::<i32>() % 2000) / dec!(100) - dec!(10);
        let price_change_percent = (price_change / base_price) * dec!(100);
        let high_24h = base_price + dec!(100);
        let low_24h = base_price - dec!(100);
        let volume_24h = Decimal::from(rand::random::<u64>() % 100000) / dec!(100) + dec!(1000);
        let quote_volume_24h = volume_24h * base_price;

        TickerData {
            symbol,
            price: base_price.round_dp(2),
            price_change: price_change.round_dp(2),
            price_change_percent: price_change_percent.round_dp(2),
            high_24h: high_24h.round_dp(2),
            low_24h: low_24h.round_dp(2),
            volume_24h: volume_24h.round_dp(4),
            quote_volume_24h: quote_volume_24h.round_dp(2),
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64,
        }
    }
}

#[async_trait]
impl ExchangeClient for MockExchangeClient {
    async fn connect(&self, symbol: String) -> Result<broadcast::Receiver<ExchangeMessage>, Box<dyn std::error::Error>> {
        info!("Connecting mock exchange for symbol: {}", symbol);

        let mut senders = self.senders.lock().await;
        if let Some(sender) = senders.get(&symbol) {
            return Ok(sender.subscribe());
        }

        let (tx, rx) = broadcast::channel(1024);
        senders.insert(symbol.clone(), tx.clone());

        let client = self.clone();
        let symbol_clone = symbol.clone();

        tokio::spawn(async move {
            let mut update_id: u64 = 0;
            let mut trade_id: u64 = 0;
            let mut current_price = client.base_price;
            let mut kline_start = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64;
            let mut kline_count = 0;

            let mut price_history: VecDeque<Decimal> = VecDeque::new();
            price_history.push_back(current_price);

            loop {
                time::sleep(Duration::from_millis(100)).await;

                let price_change = Decimal::from(rand::random::<i32>() % 20) / dec!(100) - dec!(0.1);
                current_price = current_price + price_change;
                if current_price < dec!(1000) {
                    current_price = dec!(1000);
                }

                price_history.push_back(current_price);
                if price_history.len() > 100 {
                    price_history.pop_front();
                }

                update_id += 1;
                let depth = client.generate_depth(current_price, symbol_clone.clone(), update_id);
                let _ = tx.send(ExchangeMessage::Depth(depth));

                trade_id += 1;
                let trade = client.generate_trade(current_price, symbol_clone.clone(), trade_id);
                let _ = tx.send(ExchangeMessage::Trade(trade));

                if update_id % 10 == 0 {
                    let ticker = client.generate_ticker(current_price, symbol_clone.clone());
                    let _ = tx.send(ExchangeMessage::Ticker(ticker));
                }

                if update_id % 60 == 0 {
                    kline_count += 1;
                    let is_final = kline_count % 60 == 0;
                    let kline = client.generate_kline(
                        current_price,
                        symbol_clone.clone(),
                        kline_start,
                        "1m".to_string(),
                        is_final,
                    );
                    let _ = tx.send(ExchangeMessage::Kline(kline));

                    if is_final {
                        kline_start = std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap()
                            .as_millis() as u64;
                    }
                }
            }
        });

        Ok(rx)
    }

    fn name(&self) -> &str {
        "mock"
    }
}
