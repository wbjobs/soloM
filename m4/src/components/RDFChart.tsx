import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { useSimulationStore } from "../store/simulationStore";

interface RDFChartProps {
  width?: number;
  height?: number;
}

export function RDFChart({ width = 300, height = 220 }: RDFChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const { rdfData } = useSimulationStore();

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const margin = { top: 25, right: 20, bottom: 40, left: 45 };
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
      .attr("class", "rdf-line")
      .attr("fill", "none")
      .attr("stroke", "#00e5ff")
      .attr("stroke-width", 2);

    g.append("path")
      .attr("class", "rdf-area")
      .attr("fill", "rgba(0, 229, 255, 0.1)");

    g.append("line")
      .attr("class", "reference-line")
      .attr("stroke", "#5a6070")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "4,3");

    g.append("text")
      .attr("class", "sample-count")
      .attr("x", plotWidth - 5)
      .attr("y", -8)
      .attr("text-anchor", "end")
      .attr("fill", "#5a6070")
      .attr("font-size", "10px")
      .attr("font-family", '"JetBrains Mono", monospace');

    svg.attr("data-plot-width", plotWidth.toString());
    svg.attr("data-plot-height", plotHeight.toString());
  }, [width, height]);

  useEffect(() => {
    if (!svgRef.current || !rdfData) return;

    const svg = d3.select(svgRef.current);
    const g = svg.select("g");
    const plotWidth = parseInt(svg.attr("data-plot-width"));
    const plotHeight = parseInt(svg.attr("data-plot-height"));

    const { r, g_r, sample_count } = rdfData;

    if (r.length === 0 || g_r.length === 0) return;

    const xScale = d3.scaleLinear()
      .domain([0, r[r.length - 1]])
      .range([0, plotWidth]);

    const maxGr = Math.max(d3.max(g_r) || 1, 1.5);
    const yScale = d3.scaleLinear()
      .domain([0, maxGr * 1.1])
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

    const points: [number, number][] = r.map((ri, i) => [ri, g_r[i]]);

    const line = d3.line()
      .x((d) => xScale(d[0]))
      .y((d) => yScale(d[1]));

    g.select(".rdf-line")
      .attr("d", line(points));

    const area = d3.area()
      .x((d) => xScale(d[0]))
      .y0(plotHeight)
      .y1((d) => yScale(d[1]));

    g.select(".rdf-area")
      .attr("d", area(points));

    g.select(".reference-line")
      .attr("x1", 0)
      .attr("y1", yScale(1))
      .attr("x2", plotWidth)
      .attr("y2", yScale(1));

    g.select(".sample-count")
      .text(`n=${sample_count}`);

    xAxis.selectAll(".x-label").remove();
    xAxis.append("text")
      .attr("class", "x-label")
      .attr("x", plotWidth / 2)
      .attr("y", 30)
      .attr("text-anchor", "middle")
      .attr("fill", "#8892a0")
      .attr("font-size", "11px")
      .text("r / σ");

    yAxis.selectAll(".y-label").remove();
    yAxis.append("text")
      .attr("class", "y-label")
      .attr("transform", "rotate(-90)")
      .attr("x", -plotHeight / 2)
      .attr("y", -35)
      .attr("text-anchor", "middle")
      .attr("fill", "#8892a0")
      .attr("font-size", "11px")
      .text("g(r)");
  }, [rdfData]);

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      className="rounded-lg bg-surface/50"
    />
  );
}
