import React, { useEffect, useRef, useState, useCallback } from 'react'
import * as d3 from 'd3'
import { PriceLevel } from '../types/market'
import { formatPrice, formatQuantity } from '../utils/d3Helpers'

interface DepthChartProps {
  bids: PriceLevel[]
  asks: PriceLevel[]
  width?: number
  height?: number
}

interface HoverData {
  price: number
  bidQty?: number
  askQty?: number
  bidCum?: number
  askCum?: number
  x: number
  y: number
}

const DepthChart: React.FC<DepthChartProps> = ({
  bids,
  asks,
  width = 800,
  height = 400,
}) => {
  const svgRef = useRef<SVGSVGElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [hoverData, setHoverData] = useState<HoverData | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width, height })

  const margin = { top: 20, right: 20, bottom: 40, left: 60 }

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.clientWidth
        setDimensions({
          width: containerWidth,
          height: Math.max(300, containerWidth * 0.5),
        })
      }
    }

    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  const drawChart = useCallback(() => {
    if (!svgRef.current || !bids.length || !asks.length) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const { width: w, height: h } = dimensions
    const innerWidth = w - margin.left - margin.right
    const innerHeight = h - margin.top - margin.bottom

    const allPrices = [
      ...bids.map((d) => d.price),
      ...asks.map((d) => d.price),
    ]
    const maxCumulative = d3.max([
      ...bids.map((d) => d.cumulative),
      ...asks.map((d) => d.cumulative),
    ]) || 1

    const midPrice = (bids[0].price + asks[0].price) / 2

    const xScale = d3
      .scaleLinear()
      .domain(d3.extent(allPrices) as [number, number])
      .range([0, innerWidth])
      .nice()

    const yScale = d3.scaleLinear().domain([0, maxCumulative]).range([innerHeight, 0]).nice()

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    const bidGradient = svg
      .append('defs')
      .append('linearGradient')
      .attr('id', 'bid-gradient')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%')

    bidGradient.append('stop').attr('offset', '0%').attr('stop-color', '#00c087').attr('stop-opacity', 0.8)
    bidGradient.append('stop').attr('offset', '100%').attr('stop-color', '#00c087').attr('stop-opacity', 0.1)

    const askGradient = svg
      .append('defs')
      .append('linearGradient')
      .attr('id', 'ask-gradient')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%')

    askGradient.append('stop').attr('offset', '0%').attr('stop-color', '#ff4757').attr('stop-opacity', 0.8)
    askGradient.append('stop').attr('offset', '100%').attr('stop-color', '#ff4757').attr('stop-opacity', 0.1)

    const bidArea = d3
      .area<PriceLevel>()
      .x((d) => xScale(d.price))
      .y0(innerHeight)
      .y1((d) => yScale(d.cumulative))
      .curve(d3.curveStepAfter)

    const askArea = d3
      .area<PriceLevel>()
      .x((d) => xScale(d.price))
      .y0(innerHeight)
      .y1((d) => yScale(d.cumulative))
      .curve(d3.curveStepAfter)

    g.append('path')
      .datum(bids)
      .attr('fill', 'url(#bid-gradient)')
      .attr('d', bidArea)
      .transition()
      .duration(500)
      .attr('d', bidArea)

    g.append('path')
      .datum(asks)
      .attr('fill', 'url(#ask-gradient)')
      .attr('d', askArea)
      .transition()
      .duration(500)
      .attr('d', askArea)

    const bidLine = d3
      .line<PriceLevel>()
      .x((d) => xScale(d.price))
      .y((d) => yScale(d.cumulative))
      .curve(d3.curveStepAfter)

    const askLine = d3
      .line<PriceLevel>()
      .x((d) => xScale(d.price))
      .y((d) => yScale(d.cumulative))
      .curve(d3.curveStepAfter)

    g.append('path')
      .datum(bids)
      .attr('fill', 'none')
      .attr('stroke', '#00c087')
      .attr('stroke-width', 2)
      .attr('d', bidLine)

    g.append('path')
      .datum(asks)
      .attr('fill', 'none')
      .attr('stroke', '#ff4757')
      .attr('stroke-width', 2)
      .attr('d', askLine)

    g.append('line')
      .attr('x1', xScale(midPrice))
      .attr('y1', 0)
      .attr('x2', xScale(midPrice))
      .attr('y2', innerHeight)
      .attr('stroke', '#1890ff')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '4,4')
      .attr('opacity', 0.5)

    g.append('text')
      .attr('x', xScale(midPrice))
      .attr('y', -5)
      .attr('text-anchor', 'middle')
      .attr('fill', '#1890ff')
      .attr('font-size', '12px')
      .attr('font-family', 'JetBrains Mono, monospace')
      .text(`MID ${formatPrice(midPrice)}`)

    const xAxis = d3
      .axisBottom(xScale)
      .ticks(8)
      .tickFormat((d) => formatPrice(d as number))

    const yAxis = d3
      .axisLeft(yScale)
      .ticks(6)
      .tickFormat((d) => formatQuantity(d as number, 2))

    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis)
      .attr('color', '#9ca3af')
      .selectAll('text')
      .attr('font-size', '11px')
      .attr('font-family', 'JetBrains Mono, monospace')

    g.append('g')
      .call(yAxis)
      .attr('color', '#9ca3af')
      .selectAll('text')
      .attr('font-size', '11px')
      .attr('font-family', 'JetBrains Mono, monospace')

    g.selectAll('.grid')
      .data(yScale.ticks(6))
      .enter()
      .append('line')
      .attr('class', 'grid')
      .attr('x1', 0)
      .attr('x2', innerWidth)
      .attr('y1', (d) => yScale(d as number))
      .attr('y2', (d) => yScale(d as number))
      .attr('stroke', '#1f2937')
      .attr('stroke-width', 1)

    const bisectBid = d3.bisector<PriceLevel, number>((d) => d.price).left
    const bisectAsk = d3.bisector<PriceLevel, number>((d) => d.price).left

    const overlay = g
      .append('rect')
      .attr('class', 'overlay')
      .attr('width', innerWidth)
      .attr('height', innerHeight)
      .attr('fill', 'none')
      .attr('pointer-events', 'all')

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

    overlay
      .on('mousemove', function (event) {
        const [mouseX] = d3.pointer(event)
        const price = xScale.invert(mouseX)

        const bidIndex = bisectBid(bids, price, 1) - 1
        const askIndex = bisectAsk(asks, price, 1) - 1

        const bidData = bids[Math.max(0, Math.min(bidIndex, bids.length - 1))]
        const askData = asks[Math.max(0, Math.min(askIndex, asks.length - 1))]

        crosshair.style('display', null)

        crosshair
          .select('.crosshair-x')
          .attr('x1', mouseX)
          .attr('x2', mouseX)
          .attr('y1', 0)
          .attr('y2', innerHeight)

        const yBid = bidData ? yScale(bidData.cumulative) : innerHeight
        const yAsk = askData ? yScale(askData.cumulative) : innerHeight
        const yHover = Math.min(yBid, yAsk)

        crosshair
          .select('.crosshair-y')
          .attr('x1', 0)
          .attr('x2', innerWidth)
          .attr('y1', yHover)
          .attr('y2', yHover)

        setHoverData({
          price,
          bidQty: bidData?.quantity,
          askQty: askData?.quantity,
          bidCum: bidData?.cumulative,
          askCum: askData?.cumulative,
          x: event.pageX,
          y: event.pageY,
        })
      })
      .on('mouseout', function () {
        crosshair.style('display', 'none')
        setHoverData(null)
      })
  }, [bids, asks, dimensions, margin, formatPrice, formatQuantity])

  useEffect(() => {
    drawChart()
  }, [drawChart])

  return (
    <div ref={containerRef} className="relative w-full">
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
          <div className="font-mono text-info-blue mb-2">Price: {formatPrice(hoverData.price)}</div>
          {hoverData.bidQty !== undefined && (
            <div className="text-buy-green">
              <div>Bid Qty: {formatQuantity(hoverData.bidQty)}</div>
              <div>Bid Cum: {formatQuantity(hoverData.bidCum || 0, 2)}</div>
            </div>
          )}
          {hoverData.askQty !== undefined && (
            <div className="text-sell-red mt-1">
              <div>Ask Qty: {formatQuantity(hoverData.askQty)}</div>
              <div>Ask Cum: {formatQuantity(hoverData.askCum || 0, 2)}</div>
            </div>
          )}
        </div>
      )}

      <div className="absolute top-2 right-4 flex gap-4 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-buy-green" />
          <span className="text-text-secondary">Bids</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-sell-red" />
          <span className="text-text-secondary">Asks</span>
        </div>
      </div>
    </div>
  )
}

export default DepthChart
