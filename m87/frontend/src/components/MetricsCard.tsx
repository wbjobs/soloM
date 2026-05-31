import React from 'react'
import { useOrderBook } from '../hooks/useOrderBook'
import { formatPrice, formatQuantity, formatPercent } from '../utils/d3Helpers'

interface MetricItemProps {
  label: string
  value: string
  subValue?: string
  color?: string
}

const MetricItem: React.FC<MetricItemProps> = ({ label, value, subValue, color = 'text-text-primary' }) => (
  <div className="bg-bg-dark rounded-lg p-4 border border-border-dark">
    <div className="text-xs text-text-secondary mb-2">{label}</div>
    <div className={`font-mono text-xl font-semibold ${color}`}>{value}</div>
    {subValue && <div className="text-xs text-text-secondary mt-1">{subValue}</div>}
  </div>
)

const MetricsCard: React.FC = () => {
  const { spread, marketDepth, orderBook } = useOrderBook()

  if (!orderBook) {
    return (
      <div className="bg-bg-card rounded-xl p-6 border border-border-dark">
        <h3 className="text-lg font-semibold text-text-primary mb-4">市场指标</h3>
        <div className="flex items-center justify-center h-48">
          <div className="text-text-secondary">等待数据连接...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-bg-card rounded-xl p-6 border border-border-dark">
      <h3 className="text-lg font-semibold text-text-primary mb-4">市场指标</h3>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-2 gap-4">
        <MetricItem
          label="买卖价差"
          value={spread ? `$${formatPrice(spread.spread)}` : '--'}
          subValue={spread ? `${formatPercent(spread.spreadPercent)}` : '--'}
          color={spread && spread.spreadBps < 10 ? 'text-buy-green' : 'text-sell-red'}
        />

        <MetricItem
          label="价差 (BPS)"
          value={spread ? spread.spreadBps.toString() : '--'}
          subValue="基点"
          color={spread && spread.spreadBps < 10 ? 'text-buy-green' : 'text-sell-red'}
        />

        <MetricItem
          label="买盘深度 (10档)"
          value={marketDepth ? formatQuantity(marketDepth.bidDepth, 2) : '--'}
          subValue="BTC"
          color="text-buy-green"
        />

        <MetricItem
          label="卖盘深度 (10档)"
          value={marketDepth ? formatQuantity(marketDepth.askDepth, 2) : '--'}
          subValue="BTC"
          color="text-sell-red"
        />

        <MetricItem
          label="深度比值"
          value={marketDepth ? formatPrice(marketDepth.depthRatio, 2) : '--'}
          subValue="买/卖"
          color={marketDepth && marketDepth.depthRatio >= 1 ? 'text-buy-green' : 'text-sell-red'}
        />

        <MetricItem
          label="中间价"
          value={marketDepth ? `$${formatPrice(marketDepth.midPrice)}` : '--'}
          subValue="(买一+卖一)/2"
          color="text-info-blue"
        />
      </div>

      {marketDepth && (
        <div className="mt-4 pt-4 border-t border-border-dark">
          <div className="text-xs text-text-secondary mb-2">买卖盘深度对比</div>
          <div className="flex items-center gap-2 h-6">
            <div
              className="h-full rounded-l bg-buy-green transition-all duration-300"
              style={{
                width: `${Math.min(50, (marketDepth.depthRatio / (1 + marketDepth.depthRatio)) * 100)}%`,
              }}
            />
            <div
              className="h-full rounded-r bg-sell-red transition-all duration-300"
              style={{
                width: `${Math.min(50, (1 / (1 + marketDepth.depthRatio)) * 100)}%`,
              }}
            />
          </div>
          <div className="flex justify-between text-xs mt-1">
            <span className="text-buy-green">买盘 {formatPercent(Math.min(100, (marketDepth.depthRatio / (1 + marketDepth.depthRatio)) * 100), 0)}</span>
            <span className="text-sell-red">卖盘 {formatPercent(Math.min(100, (1 / (1 + marketDepth.depthRatio)) * 100), 0)}</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default MetricsCard
