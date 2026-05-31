import * as d3 from 'd3'
import { PriceLevel, KlineChartData, BollingerBandsData } from '../types/market'

export const formatPrice = (value: number, decimals = 2): string => {
  return d3.format(`,.${decimals}f`)(value)
}

export const formatQuantity = (value: number, decimals = 4): string => {
  if (value >= 1000000) {
    return d3.format(',.2f')(value / 1000000) + 'M'
  } else if (value >= 1000) {
    return d3.format(',.2f')(value / 1000) + 'K'
  }
  return d3.format(`,.${decimals}f`)(value)
}

export const formatPercent = (value: number, decimals = 2): string => {
  const sign = value >= 0 ? '+' : ''
  return sign + d3.format(`,.${decimals}f`)(value) + '%'
}

export const formatTime = (timestamp: number): string => {
  return d3.timeFormat('%H:%M:%S')(new Date(timestamp))
}

export interface DepthChartDimensions {
  width: number
  height: number
  margin: { top: number; right: number; bottom: number; left: number }
}

export const createDepthScales = (
  data: { bids: PriceLevel[]; asks: PriceLevel[] },
  dimensions: DepthChartDimensions
) => {
  const { width, height, margin } = dimensions
  const innerWidth = width - margin.left - margin.right
  const innerHeight = height - margin.top - margin.bottom

  const allPrices = [
    ...data.bids.map((d) => d.price),
    ...data.asks.map((d) => d.price),
  ]
  const maxCumulative = d3.max([
    ...data.bids.map((d) => d.cumulative),
    ...data.asks.map((d) => d.cumulative),
  ]) || 1

  const xScale = d3
    .scaleLinear()
    .domain(d3.extent(allPrices) as [number, number])
    .range([0, innerWidth])
    .nice()

  const yScale = d3.scaleLinear().domain([0, maxCumulative]).range([innerHeight, 0]).nice()

  return { xScale, yScale, innerWidth, innerHeight }
}

export interface KlineChartDimensions {
  width: number
  height: number
  margin: { top: number; right: number; bottom: number; left: number }
  volumeHeight: number
}

export const createKlineScales = (
  data: KlineChartData[],
  dimensions: KlineChartDimensions
) => {
  const { width, height, margin, volumeHeight } = dimensions
  const innerWidth = width - margin.left - margin.right
  const candleHeight = height - margin.top - margin.bottom - volumeHeight - 10

  const xScale = d3
    .scaleBand()
    .domain(data.map((d) => d.time.toString()))
    .range([0, innerWidth])
    .padding(0.2)

  const lowExtent = d3.extent(data, (d) => d.low)
  const highExtent = d3.extent(data, (d) => d.high)
  const priceExtent: [number, number] = [
    lowExtent[0] ?? 0,
    highExtent[1] ?? 0,
  ]
  const yPriceScale = d3
    .scaleLinear()
    .domain(priceExtent)
    .range([candleHeight, 0])
    .nice()

  const maxVolume = d3.max(data, (d) => d.volume) || 1
  const yVolumeScale = d3
    .scaleLinear()
    .domain([0, maxVolume])
    .range([volumeHeight, 0])
    .nice()

  return {
    xScale,
    yPriceScale,
    yVolumeScale,
    innerWidth,
    candleHeight,
    volumeHeight,
  }
}

export const calculateMA = (data: KlineChartData[], period: number): number[] => {
  const ma: number[] = []
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      ma.push(NaN)
    } else {
      const sum = data
        .slice(i - period + 1, i + 1)
        .reduce((acc, d) => acc + d.close, 0)
      ma.push(sum / period)
    }
  }
  return ma
}

export const generateGradientId = (prefix: string): string => {
  return `${prefix}-${Math.random().toString(36).substr(2, 9)}`
}

export interface BollingerBandsParams {
  period?: number
  stdDevMultiplier?: number
  priceField?: 'close' | 'typical'
}

export const calculateBollingerBands = (
  data: KlineChartData[],
  params: BollingerBandsParams = {}
): BollingerBandsData[] => {
  const { period = 20, stdDevMultiplier = 2, priceField = 'close' } = params
  const bands: BollingerBandsData[] = []

  const getPrice = (d: KlineChartData): number => {
    if (priceField === 'typical') {
      return (d.high + d.low + d.close) / 3
    }
    return d.close
  }

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      bands.push({
        time: data[i].time,
        middle: NaN,
        upper: NaN,
        lower: NaN,
        width: NaN,
        percentB: NaN,
      })
      continue
    }

    const slice = data.slice(i - period + 1, i + 1)
    const prices = slice.map(getPrice)
    
    const mean = prices.reduce((a, b) => a + b, 0) / period
    const variance = prices.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / period
    const stdDev = Math.sqrt(variance)

    const middle = mean
    const upper = mean + stdDevMultiplier * stdDev
    const lower = mean - stdDevMultiplier * stdDev
    const currentPrice = getPrice(data[i])
    const width = upper !== lower ? ((upper - lower) / middle) * 100 : NaN
    const percentB = upper !== lower ? (currentPrice - lower) / (upper - lower) : NaN

    bands.push({
      time: data[i].time,
      middle,
      upper,
      lower,
      width,
      percentB,
    })
  }

  return bands
}

export interface VwapParams {
  volumeWeighted?: boolean
}

export const calculateVwapFromTrades = (
  trades: { price: number; quantity: number; timestamp: number }[],
  params: VwapParams = {}
): number => {
  if (trades.length === 0) return 0

  let cumulativeValue = 0
  let cumulativeVolume = 0

  for (const trade of trades) {
    cumulativeValue += trade.price * trade.quantity
    cumulativeVolume += trade.quantity
  }

  return cumulativeVolume > 0 ? cumulativeValue / cumulativeVolume : 0
}

export const calculateVwapFromKlines = (
  data: KlineChartData[],
  period?: number
): number[] => {
  const vwap: number[] = []
  let cumulativeValue = 0
  let cumulativeVolume = 0
  const startIndex = period ? Math.max(0, data.length - period) : 0

  for (let i = 0; i < data.length; i++) {
    const typicalPrice = (data[i].high + data[i].low + data[i].close) / 3
    const volume = data[i].volume

    if (i >= startIndex) {
      cumulativeValue += typicalPrice * volume
      cumulativeVolume += volume
    }

    if (cumulativeVolume > 0) {
      vwap.push(cumulativeValue / cumulativeVolume)
    } else {
      vwap.push(NaN)
    }
  }

  return vwap
}
