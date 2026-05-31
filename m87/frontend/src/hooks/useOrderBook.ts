import { useMemo } from 'react'
import { useMarketStore } from '../store/marketStore'
import { PriceLevel, DepthChartData } from '../types/market'

export const useOrderBook = () => {
  const orderBook = useMarketStore((state) => state.orderBook)
  const ticker = useMarketStore((state) => state.ticker)
  const metrics = useMarketStore((state) => state.metrics)

  const spread = useMemo(() => {
    if (!orderBook || !orderBook.bids.length || !orderBook.asks.length) return null
    const bestBid = parseFloat(orderBook.bids[0][0])
    const bestAsk = parseFloat(orderBook.asks[0][0])
    const spread = bestAsk - bestBid
    const spreadPercent = (spread / ((bestBid + bestAsk) / 2)) * 100
    return {
      spread: Math.round(spread * 100) / 100,
      spreadPercent: Math.round(spreadPercent * 10000) / 10000,
      spreadBps: Math.round(spreadPercent * 100),
    }
  }, [orderBook])

  const depthChartData = useMemo<DepthChartData | null>(() => {
    if (!orderBook) return null

    const bids: PriceLevel[] = orderBook.bids.map(([price, quantity], index, arr) => {
      const cumulative = arr
        .slice(0, index + 1)
        .reduce((sum, [, qty]) => sum + parseFloat(qty), 0)
      return {
        price: parseFloat(price),
        quantity: parseFloat(quantity),
        cumulative: Math.round(cumulative * 10000) / 10000,
      }
    })

    const asks: PriceLevel[] = orderBook.asks.map(([price, quantity], index, arr) => {
      const cumulative = arr
        .slice(0, index + 1)
        .reduce((sum, [, qty]) => sum + parseFloat(qty), 0)
      return {
        price: parseFloat(price),
        quantity: parseFloat(quantity),
        cumulative: Math.round(cumulative * 10000) / 10000,
      }
    })

    return { bids, asks }
  }, [orderBook])

  const marketDepth = useMemo(() => {
    if (!metrics) return null
    return {
      bidDepth: parseFloat(metrics.bidDepth10 || '0'),
      askDepth: parseFloat(metrics.askDepth10 || '0'),
      depthRatio: parseFloat(metrics.depthRatio || '0'),
      spreadBps: metrics.spreadBps,
      midPrice: parseFloat(metrics.midPrice || '0'),
    }
  }, [metrics])

  return {
    orderBook,
    ticker,
    metrics,
    spread,
    depthChartData,
    marketDepth,
  }
}
