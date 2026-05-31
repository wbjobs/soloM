import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { sankey, sankeyLinkHorizontal } from 'd3-sankey';

const SankeyChart = ({ data, onNodeClick, selectedNode }) => {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 900, height: 600 });
  const tooltipRef = useRef(null);

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { width } = containerRef.current.getBoundingClientRect();
        setDimensions({ width: Math.max(width, 600), height: 600 });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  useEffect(() => {
    if (!data || !svgRef.current || !data.nodes || !data.links) return;

    const { width, height } = dimensions;
    const margin = { top: 20, right: 280, bottom: 20, left: 20 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const g = svg
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const colorScale = d3.scaleOrdinal()
      .domain(data.nodes.map(d => d.id))
      .range([
        '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
        '#ec4899', '#f43f5e', '#ef4444', '#f97316',
        '#eab308', '#84cc16', '#22c55e', '#10b981',
        '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6'
      ]);

    const nodeMap = new Map();
    data.nodes.forEach(node => {
      nodeMap.set(node.id, { ...node });
    });

    const sankeyData = {
      nodes: data.nodes.map(d => ({ ...nodeMap.get(d.id) })),
      links: data.links.map(d => ({
        source: d.source,
        target: d.target,
        value: d.value,
        probability: d.probability
      }))
    };

    const sankeyGenerator = sankey()
      .nodeWidth(24)
      .nodePadding(16)
      .extent([[0, 0], [innerWidth, innerHeight]]);

    const { nodes, links } = sankeyGenerator({
      nodes: sankeyData.nodes.map(d => ({ ...d })),
      links: sankeyData.links.map(d => ({ ...d }))
    });

    const defs = g.append('defs');

    links.forEach((link, i) => {
      const gradient = defs.append('linearGradient')
        .attr('id', `gradient-${i}`)
        .attr('gradientUnits', 'userSpaceOnUse')
        .attr('x1', link.source.x1)
        .attr('x2', link.target.x0);

      gradient.append('stop')
        .attr('offset', '0%')
        .attr('stop-color', colorScale(link.source.id));

      gradient.append('stop')
        .attr('offset', '100%')
        .attr('stop-color', colorScale(link.target.id));
    });

    const getLinkOpacity = (link) => {
      if (!selectedNode) return 0.4;
      const sourceName = data.nodes[link.source.id || link.source]?.name;
      const targetName = data.nodes[link.target.id || link.target]?.name;
      if (sourceName === selectedNode || targetName === selectedNode) return 0.8;
      return 0.08;
    };

    const linkGroup = g.append('g').attr('class', 'links');

    linkGroup
      .selectAll('path')
      .data(links)
      .join('path')
      .attr('d', sankeyLinkHorizontal())
      .attr('fill', 'none')
      .attr('stroke', (d, i) => `url(#gradient-${i})`)
      .attr('stroke-width', d => Math.max(1, d.width))
      .attr('stroke-opacity', d => getLinkOpacity(d))
      .style('cursor', 'pointer')
      .on('mouseover', function (event, d) {
        d3.select(this).attr('stroke-opacity', 0.9);
        showTooltip(event, {
          type: 'link',
          source: data.nodes[d.source.id || d.source]?.name,
          target: data.nodes[d.target.id || d.target]?.name,
          value: d.value,
          probability: d.probability
        });
      })
      .on('mousemove', function (event) {
        moveTooltip(event);
      })
      .on('mouseout', function (event, d) {
        d3.select(this).attr('stroke-opacity', getLinkOpacity(d));
        hideTooltip();
      });

    const getNodeOpacity = (node) => {
      if (!selectedNode) return 1;
      if (data.nodes[node.id]?.name === selectedNode) return 1;

      const hasConnection = links.some(link => {
        const sourceName = data.nodes[link.source.id || link.source]?.name;
        const targetName = data.nodes[link.target.id || link.target]?.name;
        return (sourceName === selectedNode && targetName === data.nodes[node.id]?.name) ||
               (targetName === selectedNode && sourceName === data.nodes[node.id]?.name);
      });

      return hasConnection ? 1 : 0.3;
    };

    const nodeGroup = g.append('g').attr('class', 'nodes');

    const nodesEnter = nodeGroup
      .selectAll('g')
      .data(nodes)
      .join('g')
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        onNodeClick(data.nodes[d.id]?.name);
      })
      .on('mouseover', function (event, d) {
        showTooltip(event, {
          type: 'node',
          name: data.nodes[d.id]?.name,
          visit_count: data.nodes[d.id]?.visit_count,
          conversion_rate: data.nodes[d.id]?.conversion_rate,
          entry_rate: data.nodes[d.id]?.entry_rate
        });
      })
      .on('mousemove', function (event) {
        moveTooltip(event);
      })
      .on('mouseout', function () {
        hideTooltip();
      });

    nodesEnter
      .append('rect')
      .attr('x', d => d.x0)
      .attr('y', d => d.y0)
      .attr('height', d => Math.max(1, d.y1 - d.y0))
      .attr('width', d => d.x1 - d.x0)
      .attr('fill', d => colorScale(d.id))
      .attr('opacity', d => getNodeOpacity(d))
      .attr('rx', 4)
      .attr('stroke', d => 
        data.nodes[d.id]?.name === selectedNode ? '#1e1b4b' : 'transparent'
      )
      .attr('stroke-width', 2);

    const labelGroups = nodesEnter.append('g').attr('class', 'node-label');

    const labelMaxWidth = d => {
      if (d.x0 < innerWidth / 2) {
        return Math.max(100, innerWidth - d.x1 - 16);
      } else {
        return Math.max(100, d.x0 - 16);
      }
    };

    const getTruncatedText = (text, maxWidth, fontSize = 12) => {
      const avgCharWidth = fontSize * 0.6;
      const maxChars = Math.floor(maxWidth / avgCharWidth);
      if (text.length <= maxChars) return text;
      return text.substring(0, Math.max(1, maxChars - 3)) + '...';
    };

    labelGroups
      .append('rect')
      .attr('class', 'label-bg')
      .attr('x', d => {
        const isLeft = d.x0 < innerWidth / 2;
        const text = data.nodes[d.id]?.name || '';
        const maxW = labelMaxWidth(d);
        const truncated = getTruncatedText(text, maxW);
        const textWidth = Math.min(truncated.length * 7.2, maxW);
        return isLeft ? d.x1 + 4 : d.x0 - textWidth - 8;
      })
      .attr('y', d => (d.y0 + d.y1) / 2 - 9)
      .attr('width', d => {
        const text = data.nodes[d.id]?.name || '';
        const maxW = labelMaxWidth(d);
        const truncated = getTruncatedText(text, maxW);
        return Math.min(truncated.length * 7.2 + 8, maxW + 8);
      })
      .attr('height', 18)
      .attr('rx', 3)
      .attr('fill', 'rgba(255, 255, 255, 0.92)')
      .attr('stroke', '#e2e8f0')
      .attr('stroke-width', 0.5)
      .attr('opacity', d => getNodeOpacity(d));

    labelGroups
      .append('text')
      .attr('x', d => d.x0 < innerWidth / 2 ? d.x1 + 8 : d.x0 - 8)
      .attr('y', d => (d.y0 + d.y1) / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', d => d.x0 < innerWidth / 2 ? 'start' : 'end')
      .attr('fill', '#1f2937')
      .attr('font-size', '12px')
      .attr('font-weight', '500')
      .attr('opacity', d => getNodeOpacity(d))
      .each(function(d) {
        const text = data.nodes[d.id]?.name || '';
        const maxW = labelMaxWidth(d);
        const truncated = getTruncatedText(text, maxW);
        d3.select(this).text(truncated);
        
        const isLeft = d.x0 < innerWidth / 2;
        const bgRect = d3.select(this.parentNode).select('.label-bg');
        const actualWidth = this.getComputedTextLength();
        
        bgRect
          .attr('x', isLeft ? d.x1 + 4 : d.x0 - actualWidth - 12)
          .attr('width', actualWidth + 8);
      })
      .append('title')
      .text(d => data.nodes[d.id]?.name || '');

    const showTooltip = (event, data) => {
      const tooltip = d3.select(tooltipRef.current);
      tooltip.style('display', 'block');

      let content = '';
      if (data.type === 'node') {
        content = `
          <div class="tooltip-title">${data.name}</div>
          <div class="tooltip-item">访问次数: <span class="tooltip-value">${data.visit_count}</span></div>
          <div class="tooltip-item">转化率: <span class="tooltip-value">${data.conversion_rate}%</span></div>
          <div class="tooltip-item">入口率: <span class="tooltip-value">${data.entry_rate}%</span></div>
        `;
      } else {
        content = `
          <div class="tooltip-title">${data.source} → ${data.target}</div>
          <div class="tooltip-item">用户数: <span class="tooltip-value">${data.value}</span></div>
          <div class="tooltip-item">流转概率: <span class="tooltip-value">${data.probability}%</span></div>
        `;
      }

      tooltip.html(content);
    };

    const moveTooltip = (event) => {
      const tooltip = d3.select(tooltipRef.current);
      const x = event.pageX + 15;
      const y = event.pageY + 15;
      tooltip.style('left', `${x}px`).style('top', `${y}px`);
    };

    const hideTooltip = () => {
      d3.select(tooltipRef.current).style('display', 'none');
    };

  }, [data, dimensions, selectedNode, onNodeClick]);

  return (
    <div className="sankey-container" ref={containerRef}>
      <svg ref={svgRef} className="sankey-svg"></svg>
      <div ref={tooltipRef} className="sankey-tooltip"></div>
    </div>
  );
};

export default SankeyChart;
