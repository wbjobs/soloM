export interface TickerData {
  symbol: string;
  price: string;
  priceChange: string;
  priceChangePercent: string;
  high24h: string;
  low24h: string;
  volume24h: string;
  quoteVolume24h: string;
  timestamp: number;
}

export interface OrderBookSnapshot {
  symbol: string;
  lastUpdateId: number;
  bids: [string, string][];
  asks: [string, string][];
  spread: string;
  spreadPercent: string;
  timestamp: number;
}

export interface KlineData {
  symbol: string;
  interval: string;
  startTime: number;
  closeTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  isFinal: boolean;
}

export interface TradeData {
  symbol: string;
  tradeId: number;
  price: string;
  quantity: string;
  timestamp: number;
  isBuyerMaker: boolean;
}

export interface MarketMetrics {
  symbol: string;
  bidDepth10: string;
  askDepth10: string;
  depthRatio: string;
  spreadBps: number;
  midPrice: string;
  timestamp: number;
}

export interface VwapData {
  symbol: string;
  vwap: string;
  cumulativeVolume: string;
  cumulativeValue: string;
  tradeCount: number;
  timestamp: number;
}

export interface BollingerBandsData {
  time: number;
  middle: number;
  upper: number;
  lower: number;
  width: number;
  percentB: number;
}

export type WebSocketMessageType = 
  | { type: 'ticker'; data: TickerData }
  | { type: 'depth'; data: OrderBookSnapshot }
  | { type: 'kline'; data: KlineData }
  | { type: 'trade'; data: TradeData }
  | { type: 'metrics'; data: MarketMetrics }
  | { type: 'vwap'; data: VwapData };

export interface SubscribeMessage {
  type: 'subscribe';
  symbol: string;
  channels: readonly ('trade' | 'depth' | 'kline' | 'ticker' | 'metrics' | 'vwap')[];
  klineInterval?: '1m' | '5m' | '15m' | '1h';
}

export interface UnsubscribeMessage {
  type: 'unsubscribe';
  symbol: string;
  channels: string[];
}

export interface PriceLevel {
  price: number;
  quantity: number;
  cumulative: number;
}

export interface DepthChartData {
  bids: PriceLevel[];
  asks: PriceLevel[];
}

export interface KlineChartData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
