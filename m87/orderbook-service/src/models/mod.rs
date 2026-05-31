use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PriceLevel {
    pub price: Decimal,
    pub quantity: Decimal,
    pub cumulative: Decimal,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderBookSnapshot {
    pub symbol: String,
    pub last_update_id: u64,
    pub bids: Vec<(Decimal, Decimal)>,
    pub asks: Vec<(Decimal, Decimal)>,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarketMetrics {
    pub symbol: String,
    pub mid_price: Decimal,
    pub spread: Decimal,
    pub spread_bps: u32,
    pub bid_depth: Decimal,
    pub ask_depth: Decimal,
    pub depth_ratio: Decimal,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KlineData {
    pub symbol: String,
    pub interval: String,
    pub start_time: u64,
    pub open: Decimal,
    pub high: Decimal,
    pub low: Decimal,
    pub close: Decimal,
    pub volume: Decimal,
    pub is_final: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TradeData {
    pub symbol: String,
    #[serde(rename = "tradeId")]
    pub trade_id: u64,
    pub price: Decimal,
    pub quantity: Decimal,
    pub timestamp: u64,
    #[serde(rename = "isBuyerMaker")]
    pub is_buyer_maker: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TickerData {
    pub symbol: String,
    pub price: Decimal,
    pub price_change: Decimal,
    pub price_change_percent: Decimal,
    pub high_24h: Decimal,
    pub low_24h: Decimal,
    pub volume_24h: Decimal,
    pub quote_volume_24h: Decimal,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VwapData {
    pub symbol: String,
    pub vwap: Decimal,
    #[serde(rename = "cumulativeVolume")]
    pub cumulative_volume: Decimal,
    #[serde(rename = "cumulativeValue")]
    pub cumulative_value: Decimal,
    #[serde(rename = "tradeCount")]
    pub trade_count: u64,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum WebSocketMessage {
    Ticker(TickerData),
    Depth(OrderBookSnapshot),
    Kline(KlineData),
    Trade(TradeData),
    Metrics(MarketMetrics),
    Vwap(VwapData),
}

#[derive(Debug, Clone, Deserialize)]
pub struct SubscribeMessage {
    #[serde(rename = "type")]
    pub msg_type: String,
    pub symbol: String,
    pub channels: Vec<String>,
    #[serde(default)]
    pub kline_interval: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UnsubscribeMessage {
    #[serde(rename = "type")]
    pub msg_type: String,
    pub symbol: String,
    pub channels: Vec<String>,
}
