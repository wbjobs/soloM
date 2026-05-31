pub mod spread;
pub mod depth;

pub use spread::calculate_spread_metrics;
pub use depth::calculate_depth_metrics;

use rust_decimal::Decimal;
use crate::models::MarketMetrics;
use crate::orderbook::OrderBook;

pub fn calculate_market_metrics(book: &OrderBook, depth_levels: usize) -> Option<MarketMetrics> {
    let mid_price = book.get_mid_price()?;
    let spread = book.get_spread()?;
    let spread_bps = book.get_spread_bps()?;
    let depth = book.get_depth(depth_levels);

    Some(MarketMetrics {
        symbol: book.symbol.clone(),
        mid_price,
        spread,
        spread_bps,
        bid_depth: depth.total_bid,
        ask_depth: depth.total_ask,
        depth_ratio: depth.depth_ratio,
        timestamp: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64,
    })
}
