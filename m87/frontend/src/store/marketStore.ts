import { create } from 'zustand'
import {
  TickerData,
  OrderBookSnapshot,
  KlineData,
  TradeData,
  MarketMetrics,
  PriceLevel,
  KlineChartData,
  VwapData,
} from '../types/market'

interface MarketState {
  symbol: string
  ticker: TickerData | null
  orderBook: OrderBookSnapshot | null
  klines: KlineChartData[]
  trades: TradeData[]
  metrics: MarketMetrics | null
  vwap: VwapData | null
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error'
  lastPrice: number | null
  priceDirection: 'up' | 'down' | 'neutral'

  setSymbol: (symbol: string) => void
  setTicker: (ticker: TickerData) => void
  setOrderBook: (orderBook: OrderBookSnapshot) => void
  addKline: (kline: KlineData) => void
  addTrade: (trade: TradeData) => void
  setMetrics: (metrics: MarketMetrics) => void
  setVwap: (vwap: VwapData) => void
  setConnectionStatus: (status: MarketState['connectionStatus']) => void
  clearData: () => void
}

const calculateCumulative = (levels: [string, string][]): PriceLevel[] => {
  let cumulative = 0
  return levels.map(([price, quantity]) => {
    const qty = parseFloat(quantity)
    cumulative += qty
    return {
      price: parseFloat(price),
      quantity: qty,
      cumulative: Math.round(cumulative * 10000) / 10000,
    }
  })
}

export const useMarketStore = create<MarketState>((set, get) => ({
  symbol: 'btcusdt',
  ticker: null,
  orderBook: null,
  klines: [],
  trades: [],
  metrics: null,
  vwap: null,
  connectionStatus: 'disconnected',
  lastPrice: null,
  priceDirection: 'neutral',

  setSymbol: (symbol: string) => set({ symbol }),

  setTicker: (ticker: TickerData) => {
    const currentPrice = parseFloat(ticker.price)
    const { lastPrice } = get()
    const direction = lastPrice
      ? currentPrice > lastPrice
        ? 'up'
        : currentPrice < lastPrice
        ? 'down'
        : 'neutral'
      : 'neutral'

    set({
      ticker,
      lastPrice: currentPrice,
      priceDirection: direction,
    })
  },

  setOrderBook: (orderBook: OrderBookSnapshot) => {
    const processed = {
      ...orderBook,
      bids: calculateCumulative(orderBook.bids),
      asks: calculateCumulative(orderBook.asks),
    }
    set({ orderBook: processed as unknown as OrderBookSnapshot })
  },

  addKline: (kline: KlineData) => {
    const klineData: KlineChartData = {
      time: kline.startTime,
      open: parseFloat(kline.open),
      high: parseFloat(kline.high),
      low: parseFloat(kline.low),
      close: parseFloat(kline.close),
      volume: parseFloat(kline.volume),
    }

    set((state) => {
      const existingIndex = state.klines.findIndex((k) => k.time === klineData.time)
      let newKlines: KlineChartData[]

      if (existingIndex >= 0) {
        newKlines = [...state.klines]
        newKlines[existingIndex] = klineData
      } else {
        newKlines = [...state.klines, klineData]
        if (newKlines.length > 100) {
          newKlines = newKlines.slice(-100)
        }
      }

      return { klines: newKlines }
    })
  },

  addTrade: (trade: TradeData) => {
    set((state) => {
      const newTrades = [trade, ...state.trades].slice(0, 50)
      return { trades: newTrades }
    })
  },

  setMetrics: (metrics: MarketMetrics) => set({ metrics }),

  setVwap: (vwap: VwapData) => set({ vwap }),

  setConnectionStatus: (status) => {
    const current = get().connectionStatus
    if (current !== status) {
      set({ connectionStatus: status })
    }
  },

  clearData: () =>
    set({
      ticker: null,
      orderBook: null,
      klines: [],
      trades: [],
      metrics: null,
      vwap: null,
      lastPrice: null,
      priceDirection: 'neutral',
    }),
}))
