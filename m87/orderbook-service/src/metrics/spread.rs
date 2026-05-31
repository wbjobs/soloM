use rust_decimal::Decimal;
use rust_decimal_macros::dec;

pub struct SpreadMetrics {
    pub absolute: Decimal,
    pub percent: Decimal,
    pub bps: u32,
}

pub fn calculate_spread_metrics(best_bid: Decimal, best_ask: Decimal) -> Option<SpreadMetrics> {
    if best_bid <= dec!(0) || best_ask <= dec!(0) || best_bid >= best_ask {
        return None;
    }

    let absolute = best_ask - best_bid;
    let mid = (best_bid + best_ask) / dec!(2);
    let percent = (absolute / mid) * dec!(100);
    let bps = (percent * dec!(100)).round().to_u32().unwrap_or(0);

    Some(SpreadMetrics {
        absolute,
        percent,
        bps,
    })
}

pub fn calculate_slippage(execution_price: Decimal, mid_price: Decimal, is_buy: bool) -> Decimal {
    if mid_price == dec!(0) {
        return dec!(0);
    }

    if is_buy {
        ((execution_price - mid_price) / mid_price) * dec!(10000)
    } else {
        ((mid_price - execution_price) / mid_price) * dec!(10000)
    }
}
