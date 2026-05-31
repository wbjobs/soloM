pub mod binance;
pub mod mock;

use async_trait::async_trait;
use tokio::sync::broadcast;

use crate::models::{KlineData, OrderBookSnapshot, TradeData, TickerData};

#[derive(Debug, Clone)]
pub enum ExchangeMessage {
    Depth(OrderBookSnapshot),
    Trade(TradeData),
    Kline(KlineData),
    Ticker(TickerData),
}

#[async_trait]
pub trait ExchangeClient: Send + Sync {
    async fn connect(&self, symbol: String) -> Result<broadcast::Receiver<ExchangeMessage>, Box<dyn std::error::Error>>;
    fn name(&self) -> &str;
}

pub use mock::MockExchangeClient;
pub use binance::BinanceClient;
