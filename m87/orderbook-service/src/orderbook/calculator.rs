use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PriceLevel {
    pub price: Decimal,
    pub quantity: Decimal,
    pub cumulative: Decimal,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DepthResult {
    pub bid_levels: Vec<PriceLevel>,
    pub ask_levels: Vec<PriceLevel>,
    pub total_bid: Decimal,
    pub total_ask: Decimal,
    pub depth_ratio: Decimal,
}

#[derive(Debug, Clone)]
pub struct VwapCalculator {
    window_size: Option<usize>,
    trades: VecDeque<(Decimal, Decimal, u64)>,
    cumulative_value: Decimal,
    cumulative_volume: Decimal,
    window_start_time: Option<u64>,
    window_duration_ms: Option<u64>,
}

impl VwapCalculator {
    pub fn new(window_size: Option<usize>, window_duration_ms: Option<u64>) -> Self {
        Self {
            window_size,
            trades: VecDeque::new(),
            cumulative_value: Decimal::ZERO,
            cumulative_volume: Decimal::ZERO,
            window_start_time: None,
            window_duration_ms,
        }
    }

    pub fn add_trade(&mut self, price: Decimal, quantity: Decimal, timestamp: u64) {
        if self.window_start_time.is_none() {
            self.window_start_time = Some(timestamp);
        }

        self.trades.push_back((price, quantity, timestamp));
        self.cumulative_value += price * quantity;
        self.cumulative_volume += quantity;

        if let Some(size) = self.window_size {
            while self.trades.len() > size {
                if let Some((old_price, old_qty, _)) = self.trades.pop_front() {
                    self.cumulative_value -= old_price * old_qty;
                    self.cumulative_volume -= old_qty;
                }
            }
        }

        if let Some(duration) = self.window_duration_ms {
            let cutoff = timestamp.saturating_sub(duration);
            while let Some(front) = self.trades.front() {
                if front.2 < cutoff {
                    if let Some((old_price, old_qty, _)) = self.trades.pop_front() {
                        self.cumulative_value -= old_price * old_qty;
                        self.cumulative_volume -= old_qty;
                    }
                } else {
                    break;
                }
            }
        }
    }

    pub fn calculate(&self) -> Decimal {
        if self.cumulative_volume != Decimal::ZERO && self.cumulative_volume != Decimal::ZERO {
            self.cumulative_value / self.cumulative_volume
        } else {
            Decimal::ZERO
        }
    }

    pub fn cumulative_volume(&self) -> Decimal {
        self.cumulative_volume
    }

    pub fn cumulative_value(&self) -> Decimal {
        self.cumulative_value
    }

    pub fn reset(&mut self) {
        self.trades.clear();
        self.cumulative_value = Decimal::ZERO;
        self.cumulative_volume = Decimal::ZERO;
        self.window_start_time = None;
    }
}

pub fn calculate_vwap(levels: &[PriceLevel]) -> Decimal {
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

pub fn calculate_liquidity_score(depth: &DepthResult, spread_bps: u32) -> Decimal {
    use rust_decimal_macros::dec;
    
    let avg_depth = (depth.total_bid + depth.total_ask) / dec!(2);
    let spread_factor = dec!(1) - Decimal::from(spread_bps) / dec!(10000);
    
    avg_depth * spread_factor
}
