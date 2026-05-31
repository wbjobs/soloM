import React, { useState, useEffect, useMemo } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import { useOrderBook } from '../hooks/useOrderBook'
import { useMarketStore } from '../store/marketStore'
import PriceTicker from '../components/PriceTicker'
import DepthChart from '../components/DepthChart'
import KlineChart from '../components/KlineChart'
import TradeList from '../components/TradeList'
import MetricsCard from '../components/MetricsCard'
import { PriceLevel } from '../types/market'

const mockPrice = 50000

const generateMockKlineChartData = () => {
  const data = []
  let price = mockPrice
  const now = Date.now()
  
  for (let i = 100; i >= 0; i--) {
    const change = (Math.random() - 0.5) * 100
    const open = price
    const close = price + change
    const high = Math.max(open, close) + Math.random() * 50
    const low = Math.min(open, close) - Math.random() * 50
    const volume = Math.random() * 10 + 1
    
    data.push({
      time: now - i * 60000,
      open,
      high,
      low,
      close,
      volume,
    })
    
    price = close
  }
  
  return data
}

const generateMockDepthData = () => {
  const bids: PriceLevel[] = []
  const asks: PriceLevel[] = []
  let bidCumulative = 0
  let askCumulative = 0
  
  for (let i = 0; i < 20; i++) {
    const bidPrice = mockPrice - i * 0.5 - Math.random() * 0.5
    const askPrice = mockPrice + i * 0.5 + Math.random() * 0.5
    const bidQty = Math.random() * 5 + 0.1
    const askQty = Math.random() * 5 + 0.1
    
    bidCumulative += bidQty
    askCumulative += askQty
    
    bids.push({
      price: bidPrice,
      quantity: bidQty,
      cumulative: Math.round(bidCumulative * 10000) / 10000,
    })
    asks.push({
      price: askPrice,
      quantity: askQty,
      cumulative: Math.round(askCumulative * 10000) / 10000,
    })
  }
  
  return { bids, asks }
}

const Dashboard: React.FC = () => {
  const [symbol] = useState('btcusdt')
  const [klineInterval, setKlineInterval] = useState<'1m' | '5m' | '15m' | '1h'>('1m')
  const [demoMode, setDemoMode] = useState(true)
  const [demoKlines, setDemoKlines] = useState<any[]>([])
  const [demoDepth, setDemoDepth] = useState<any>(null)
  const [demoTicker, setDemoTicker] = useState<any>(null)
  const [demoMetrics, setDemoMetrics] = useState<any>(null)
  const [demoTrades, setDemoTrades] = useState<any[]>([])
  
  const klines = useMarketStore((state) => state.klines)
  const { depthChartData } = useOrderBook()

  const channels = useMemo(
    () => ['trade', 'depth', 'kline', 'ticker', 'metrics'] as const,
    []
  )

  useEffect(() => {
    if (!demoMode) return
    
    setDemoKlines(generateMockKlineChartData())
    setDemoDepth(generateMockDepthData())
    setDemoTicker({
      price: mockPrice.toString(),
      priceChangePercent: '0.25',
      high24h: (mockPrice + 500).toString(),
      low24h: (mockPrice - 500).toString(),
      volume24h: '1250.50',
      quoteVolume24h: '62500000.00',
    })
    setDemoMetrics({
      midPrice: mockPrice.toString(),
      spread: '0.10',
      spreadBps: 2,
      bidDepth10: '25.5000',
      askDepth10: '30.2000',
      depthRatio: '0.84',
    })
    
    const trades: any[] = []
    for (let i = 0; i < 20; i++) {
      trades.push({
        tradeTime: Date.now() - i * 5000,
        price: (mockPrice + (Math.random() - 0.5) * 10).toFixed(2),
        quantity: (Math.random() * 2 + 0.01).toFixed(4),
        isBuyerMaker: Math.random() > 0.5,
      })
    }
    setDemoTrades(trades)

    const interval = setInterval(() => {
      setDemoDepth(generateMockDepthData())
      
      const newTicker = {
        price: (mockPrice + (Math.random() - 0.5) * 50).toFixed(2),
        priceChangePercent: ((Math.random() - 0.5) * 1).toFixed(2),
        high24h: (mockPrice + 500).toString(),
        low24h: (mockPrice - 500).toString(),
        volume24h: (1250 + Math.random() * 50).toFixed(2),
        quoteVolume24h: (62500000 + Math.random() * 100000).toFixed(2),
      }
      setDemoTicker(newTicker)
      
      setDemoMetrics({
        midPrice: (mockPrice + (Math.random() - 0.5) * 20).toFixed(2),
        spread: (0.1 + Math.random() * 0.1).toFixed(2),
        spreadBps: Math.floor(1 + Math.random() * 3),
        bidDepth10: (25 + Math.random() * 5).toFixed(4),
        askDepth10: (30 + Math.random() * 5).toFixed(4),
        depthRatio: (0.8 + Math.random() * 0.1).toFixed(2),
      })
      
      setDemoTrades(prev => [{
        tradeTime: Date.now(),
        price: (mockPrice + (Math.random() - 0.5) * 10).toFixed(2),
        quantity: (Math.random() * 2 + 0.01).toFixed(4),
        isBuyerMaker: Math.random() > 0.5,
      }, ...prev].slice(0, 50))
      
      setDemoKlines(prev => {
        if (prev.length === 0) return prev
        const last = { ...prev[prev.length - 1] }
        const newPrice = mockPrice + (Math.random() - 0.5) * 50
        last.close = newPrice
        last.high = Math.max(last.high, newPrice)
        last.low = Math.min(last.low, newPrice)
        last.volume += Math.random() * 0.1
        return [...prev.slice(0, -1), last]
      })
    }, 2000)

    return () => clearInterval(interval)
  }, [demoMode])

  if (!demoMode) {
    useWebSocket({
      symbol,
      channels,
      klineInterval,
    })
  }

  const displayKlines = demoMode ? demoKlines : klines
  const displayDepth = demoMode ? demoDepth : depthChartData

  return (
    <div className="min-h-screen bg-bg-dark">
      <header className="bg-bg-card border-b border-border-dark px-6 py-4">
        <div className="flex items-center justify-between max-w-screen-2xl mx-auto">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-text-primary">
              <span className="text-info-blue">OrderBook</span> Analytics
            </h1>
            <span className="px-2 py-1 bg-info-blue/20 text-info-blue text-xs rounded font-mono">
              BTC/USDT
            </span>
            <span className={`px-2 py-1 text-xs rounded font-mono ${
              demoMode ? 'bg-yellow-500/20 text-yellow-500' : 'bg-buy-green/20 text-buy-green'
            }`}>
              {demoMode ? '演示模式' : '实时数据'}
            </span>
          </div>
          <button
            onClick={() => setDemoMode(!demoMode)}
            className="px-3 py-1.5 bg-bg-dark text-text-primary text-xs rounded border border-border-dark hover:bg-border-dark transition-colors"
          >
            切换到{demoMode ? '实时数据' : '演示模式'}
          </button>
        </div>
      </header>

      <main className="max-w-screen-2xl mx-auto p-6">
        <div className="grid grid-cols-1 gap-6">
          {demoMode ? (
            <DemoPriceTicker ticker={demoTicker} />
          ) : (
            <PriceTicker />
          )}

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 bg-bg-card rounded-xl p-4 border border-border-dark">
              <h3 className="text-lg font-semibold text-text-primary mb-4">订单簿深度</h3>
              {displayDepth && displayDepth.bids.length > 0 && displayDepth.asks.length > 0 ? (
                <DepthChart bids={displayDepth.bids} asks={displayDepth.asks} />
              ) : (
                <div className="flex items-center justify-center h-80 text-text-secondary">
                  等待深度数据...
                </div>
              )}
            </div>

            <div className="xl:col-span-1">
              {demoMode ? (
                <DemoTradeList trades={demoTrades} />
              ) : (
                <TradeList />
              )}
            </div>
          </div>

          <div className="bg-bg-card rounded-xl p-4 border border-border-dark">
            <h3 className="text-lg font-semibold text-text-primary mb-4">K 线走势图</h3>
            {displayKlines.length > 0 ? (
              <KlineChart
                data={displayKlines}
                interval={klineInterval}
                onIntervalChange={setKlineInterval}
              />
            ) : (
              <div className="flex items-center justify-center h-96 text-text-secondary">
                等待 K 线数据...
              </div>
            )}
          </div>

          {demoMode ? (
            <DemoMetricsCard metrics={demoMetrics} />
          ) : (
            <MetricsCard />
          )}
        </div>
      </main>

      <footer className="bg-bg-card border-t border-border-dark px-6 py-4 mt-8">
        <div className="max-w-screen-2xl mx-auto text-center text-xs text-text-secondary">
          <p>
            金融高频交易订单簿实时分析看板 | Rust 数据服务 + React + D3.js 前端
          </p>
          <p className="mt-1">
            数据来源: {demoMode ? '模拟数据 (演示模式)' : '实时 WebSocket'} | 更新频率: {demoMode ? '2秒' : '实时'}
          </p>
        </div>
      </footer>
    </div>
  )
}

const DemoPriceTicker: React.FC<{ ticker: any }> = ({ ticker }) => {
  if (!ticker) return null
  const price = parseFloat(ticker.price)
  const change = parseFloat(ticker.priceChangePercent)
  
  return (
    <div className="bg-bg-card rounded-xl p-6 border border-border-dark">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-text-primary">BTC/USDT</h2>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-buy-green animate-pulse" />
            <span className="text-xs text-text-secondary capitalize">connected</span>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-end gap-4">
          <div className={`font-mono text-4xl font-bold ${
            change >= 0 ? 'text-buy-green' : 'text-sell-red'
          }`}>
            ${price.toFixed(2)}
          </div>
          <div className={`font-mono text-lg ${
            change >= 0 ? 'text-buy-green' : 'text-sell-red'
          }`}>
            {change >= 0 ? '+' : ''}{change.toFixed(2)}%
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-border-dark">
          <div>
            <div className="text-xs text-text-secondary mb-1">24h 最高</div>
            <div className="font-mono text-buy-green">${parseFloat(ticker.high24h).toFixed(2)}</div>
          </div>
          <div>
            <div className="text-xs text-text-secondary mb-1">24h 最低</div>
            <div className="font-mono text-sell-red">${parseFloat(ticker.low24h).toFixed(2)}</div>
          </div>
          <div>
            <div className="text-xs text-text-secondary mb-1">24h 成交量</div>
            <div className="font-mono text-text-primary">{parseFloat(ticker.volume24h).toFixed(2)} BTC</div>
          </div>
          <div>
            <div className="text-xs text-text-secondary mb-1">24h 成交额</div>
            <div className="font-mono text-text-primary">${parseFloat(ticker.quoteVolume24h).toLocaleString()}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

const DemoTradeList: React.FC<{ trades: any[] }> = ({ trades }) => {
  return (
    <div className="bg-bg-card rounded-xl p-4 border border-border-dark h-full">
      <h3 className="text-lg font-semibold text-text-primary mb-4">最新成交</h3>
      <div className="space-y-1 max-h-80 overflow-y-auto">
        {trades.map((trade, index) => (
          <div
            key={trade.tradeTime + '-' + index}
            className="grid grid-cols-3 gap-2 px-2 py-1.5 text-xs font-mono hover:bg-bg-dark/50 rounded"
          >
            <span className="text-text-secondary">
              {new Date(trade.tradeTime).toLocaleTimeString('zh-CN')}
            </span>
            <span className={trade.isBuyerMaker ? 'text-sell-red' : 'text-buy-green'}>
              {parseFloat(trade.price).toFixed(2)}
            </span>
            <span className="text-text-primary text-right">
              {parseFloat(trade.quantity).toFixed(4)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

const DemoMetricsCard: React.FC<{ metrics: any }> = ({ metrics }) => {
  if (!metrics) return null
  
  const bidDepth = parseFloat(metrics.bidDepth10 || '0')
  const askDepth = parseFloat(metrics.askDepth10 || '0')
  const maxDepth = Math.max(bidDepth, askDepth)
  
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      <div className="bg-bg-card rounded-xl p-4 border border-border-dark">
        <div className="text-xs text-text-secondary mb-2">价差</div>
        <div className="font-mono text-xl text-text-primary">${parseFloat(metrics.spread).toFixed(2)}</div>
      </div>
      
      <div className="bg-bg-card rounded-xl p-4 border border-border-dark">
        <div className="text-xs text-text-secondary mb-2">价差 (BPS)</div>
        <div className="font-mono text-xl text-text-primary">{metrics.spreadBps}</div>
      </div>
      
      <div className="bg-bg-card rounded-xl p-4 border border-border-dark">
        <div className="text-xs text-text-secondary mb-2">买盘深度</div>
        <div className="font-mono text-xl text-buy-green">{bidDepth.toFixed(2)}</div>
      </div>
      
      <div className="bg-bg-card rounded-xl p-4 border border-border-dark">
        <div className="text-xs text-text-secondary mb-2">卖盘深度</div>
        <div className="font-mono text-xl text-sell-red">{askDepth.toFixed(2)}</div>
      </div>
      
      <div className="bg-bg-card rounded-xl p-4 border border-border-dark">
        <div className="text-xs text-text-secondary mb-2">深度比值</div>
        <div className="font-mono text-xl text-text-primary">{parseFloat(metrics.depthRatio).toFixed(2)}</div>
      </div>
      
      <div className="bg-bg-card rounded-xl p-4 border border-border-dark">
        <div className="text-xs text-text-secondary mb-2">中间价</div>
        <div className="font-mono text-xl text-text-primary">${parseFloat(metrics.midPrice).toFixed(2)}</div>
      </div>
    </div>
  )
}

export default Dashboard
