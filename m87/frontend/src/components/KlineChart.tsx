import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import * as d3 from 'd3'
import { KlineChartData, BollingerBandsData } from '../types/market'
import { formatPrice, formatQuantity, formatTime, calculateMA, calculateBollingerBands } from '../utils/d3Helpers'

interface KlineChartProps {
  data: KlineChartData[]
  width?: number
  height?: number
  interval?: '1m' | '5m' | '15m' | '1h'
  onIntervalChange?: (interval: '1m' | '5m' | '15m' | '1h') => void
}

interface HoverData {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  x: number
  y: number
}

const intervals: { value: '1m' | '5m' | '15m' | '1h'; label: string }[] = [
  { value: '1m', label: '1分' },
  { value: '5m', label: '5分' },
  { value: '15m', label: '15分' },
  { value: '1h', label: '1时' },
]

const KlineChart: React.FC<KlineChartProps> = ({
  data,
  width = 800,
  height = 500,
  interval = '1m',
  onIntervalChange,
}) => {
  const svgRef = useRef<SVGSVGElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [hoverData, setHoverData] = useState<HoverData | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width, height })
  const [showBollinger, setShowBollinger] = useState(true)
  const [bollingerPeriod, setBollingerPeriod] = useState(20)
  const [bollingerStdDev, setBollingerStdDev] = useState(2)
  const [hoverBollinger, setHoverBollinger] = useState<BollingerBandsData | null>(null)

  const margin = { top: 30, right: 80, bottom: 40, left: 60 }
  const volumeHeight = 80

  const ma5 = useMemo(() => calculateMA(data, 5), [data])
  const ma10 = useMemo(() => calculateMA(data, 10), [data])
  const ma20 = useMemo(() => calculateMA(data, 20), [data])
  const bollingerBands = useMemo(() => 
    showBollinger ? calculateBollingerBands(data, { 
      period: bollingerPeriod, 
      stdDevMultiplier: bollingerStdDev 
    }) : [], 
    [data, showBollinger, bollingerPeriod, bollingerStdDev]
  )

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.clientWidth
        setDimensions({
          width: containerWidth,
          height: Math.max(400, containerWidth * 0.6),
        })
      }
    }

    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  const drawChart = useCallback(() => {
    if (!svgRef.current || !data.length) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const { width: w, height: h } = dimensions
    const innerWidth = w - margin.left - margin.right
    const candleHeight = h - margin.top - margin.bottom - volumeHeight - 10

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
    const pricePadding = (priceExtent[1] - priceExtent[0]) * 0.1
    const yPriceScale = d3
      .scaleLinear()
      .domain([priceExtent[0] - pricePadding, priceExtent[1] + pricePadding])
      .range([candleHeight, 0])
      .nice()

    const maxVolume = d3.max(data, (d) => d.volume) || 1
    const yVolumeScale = d3
      .scaleLinear()
      .domain([0, maxVolume])
      .range([volumeHeight, 0])
      .nice()

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    g.selectAll('.grid-horizontal')
      .data(yPriceScale.ticks(6))
      .enter()
      .append('line')
      .attr('class', 'grid-horizontal')
      .attr('x1', 0)
      .attr('x2', innerWidth)
      .attr('y1', (d) => yPriceScale(d as number))
      .attr('y2', (d) => yPriceScale(d as number))
      .attr('stroke', '#1f2937')
      .attr('stroke-width', 1)

    const candles = g
      .selectAll('.candle')
      .data(data)
      .enter()
      .append('g')
      .attr('class', 'candle')
      .attr('transform', (d) => `translate(${xScale(d.time.toString())},0)`)

    const candleWidth = xScale.bandwidth()

    candles
      .append('line')
      .attr('x1', candleWidth / 2)
      .attr('x2', candleWidth / 2)
      .attr('y1', (d) => yPriceScale(d.high))
      .attr('y2', (d) => yPriceScale(d.low))
      .attr('stroke', (d) => (d.close >= d.open ? '#00c087' : '#ff4757'))
      .attr('stroke-width', 1)

    candles
      .append('rect')
      .attr('x', 0)
      .attr('y', (d) => yPriceScale(Math.max(d.open, d.close)))
      .attr('width', candleWidth)
      .attr('height', (d) => {
        const height = Math.abs(yPriceScale(d.open) - yPriceScale(d.close))
        return Math.max(height, 1)
      })
      .attr('fill', (d) => (d.close >= d.open ? '#00c087' : '#ff4757'))
      .attr('opacity', 0.8)
      .attr('rx', 1)

    const line = d3
      .line<number>()
      .x((_, i) => {
        if (!data[i]) return 0
        const x = xScale(data[i].time.toString())
        return x !== undefined ? x + candleWidth / 2 : 0
      })
      .y((d) => yPriceScale(d))
      .defined((d) => !isNaN(d))

    g.append('path')
      .datum(ma5)
      .attr('fill', 'none')
      .attr('stroke', '#f59e0b')
      .attr('stroke-width', 1.5)
      .attr('d', line)
      .attr('opacity', 0.8)

    g.append('path')
      .datum(ma10)
      .attr('fill', 'none')
      .attr('stroke', '#8b5cf6')
      .attr('stroke-width', 1.5)
      .attr('d', line)
      .attr('opacity', 0.8)

    g.append('path')
      .datum(ma20)
      .attr('fill', 'none')
      .attr('stroke', '#3b82f6')
      .attr('stroke-width', 1.5)
      .attr('d', line)
      .attr('opacity', 0.8)

    if (showBollinger && bollingerBands.length > 0) {
      const bollingerLine = d3
        .line<BollingerBandsData>()
        .x((d) => {
          const x = xScale(d.time.toString())
          return x !== undefined ? x + candleWidth / 2 : 0
        })
        .defined((d) => !isNaN(d.middle))

      const upperData = bollingerBands.map((d) => ({ ...d, y: d.upper }))
      const lowerData = bollingerBands.map((d) => ({ ...d, y: d.lower })).reverse()
      const areaData = [...bollingerBands, ...lowerData]

      const bollingerArea = d3
        .area<BollingerBandsData>()
        .x((d) => {
          const x = xScale(d.time.toString())
          return x !== undefined ? x + candleWidth / 2 : 0
        })
        .y0((d) => yPriceScale(d.lower))
        .y1((d) => yPriceScale(d.upper))
        .defined((d) => !isNaN(d.upper) && !isNaN(d.lower))

      g.append('path')
        .datum(bollingerBands)
        .attr('fill', 'rgba(255, 165, 0, 0.1)')
        .attr('d', bollingerArea)
        .attr('class', 'bollinger-area')

      g.append('path')
        .datum(bollingerBands)
        .attr('fill', 'none')
        .attr('stroke', '#f97316')
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '4,2')
        .attr('d', bollingerLine.y((d) => yPriceScale(d.upper)))
        .attr('class', 'bollinger-upper')

      g.append('path')
        .datum(bollingerBands)
        .attr('fill', 'none')
        .attr('stroke', '#f97316')
        .attr('stroke-width', 1.5)
        .attr('d', bollingerLine.y((d) => yPriceScale(d.middle)))
        .attr('class', 'bollinger-middle')

      g.append('path')
        .datum(bollingerBands)
        .attr('fill', 'none')
        .attr('stroke', '#f97316')
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '4,2')
        .attr('d', bollingerLine.y((d) => yPriceScale(d.lower)))
        .attr('class', 'bollinger-lower')
    }

    const volumeG = g
      .append('g')
      .attr('transform', `translate(0,${candleHeight + 10})`)

    volumeG
      .selectAll('.volume-bar')
      .data(data)
      .enter()
      .append('rect')
      .attr('class', 'volume-bar')
      .attr('x', (d) => xScale(d.time.toString()) || 0)
      .attr('y', (d) => yVolumeScale(d.volume))
      .attr('width', candleWidth)
      .attr('height', (d) => volumeHeight - yVolumeScale(d.volume))
      .attr('fill', (d) => (d.close >= d.open ? 'rgba(0, 192, 135, 0.5)' : 'rgba(255, 71, 87, 0.5)'))

    const xAxis = d3
      .axisBottom(xScale)
      .ticks(8)
      .tickFormat((_, i) => {
        if (i % Math.ceil(data.length / 8) !== 0) return ''
        const d = data[i]
        return d ? formatTime(d.time) : ''
      })

    const yPriceAxis = d3
      .axisRight(yPriceScale)
      .ticks(6)
      .tickFormat((d) => formatPrice(d as number))

    const yVolumeAxis = d3
      .axisRight(yVolumeScale)
      .ticks(3)
      .tickFormat((d) => formatQuantity(d as number, 2))

    g.append('g')
      .attr('transform', `translate(0,${candleHeight})`)
      .call(xAxis)
      .attr('color', '#9ca3af')
      .selectAll('text')
      .attr('font-size', '11px')
      .attr('font-family', 'JetBrains Mono, monospace')

    g.append('g')
      .attr('transform', `translate(${innerWidth},0)`)
      .call(yPriceAxis)
      .attr('color', '#9ca3af')
      .selectAll('text')
      .attr('font-size', '11px')
      .attr('font-family', 'JetBrains Mono, monospace')

    volumeG
      .append('g')
      .attr('transform', `translate(${innerWidth},0)`)
      .call(yVolumeAxis)
      .attr('color', '#9ca3af')
      .selectAll('text')
      .attr('font-size', '10px')
      .attr('font-family', 'JetBrains Mono, monospace')

    const crosshair = g.append('g').attr('class', 'crosshair').style('display', 'none')

    crosshair
      .append('line')
      .attr('class', 'crosshair-x')
      .attr('stroke', '#6b7280')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '3,3')

    crosshair
      .append('line')
      .attr('class', 'crosshair-y')
      .attr('stroke', '#6b7280')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '3,3')

    const overlay = g
      .append('rect')
      .attr('class', 'overlay')
      .attr('width', innerWidth)
      .attr('height', candleHeight + 10 + volumeHeight)
      .attr('fill', 'none')
      .attr('pointer-events', 'all')

    const bisect = d3.bisector<KlineChartData, number>((d) => d.time).left
    const bandStep = xScale.step()
    const firstX = xScale(data[0].time.toString()) ?? 0

    overlay
      .on('mousemove', function (event) {
        const [mouseX] = d3.pointer(event)
        
        let index: number
        if (bandStep > 0) {
          const relativeX = mouseX - firstX
          index = Math.max(0, Math.min(
            Math.round(relativeX / bandStep),
            data.length - 1
          ))
        } else {
          const xm = data[0].time + (mouseX / innerWidth) * (data[data.length - 1].time - data[0].time)
          index = Math.max(0, Math.min(bisect(data, xm) - 1, data.length - 1))
        }
        
        const d = data[index]
        const bb = showBollinger && bollingerBands[index] ? bollingerBands[index] : null

        if (d) {
          crosshair.style('display', null)
          const xPos = xScale(d.time.toString())! + candleWidth / 2

          crosshair
            .select('.crosshair-x')
            .attr('x1', xPos)
            .attr('x2', xPos)
            .attr('y1', 0)
            .attr('y2', candleHeight + 10 + volumeHeight)

          crosshair
            .select('.crosshair-y')
            .attr('x1', 0)
            .attr('x2', innerWidth)
            .attr('y1', yPriceScale(d.close))
            .attr('y2', yPriceScale(d.close))

          setHoverData({
            time: d.time,
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close,
            volume: d.volume,
            x: event.pageX,
            y: event.pageY,
          })
          
          if (bb && !isNaN(bb.middle)) {
            setHoverBollinger(bb)
          } else {
            setHoverBollinger(null)
          }
        }
      })
      .on('mouseout', function () {
        crosshair.style('display', 'none')
        setHoverData(null)
        setHoverBollinger(null)
      })
  }, [data, dimensions, margin, ma5, ma10, ma20, bollingerBands, showBollinger, formatPrice, formatQuantity, formatTime])

  useEffect(() => {
    drawChart()
  }, [drawChart])

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="flex items-center justify-between mb-2 px-2">
        <div className="flex gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-yellow-500" />
            <span className="text-text-secondary">MA5</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-purple-500" />
            <span className="text-text-secondary">MA10</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-blue-500" />
            <span className="text-text-secondary">MA20</span>
          </div>
          <div className="flex items-center gap-2 ml-4">
            <div className="w-3 h-0.5 bg-orange-500" style={{ borderStyle: 'dashed', borderWidth: 1 }} />
            <span className="text-text-secondary">布林带</span>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={showBollinger}
                onChange={(e) => setShowBollinger(e.target.checked)}
                className="w-3 h-3"
              />
            </label>
          </div>
          {showBollinger && (
            <>
              <div className="flex items-center gap-1 text-xs">
                <span className="text-text-secondary">周期:</span>
                <select
                  value={bollingerPeriod}
                  onChange={(e) => setBollingerPeriod(Number(e.target.value))}
                  className="bg-bg-card border border-border-dark rounded px-1 py-0.5 text-text-primary text-xs"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </div>
              <div className="flex items-center gap-1 text-xs">
                <span className="text-text-secondary">±σ:</span>
                <select
                  value={bollingerStdDev}
                  onChange={(e) => setBollingerStdDev(Number(e.target.value))}
                  className="bg-bg-card border border-border-dark rounded px-1 py-0.5 text-text-primary text-xs"
                >
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                </select>
              </div>
            </>
          )}
        </div>

        <div className="flex gap-1">
          {intervals.map((item) => (
            <button
              key={item.value}
              onClick={() => onIntervalChange?.(item.value)}
              className={`px-3 py-1 text-xs font-mono rounded transition-colors ${
                interval === item.value
                  ? 'bg-info-blue text-white'
                  : 'bg-bg-card text-text-secondary hover:text-text-primary'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <svg ref={svgRef} width={dimensions.width} height={dimensions.height} className="overflow-visible" />

      {hoverData && (
        <div
          ref={tooltipRef}
          className="fixed z-50 bg-bg-card border border-border-dark rounded-lg p-3 text-sm pointer-events-none shadow-xl"
          style={{
            left: hoverData.x + 15,
            top: hoverData.y + 15,
          }}
        >
          <div className="font-mono text-text-secondary mb-2">{formatTime(hoverData.time)}</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono">
            <span className="text-text-secondary">Open:</span>
            <span>{formatPrice(hoverData.open)}</span>
            <span className="text-text-secondary">High:</span>
            <span className="text-buy-green">{formatPrice(hoverData.high)}</span>
            <span className="text-text-secondary">Low:</span>
            <span className="text-sell-red">{formatPrice(hoverData.low)}</span>
            <span className="text-text-secondary">Close:</span>
            <span className={hoverData.close >= hoverData.open ? 'text-buy-green' : 'text-sell-red'}>
              {formatPrice(hoverData.close)}
            </span>
            <span className="text-text-secondary">Volume:</span>
            <span>{formatQuantity(hoverData.volume, 2)}</span>
          </div>
          {hoverBollinger && !isNaN(hoverBollinger.middle) && (
            <>
              <div className="border-t border-border-dark my-2 pt-2">
                <div className="text-orange-500 font-semibold text-xs mb-1">布林带 ({bollingerPeriod}, {bollingerStdDev}σ)</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs">
                  <span className="text-text-secondary">上轨:</span>
                  <span className="text-sell-red">{formatPrice(hoverBollinger.upper)}</span>
                  <span className="text-text-secondary">中轨:</span>
                  <span className="text-orange-500">{formatPrice(hoverBollinger.middle)}</span>
                  <span className="text-text-secondary">下轨:</span>
                  <span className="text-buy-green">{formatPrice(hoverBollinger.lower)}</span>
                  <span className="text-text-secondary">带宽:</span>
                  <span className="text-text-primary">{formatPrice(hoverBollinger.width, 2)}%</span>
                  <span className="text-text-secondary">%B:</span>
                  <span className="text-text-primary">{formatPrice(hoverBollinger.percentB, 2)}</span>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default KlineChart
