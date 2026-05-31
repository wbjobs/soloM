import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { useSimulationStore } from "../store/simulationStore";

interface EnergyChartProps {
  width?: number;
  height?: number;
}

export function EnergyChart({ width = 300, height = 200 }: EnergyChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const { frameHistory } = useSimulationStore();

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const margin = { top: 25, right: 60, bottom: 35, left: 50 };
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
      .attr("class", "kinetic-line")
      .attr("fill", "none")
      .attr("stroke", "#ff6b6b")
      .attr("stroke-width", 1.5);

    g.append("path")
      .attr("class", "potential-line")
      .attr("fill", "none")
      .attr("stroke", "#4ecdc4")
      .attr("stroke-width", 1.5);

    g.append("path")
      .attr("class", "total-line")
      .attr("fill", "none")
      .attr("stroke", "#ffd93d")
      .attr("stroke-width", 1.5);

    const legend = g.append("g").attr("class", "legend");

    legend.append("circle")
      .attr("cx", plotWidth - 80)
      .attr("cy", -10)
      .attr("r", 4)
      .attr("fill", "#ff6b6b");

    legend.append("text")
      .attr("x", plotWidth - 70)
      .attr("y", -6)
      .attr("fill", "#8892a0")
      .attr("font-size", "10px")
      .text("KE");

    legend.append("circle")
      .attr("cx", plotWidth - 35)
      .attr("cy", -10)
      .attr("r", 4)
      .attr("fill", "#4ecdc4");

    legend.append("text")
      .attr("x", plotWidth - 25)
      .attr("y", -6)
      .attr("fill", "#8892a0")
      .attr("font-size", "10px")
      .text("PE");

    legend.append("circle")
      .attr("cx", 10)
      .attr("cy", -10)
      .attr("r", 4)
      .attr("fill", "#ffd93d");

    legend.append("text")
      .attr("x", 20)
      .attr("y", -6)
      .attr("fill", "#8892a0")
      .attr("font-size", "10px")
      .text("Total");

    svg.attr("data-width", width.toString());
    svg.attr("data-height", height.toString());
    svg.attr("data-plot-width", plotWidth.toString());
    svg.attr("data-plot-height", plotHeight.toString());
  }, [width, height]);

  useEffect(() => {
    if (!svgRef.current || frameHistory.length === 0) return;

    const svg = d3.select(svgRef.current);
    const g = svg.select("g");
    const plotWidth = parseInt(svg.attr("data-plot-width"));
    const plotHeight = parseInt(svg.attr("data-plot-height"));

    const data = frameHistory;
    const last200 = data.slice(-200);

    const xDomain: [number, number] = [last200[0].step, last200[last200.length - 1].step];
    const keValues = last200.map((d) => d.kinetic_energy);
    const peValues = last200.map((d) => d.potential_energy);
    const totalValues = last200.map((d) => d.total_energy);

    const allValues = [...keValues, ...peValues, ...totalValues];
    const yMin = Math.min(...allValues) * 1.1;
    const yMax = Math.max(...allValues) * 1.1;
    const yDomain: [number, number] = [Math.min(yMin, 0), Math.max(yMax, 1)];

    const xScale = d3.scaleLinear()
      .domain(xDomain)
      .range([0, plotWidth]);

    const yScale = d3.scaleLinear()
      .domain(yDomain)
      .range([plotHeight, 0])
      .nice();

    const xAxis = g.select<SVGGElement>(".x-axis");
    const yAxis = g.select<SVGGElement>(".y-axis");

    xAxis.call(
      d3.axisBottom(xScale)
        .ticks(5)
        .tickFormat(d3.format("d"))
        .tickSizeOuter(0)
    );

    yAxis.call(
      d3.axisLeft(yScale)
        .ticks(5)
        .tickFormat(d3.format(".2f"))
        .tickSizeOuter(0)
    );

    xAxis.selectAll("text").attr("fill", "#8892a0").attr("font-size", "10px");
    yAxis.selectAll("text").attr("fill", "#8892a0").attr("font-size", "10px");
    xAxis.selectAll("path,line").attr("stroke", "#2a3040");
    yAxis.selectAll("path,line").attr("stroke", "#2a3040");

    const keLine = d3.line()
      .x((d: any) => xScale(d.step))
      .y((d: any) => yScale(d.kinetic_energy));

    const peLine = d3.line()
      .x((d: any) => xScale(d.step))
      .y((d: any) => yScale(d.potential_energy));

    const totalLine = d3.line()
      .x((d: any) => xScale(d.step))
      .y((d: any) => yScale(d.total_energy));

    g.select(".kinetic-line").attr("d", keLine(last200 as any));
    g.select(".potential-line").attr("d", peLine(last200 as any));
    g.select(".total-line").attr("d", totalLine(last200 as any));

    xAxis.selectAll(".x-label").remove();
    xAxis.append("text")
      .attr("class", "x-label")
      .attr("x", plotWidth / 2)
      .attr("y", 28)
      .attr("text-anchor", "middle")
      .attr("fill", "#8892a0")
      .attr("font-size", "11px")
      .text("Step");

    yAxis.selectAll(".y-label").remove();
    yAxis.append("text")
      .attr("class", "y-label")
      .attr("transform", "rotate(-90)")
      .attr("x", -plotHeight / 2)
      .attr("y", -40)
      .attr("text-anchor", "middle")
      .attr("fill", "#8892a0")
      .attr("font-size", "11px")
      .text("Energy (ε)");
  }, [frameHistory]);

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      className="rounded-lg bg-surface/50"
    />
  );
}
