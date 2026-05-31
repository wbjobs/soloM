use rust_decimal::Decimal;
use rust_decimal_macros::dec;

use crate::orderbook::calculator::{DepthResult, PriceLevel};

pub struct DepthMetrics {
    pub total_bid: Decimal,
    pub total_ask: Decimal,
    pub depth_ratio: Decimal,
    pub bid_vwap: Decimal,
    pub ask_vwap: Decimal,
    pub imbalance: Decimal,
}

pub fn calculate_depth_metrics(depth: &DepthResult) -> DepthMetrics {
    let bid_vwap = calculate_vwap(&depth.bid_levels);
    let ask_vwap = calculate_vwap(&depth.ask_levels);
    
    let total_depth = depth.total_bid + depth.total_ask;
    let imbalance = if total_depth != dec!(0) {
        (depth.total_bid - depth.total_ask) / total_depth * dec!(100)
    } else {
        dec!(0)
    };

    DepthMetrics {
        total_bid: depth.total_bid,
        total_ask: depth.total_ask,
        depth_ratio: depth.depth_ratio,
        bid_vwap,
        ask_vwap,
        imbalance,
    }
}

fn calculate_vwap(levels: &[PriceLevel]) -> Decimal {
    if levels.is_empty() {
        return Decimal::ZERO;
    }

    let mut total_value = Decimal::ZERO;
    let mut total_quantity = Decimal::ZERO;

    for level in levels {
        total_value += level.price * level.quantity;
        total_quantity += level.quantity;
    }

    if total_quantity != Decimal::ZERO {
        total_value / total_quantity
    } else {
        Decimal::ZERO
    }
}

pub fn calculate_market_depth_ratio(total_bid: Decimal, total_ask: Decimal) -> Decimal {
    if total_ask == dec!(0) {
        dec!(0)
    } else {
        total_bid / total_ask
    }
}
