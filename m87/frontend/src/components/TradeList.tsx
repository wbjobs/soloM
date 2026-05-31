import React from 'react'
import { useMarketStore } from '../store/marketStore'
import { formatPrice, formatQuantity, formatTime } from '../utils/d3Helpers'

const TradeList: React.FC = () => {
  const trades = useMarketStore((state) => state.trades)

  return (
    <div className="bg-bg-card rounded-xl p-4 border border-border-dark h-full flex flex-col">
      <h3 className="text-lg font-semibold text-text-primary mb-4">最新成交</h3>

      <div className="flex-1 overflow-hidden">
        <div className="grid grid-cols-4 text-xs text-text-secondary pb-2 border-b border-border-dark mb-2 font-mono">
          <span>时间</span>
          <span className="text-right">价格</span>
          <span className="text-right">数量</span>
          <span className="text-right">总额</span>
        </div>

        <div className="overflow-y-auto h-[calc(100%-2rem)] space-y-1">
          {trades.length > 0 ? (
            trades.map((trade, index) => {
              const price = parseFloat(trade.price)
              const quantity = parseFloat(trade.quantity)
              const total = price * quantity
              const isBuy = !trade.isBuyerMaker

              return (
                <div
                  key={`${trade.tradeId}-${index}`}
                  className={`grid grid-cols-4 text-xs py-1.5 px-1 rounded font-mono transition-all ${
                    index === 0 ? (isBuy ? 'animate-flash-green' : 'animate-flash-red') : ''
                  }`}
                >
                  <span className="text-text-secondary">{formatTime(trade.timestamp)}</span>
                  <span className={`text-right ${isBuy ? 'text-buy-green' : 'text-sell-red'}`}>
                    {formatPrice(price)}
                  </span>
                  <span className="text-right text-text-primary">{formatQuantity(quantity, 4)}</span>
                  <span className="text-right text-text-secondary">{formatQuantity(total, 2)}</span>
                </div>
              )
            })
          ) : (
            <div className="flex items-center justify-center h-32 text-text-secondary">暂无成交数据</div>
          )}
        </div>
      </div>
    </div>
  )
}

export default TradeList
