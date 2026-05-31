import React, { useEffect, useState } from 'react'
import { useMarketStore } from '../store/marketStore'
import { formatPrice, formatPercent, formatQuantity } from '../utils/d3Helpers'

const PriceTicker: React.FC = () => {
  const ticker = useMarketStore((state) => state.ticker)
  const orderBook = useMarketStore((state) => state.orderBook)
  const priceDirection = useMarketStore((state) => state.priceDirection)
  const connectionStatus = useMarketStore((state) => state.connectionStatus)
  const [flashClass, setFlashClass] = useState('')

  useEffect(() => {
    if (ticker) {
      setFlashClass(priceDirection === 'up' ? 'price-flash-up' : priceDirection === 'down' ? 'price-flash-down' : '')
      const timer = setTimeout(() => setFlashClass(''), 500)
      return () => clearTimeout(timer)
    }
  }, [ticker?.price, priceDirection])

  const statusColor = {
    connected: 'bg-buy-green',
    connecting: 'bg-yellow-500',
    disconnected: 'bg-sell-red',
    error: 'bg-sell-red',
  }

  const bestBid = orderBook?.bids?.[0]?.[0]
  const bestAsk = orderBook?.asks?.[0]?.[0]

  return (
    <div className="bg-bg-card rounded-xl p-6 border border-border-dark">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-text-primary">BTC/USDT</h2>
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${statusColor[connectionStatus]} animate-pulse`} />
            <span className="text-xs text-text-secondary capitalize">{connectionStatus}</span>
          </div>
        </div>
      </div>

      {ticker ? (
        <div className="space-y-4">
          <div className="flex items-end gap-4">
            <div className={`font-mono text-4xl font-bold ${flashClass} ${
              priceDirection === 'up' ? 'text-buy-green' : priceDirection === 'down' ? 'text-sell-red' : 'text-text-primary'
            }`}>
              ${formatPrice(parseFloat(ticker.price))}
            </div>
            <div className={`font-mono text-lg ${
              parseFloat(ticker.priceChangePercent) >= 0 ? 'text-buy-green' : 'text-sell-red'
            }`}>
              {formatPercent(parseFloat(ticker.priceChangePercent))}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-border-dark">
            <div>
              <div className="text-xs text-text-secondary mb-1">24h 最高</div>
              <div className="font-mono text-buy-green">${formatPrice(parseFloat(ticker.high24h))}</div>
            </div>
            <div>
              <div className="text-xs text-text-secondary mb-1">24h 最低</div>
              <div className="font-mono text-sell-red">${formatPrice(parseFloat(ticker.low24h))}</div>
            </div>
            <div>
              <div className="text-xs text-text-secondary mb-1">24h 成交量</div>
              <div className="font-mono text-text-primary">{formatQuantity(parseFloat(ticker.volume24h), 2)} BTC</div>
            </div>
            <div>
              <div className="text-xs text-text-secondary mb-1">24h 成交额</div>
              <div className="font-mono text-text-primary">${formatQuantity(parseFloat(ticker.quoteVolume24h), 2)}</div>
            </div>
          </div>

          {bestBid && bestAsk && (
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border-dark">
              <div className="p-3 rounded-lg bg-buy-green/10 border border-buy-green/20">
                <div className="text-xs text-text-secondary mb-1">买一价</div>
                <div className="font-mono text-xl text-buy-green">${formatPrice(parseFloat(bestBid))}</div>
              </div>
              <div className="p-3 rounded-lg bg-sell-red/10 border border-sell-red/20">
                <div className="text-xs text-text-secondary mb-1">卖一价</div>
                <div className="font-mono text-xl text-sell-red">${formatPrice(parseFloat(bestAsk))}</div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-center h-48">
          <div className="text-text-secondary">等待数据连接...</div>
        </div>
      )}
    </div>
  )
}

export default PriceTicker
