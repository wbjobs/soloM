use rust_decimal::Decimal;
use rust_decimal_macros::dec;
use std::collections::BTreeMap;
use tracing::debug;

use crate::models::OrderBookSnapshot;
use crate::orderbook::calculator::{DepthResult, PriceLevel};

#[derive(Debug, Clone)]
pub struct OrderBook {
    pub symbol: String,
    pub last_update_id: u64,
    pub bids: BTreeMap<Decimal, Decimal>,
    pub asks: BTreeMap<Decimal, Decimal>,
    max_levels: usize,
}

impl OrderBook {
    pub fn new(symbol: String, max_levels: usize) -> Self {
        Self {
            symbol,
            last_update_id: 0,
            bids: BTreeMap::new(),
            asks: BTreeMap::new(),
            max_levels,
        }
    }

    pub fn update(&mut self, bids: Vec<(Decimal, Decimal)>, asks: Vec<(Decimal, Decimal)>, update_id: u64) {
        if update_id <= self.last_update_id {
            debug!("Skipping outdated update for {}: {} <= {}", self.symbol, update_id, self.last_update_id);
            return;
        }

        for (price, quantity) in bids {
            if quantity == dec!(0) {
                self.bids.remove(&price);
            } else {
                self.bids.insert(price, quantity);
            }
        }

        for (price, quantity) in asks {
            if quantity == dec!(0) {
                self.asks.remove(&price);
            } else {
                self.asks.insert(price, quantity);
            }
        }

        self.trim_levels();
        self.last_update_id = update_id;
    }

    fn trim_levels(&mut self) {
        while self.bids.len() > self.max_levels {
            let lowest_bid = *self.bids.keys().next().unwrap();
            self.bids.remove(&lowest_bid);
        }
        while self.asks.len() > self.max_levels {
            let highest_ask = *self.asks.keys().next_back().unwrap();
            self.asks.remove(&highest_ask);
        }
    }

    pub fn get_best_bid(&self) -> Option<Decimal> {
        self.bids.keys().next_back().copied()
    }

    pub fn get_best_ask(&self) -> Option<Decimal> {
        self.asks.keys().next().copied()
    }

    pub fn get_mid_price(&self) -> Option<Decimal> {
        match (self.get_best_bid(), self.get_best_ask()) {
            (Some(bid), Some(ask)) => Some((bid + ask) / dec!(2)),
            _ => None,
        }
    }

    pub fn get_spread(&self) -> Option<Decimal> {
        match (self.get_best_bid(), self.get_best_ask()) {
            (Some(bid), Some(ask)) => Some(ask - bid),
            _ => None,
        }
    }

    pub fn get_spread_percent(&self) -> Option<Decimal> {
        match (self.get_spread(), self.get_mid_price()) {
            (Some(spread), Some(mid)) if mid != dec!(0) => {
                Some((spread / mid) * dec!(100))
            }
            _ => None,
        }
    }

    pub fn get_spread_bps(&self) -> Option<u32> {
        self.get_spread_percent().map(|p| (p * dec!(100)).round().to_u32().unwrap_or(0))
    }

    pub fn get_depth(&self, levels: usize) -> DepthResult {
        let mut bid_levels: Vec<PriceLevel> = Vec::new();
        let mut ask_levels: Vec<PriceLevel> = Vec::new();
        let mut total_bid = dec!(0);
        let mut total_ask = dec!(0);

        for (i, (price, quantity)) in self.bids.iter().rev().take(levels).enumerate() {
            total_bid += quantity;
            bid_levels.push(PriceLevel {
                price: *price,
                quantity: *quantity,
                cumulative: total_bid,
            });
        }

        for (i, (price, quantity)) in self.asks.iter().take(levels).enumerate() {
            total_ask += quantity;
            ask_levels.push(PriceLevel {
                price: *price,
                quantity: *quantity,
                cumulative: total_ask,
            });
        }

        let depth_ratio = if total_ask != dec!(0) {
            total_bid / total_ask
        } else {
            dec!(0)
        };

        DepthResult {
            bid_levels,
            ask_levels,
            total_bid,
            total_ask,
            depth_ratio,
        }
    }

    pub fn to_snapshot(&self) -> OrderBookSnapshot {
        let bids: Vec<(Decimal, Decimal)> = self
            .bids
            .iter()
            .rev()
            .take(self.max_levels)
            .map(|(p, q)| (*p, *q))
            .collect();

        let asks: Vec<(Decimal, Decimal)> = self
            .asks
            .iter()
            .take(self.max_levels)
            .map(|(p, q)| (*p, *q))
            .collect();

        OrderBookSnapshot {
            symbol: self.symbol.clone(),
            last_update_id: self.last_update_id,
            bids,
            asks,
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64,
        }
    }
}
