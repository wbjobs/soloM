import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { useSimulationStore } from "../store/simulationStore";

interface VelocityHistogramProps {
  width?: number;
  height?: number;
}

export function VelocityHistogram({ width = 300, height = 200 }: VelocityHistogramProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const { currentFrame, velocityTab } = useSimulationStore();

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const margin = { top: 20, right: 20, bottom: 35, left: 45 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;

    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    g.append("g")
      .attr("class", "x-axis")
      .attr("transform", `translate(0,${plotHeight})`);

    g.append("g")
      .attr("class", "y-axis");

    g.append("path")
      .attr("class", "theory-curve")
      .attr("fill", "none")
      .attr("stroke", "#ffd93d")
      .attr("stroke-width", 2);

    svg.attr("data-width", width.toString());
    svg.attr("data-height", height.toString());
    svg.attr("data-plot-width", plotWidth.toString());
    svg.attr("data-plot-height", plotHeight.toString());
  }, [width, height]);

  useEffect(() => {
    if (!svgRef.current || !currentFrame) return;

    const svg = d3.select(svgRef.current);
    const g = svg.select("g");
    const plotWidth = parseInt(svg.attr("data-plot-width"));
    const plotHeight = parseInt(svg.attr("data-plot-height"));

    const velocities = currentFrame.velocities;
    let data: number[];
    let xLabel: string;

    switch (velocityTab) {
      case "vx":
        data = velocities.map((v) => v[0]);
        xLabel = "v_x";
        break;
      case "vy":
        data = velocities.map((v) => v[1]);
        xLabel = "v_y";
        break;
      case "speed":
        data = velocities.map((v) => Math.sqrt(v[0] * v[0] + v[1] * v[1]));
        xLabel = "|v|";
        break;
      default:
        data = velocities.map((v) => Math.sqrt(v[0] * v[0] + v[1] * v[1]));
        xLabel = "|v|";
    }

    const xMin = d3.min(data) || 0;
    const xMax = d3.max(data) || 1;
    const xExtent = xMax - xMin;
    const xDomain: [number, number] = velocityTab === "speed"
      ? [0, xMax + xExtent * 0.1]
      : [xMin - xExtent * 0.1, xMax + xExtent * 0.1];

    const xScale = d3.scaleLinear()
      .domain(xDomain)
      .range([0, plotWidth]);

    const numBins = Math.min(20, Math.max(10, Math.floor(Math.sqrt(data.length))));
    const histogram = d3.bin()
      .domain(xScale.domain() as [number, number])
      .thresholds(numBins);

    const bins = histogram(data);
    const maxCount = d3.max(bins, (d) => d.length) || 1;

    const yScale = d3.scaleLinear()
      .domain([0, maxCount * 1.1])
      .range([plotHeight, 0]);

    const xAxis = g.select<SVGGElement>(".x-axis");
    const yAxis = g.select<SVGGElement>(".y-axis");

    xAxis.call(
      d3.axisBottom(xScale)
        .ticks(5)
        .tickSizeOuter(0)
    );

    yAxis.call(
      d3.axisLeft(yScale)
        .ticks(5)
        .tickSizeOuter(0)
    );

    xAxis.selectAll("text").attr("fill", "#8892a0").attr("font-size", "10px");
    yAxis.selectAll("text").attr("fill", "#8892a0").attr("font-size", "10px");
    xAxis.selectAll("path,line").attr("stroke", "#2a3040");
    yAxis.selectAll("path,line").attr("stroke", "#2a3040");

    const bars = g.selectAll("rect.bar")
      .data(bins);

    bars.exit().remove();

    const barWidth = Math.max(1, plotWidth / numBins - 2);

    bars.enter()
      .append("rect")
      .attr("class", "bar")
      .merge(bars as any)
      .attr("x", (d: any) => xScale(d.x0) + 1)
      .attr("y", (d: any) => yScale(d.length))
      .attr("width", barWidth)
      .attr("height", (d: any) => plotHeight - yScale(d.length))
      .attr("fill", "#00e5ff")
      .attr("opacity", 0.7)
      .attr("rx", 1);

    if (velocityTab === "speed") {
      const temperature = currentFrame.temperature;
      const numPoints = 100;
      const curveData: [number, number][] = [];

      for (let i = 0; i <= numPoints; i++) {
        const v = xDomain[1] * (i / numPoints);
        const fv = (v / temperature) * Math.exp(-v * v / (2 * temperature));
        curveData.push([v, fv]);
      }

      const maxFv = d3.max(curveData, (d) => d[1]) || 1;
      const scalingFactor = maxCount / maxFv * 0.8;

      const line = d3.line()
        .x((d) => xScale(d[0]))
        .y((d) => yScale(d[1] * scalingFactor));

      g.select(".theory-curve")
        .attr("d", line(curveData as [number, number][]));
    } else {
      g.select(".theory-curve").attr("d", "");
    }

    xAxis.selectAll(".x-label").remove();
    xAxis.append("text")
      .attr("class", "x-label")
      .attr("x", plotWidth / 2)
      .attr("y", 28)
      .attr("text-anchor", "middle")
      .attr("fill", "#8892a0")
      .attr("font-size", "11px")
      .text(xLabel);

    yAxis.selectAll(".y-label").remove();
    yAxis.append("text")
      .attr("class", "y-label")
      .attr("transform", "rotate(-90)")
      .attr("x", -plotHeight / 2)
      .attr("y", -35)
      .attr("text-anchor", "middle")
      .attr("fill", "#8892a0")
      .attr("font-size", "11px")
      .text("Count");
  }, [currentFrame, velocityTab]);

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      className="rounded-lg bg-surface/50"
    />
  );
}
