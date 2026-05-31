import { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
import type { CallGraph, CallGraphNode, CallGraphEdge } from '../../shared/types';
import { Maximize2, ZoomIn, ZoomOut, RotateCcw, Info, Filter } from 'lucide-react';

interface CallGraphProps {
  data: CallGraph;
}

interface D3Node extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  type: CallGraphNode['type'];
  contract: string;
  visibility: CallGraphNode['visibility'];
  line: number;
  isEntryPoint: boolean;
}

interface D3Link extends d3.SimulationLinkDatum<D3Node> {
  id: string;
  source: string | D3Node;
  target: string | D3Node;
  type: CallGraphEdge['type'];
  line: number;
}

const nodeColors: Record<CallGraphNode['type'], string> = {
  function: '#06b6d4',
  modifier: '#8b5cf6',
  event: '#f59e0b',
  fallback: '#ef4444',
  receive: '#10b981',
  constructor: '#3b82f6',
  external: '#ec4899',
};

const edgeColors: Record<CallGraphEdge['type'], string> = {
  call: '#06b6d4',
  delegatecall: '#ef4444',
  staticcall: '#3b82f6',
  send: '#f59e0b',
  transfer: '#f59e0b',
  emit: '#10b981',
  modifier: '#8b5cf6',
  inheritance: '#64748b',
};

const edgeDasharrays: Record<CallGraphEdge['type'], string> = {
  call: 'none',
  delegatecall: '8,4',
  staticcall: '4,4',
  send: '2,2',
  transfer: '2,2',
  emit: '6,3',
  modifier: '10,5',
  inheritance: '1,1',
};

export default function CallGraph({ data }: CallGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedNode, setSelectedNode] = useState<D3Node | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });
  const [visibleTypes, setVisibleTypes] = useState<Set<CallGraphNode['type']>>(
    new Set(['function', 'modifier', 'event', 'fallback', 'receive', 'constructor', 'external'])
  );
  const [visibleEdgeTypes, setVisibleEdgeTypes] = useState<Set<CallGraphEdge['type']>>(
    new Set(['call', 'delegatecall', 'staticcall', 'send', 'transfer', 'emit', 'modifier', 'inheritance'])
  );
  const [showFilters, setShowFilters] = useState(false);
  const gRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  const entryPointIds = new Set(data.entryPoints);

  const toggleType = useCallback((type: CallGraphNode['type']) => {
    setVisibleTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const toggleEdgeType = useCallback((type: CallGraphEdge['type']) => {
    setVisibleEdgeTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({ width: rect.width, height: Math.max(400, rect.height) });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  useEffect(() => {
    if (!svgRef.current || !dimensions.width) return;

    const width = dimensions.width;
    const height = dimensions.height;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    svg.attr('width', width).attr('height', height);

    const defs = svg.append('defs');

    for (const [type, color] of Object.entries(edgeColors)) {
      const marker = defs
        .append('marker')
        .attr('id', `arrow-${type}`)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 18)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto');
      marker
        .append('path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', color);
    }

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        if (gRef.current) {
          gRef.current.attr('transform', event.transform);
        }
      });

    svg.call(zoom);
    zoomRef.current = zoom;

    const g = svg.append('g').attr('class', 'everything');
    gRef.current = g;

    g.append('rect')
      .attr('width', width * 3)
      .attr('height', height * 3)
      .attr('x', -width)
      .attr('y', -height)
      .attr('fill', 'transparent')
      .attr('pointer-events', 'all');

    const linksG = g.append('g').attr('class', 'links');
    const nodesG = g.append('g').attr('class', 'nodes');

    const nodes: D3Node[] = data.nodes
      .filter(n => visibleTypes.has(n.type))
      .map(n => ({
        ...n,
        isEntryPoint: entryPointIds.has(n.id),
      }));

    const visibleNodeIds = new Set(nodes.map(n => n.id));

    const links: D3Link[] = data.edges
      .filter(e => visibleEdgeTypes.has(e.type))
      .filter(e => {
        const src = e.source as string;
        const tgt = e.target as string;
        return visibleNodeIds.has(src) && visibleNodeIds.has(tgt);
      })
      .map(e => ({ ...e }));

    const simulation = d3
      .forceSimulation<D3Node>(nodes)
      .force(
        'link',
        d3
          .forceLink<D3Node, D3Link>(links)
          .id(d => d.id)
          .distance(d => {
            if (d.type === 'inheritance') return 80;
            if (d.type === 'modifier') return 60;
            if (d.type === 'emit') return 90;
            return 120;
          })
      )
      .force('charge', d3.forceManyBody<D3Node>().strength(d => {
        if (d.type === 'constructor') return -400;
        if (d.isEntryPoint) return -500;
        if (d.type === 'external') return -300;
        return -200;
      }))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide<D3Node>().radius(d => {
        if (d.isEntryPoint) return 45;
        return 30;
      }))
      .force('x', d3.forceX(width / 2).strength(0.05))
      .force('y', d3.forceY(height / 2).strength(0.05));

    const link = linksG
      .selectAll('line')
      .data(links)
      .enter()
      .append('line')
      .attr('class', 'link')
      .attr('stroke', d => edgeColors[d.type])
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', d => {
        if (d.type === 'delegatecall') return 3;
        if (d.type === 'call') return 2;
        return 1.5;
      })
      .attr('stroke-dasharray', d => edgeDasharrays[d.type])
      .attr('marker-end', d => `url(#arrow-${d.type})`)
      .attr('data-type', d => d.type)
      .append('title')
      .text(d => `${d.type}: line ${d.line}`);

    const node = nodesG
      .selectAll('g')
      .data(nodes)
      .enter()
      .append('g')
      .attr('class', 'node')
      .attr('cursor', 'pointer')
      .call(
        d3
          .drag<SVGGElement, D3Node>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      )
      .on('click', (event, d) => {
        event.stopPropagation();
        setSelectedNode(d);
      })
      .on('mouseenter', function (event, d) {
        d3.select(this).raise();
        const connectedIds = new Set<string>([d.id]);
        links.forEach(l => {
          const srcId = l.source as string;
          const tgtId = l.target as string;
          if (srcId === d.id) connectedIds.add(tgtId);
          if (tgtId === d.id) connectedIds.add(srcId);
        });
        link
          .attr('stroke-opacity', l => {
            const srcId = l.source as string;
            const tgtId = l.target as string;
            return connectedIds.has(srcId) && connectedIds.has(tgtId) ? 1 : 0.1;
          })
          .attr('stroke-width', l => {
            const srcId = l.source as string;
            const tgtId = l.target as string;
            return connectedIds.has(srcId) && connectedIds.has(tgtId) ? 3 : 1;
          });
        node
          .attr('opacity', n => (connectedIds.has(n.id) ? 1 : 0.3));
      })
      .on('mouseleave', function () {
        link.attr('stroke-opacity', 0.6).attr('stroke-width', (l: any) => {
          if (l.type === 'delegatecall') return 3;
          if (l.type === 'call') return 2;
          return 1.5;
        });
        node.attr('opacity', 1);
      });

    node
      .append('circle')
      .attr('r', d => {
        if (d.isEntryPoint) return 28;
        if (d.type === 'constructor') return 24;
        if (d.type === 'external') return 22;
        return 20;
      })
      .attr('fill', d => nodeColors[d.type])
      .attr('stroke', d => (d.isEntryPoint ? '#fff' : 'none'))
      .attr('stroke-width', d => (d.isEntryPoint ? 3 : 0))
      .attr('stroke-dasharray', d => (d.type === 'constructor' ? '4,2' : 'none'))
      .style('filter', 'drop-shadow(0 2px 8px rgba(0,0,0,0.3))');

    node
      .append('text')
      .text(d => d.label)
      .attr('text-anchor', 'middle')
      .attr('dy', '.35em')
      .attr('fill', '#0f172a')
      .attr('font-size', d => {
        if (d.label.length > 12) return 9;
        if (d.label.length > 8) return 10;
        return 11;
      })
      .attr('font-weight', '600')
      .attr('pointer-events', 'none')
      .each(function (d) {
        const maxLength = 12;
        const text = d3.select(this);
        if (d.label.length > maxLength) {
          text.text(d.label.substring(0, maxLength) + '…');
        }
      });

    node
      .append('text')
      .attr('y', d => (d.isEntryPoint ? 42 : 34))
      .attr('text-anchor', 'middle')
      .attr('fill', '#94a3b8')
      .attr('font-size', 9)
      .attr('pointer-events', 'none')
      .text(d => d.contract.split('.')[0]);

    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as D3Node).x ?? 0)
        .attr('y1', d => (d.source as D3Node).y ?? 0)
        .attr('x2', d => (d.target as D3Node).x ?? 0)
        .attr('y2', d => (d.target as D3Node).y ?? 0);

      node.attr('transform', d => `translate(${d.x ?? 0}, ${d.y ?? 0})`);
    });

    svg.on('click', () => {
      setSelectedNode(null);
    });

    return () => {
      simulation.stop();
    };
  }, [data, dimensions, visibleTypes, visibleEdgeTypes, entryPointIds]);

  const zoomIn = () => {
    if (svgRef.current && zoomRef.current) {
      d3.select(svgRef.current).transition().duration(300).call(zoomRef.current.scaleBy, 1.3);
    }
  };

  const zoomOut = () => {
    if (svgRef.current && zoomRef.current) {
      d3.select(svgRef.current).transition().duration(300).call(zoomRef.current.scaleBy, 0.7);
    }
  };

  const resetView = () => {
    if (svgRef.current && zoomRef.current) {
      d3.select(svgRef.current).transition().duration(300).call(zoomRef.current.transform, d3.zoomIdentity);
    }
  };

  const nodeTypeLabels: Record<CallGraphNode['type'], string> = {
    function: '函数',
    modifier: '修饰器',
    event: '事件',
    fallback: 'fallback',
    receive: 'receive',
    constructor: '构造函数',
    external: '外部调用',
  };

  const edgeTypeLabels: Record<CallGraphEdge['type'], string> = {
    call: '调用',
    delegatecall: '委托调用',
    staticcall: '静态调用',
    send: 'send',
    transfer: 'transfer',
    emit: '发射事件',
    modifier: '修饰器',
    inheritance: '继承',
  };

  return (
    <div className="relative w-full h-full flex flex-col bg-block-bg/30 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-block-border bg-block-card/50">
        <div className="flex items-center gap-3">
          <h3 className="font-display font-semibold text-block-text text-sm">函数调用图</h3>
          <div className="flex items-center gap-2 text-xs text-block-text-muted">
            <span>{data.nodes.length} 节点</span>
            <span className="text-block-border">|</span>
            <span>{data.edges.length} 边</span>
            {data.entryPoints.length > 0 && (
              <>
                <span className="text-block-border">|</span>
                <span className="text-block-success">{data.entryPoints.length} 入口点</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            className={`p-1.5 rounded-md transition-colors ${showFilters ? 'bg-block-accent text-block-bg' : 'text-block-text-muted hover:bg-block-border/30 hover:text-block-text'}`}
            onClick={() => setShowFilters(!showFilters)}
            title="过滤器"
          >
            <Filter className="w-4 h-4" />
          </button>
          <button className="p-1.5 text-block-text-muted hover:bg-block-border/30 hover:text-block-text rounded-md transition-colors" onClick={zoomOut} title="缩小">
            <ZoomOut className="w-4 h-4" />
          </button>
          <button className="p-1.5 text-block-text-muted hover:bg-block-border/30 hover:text-block-text rounded-md transition-colors" onClick={zoomIn} title="放大">
            <ZoomIn className="w-4 h-4" />
          </button>
          <button className="p-1.5 text-block-text-muted hover:bg-block-border/30 hover:text-block-text rounded-md transition-colors" onClick={resetView} title="重置视图">
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="absolute top-12 right-3 z-10 bg-block-card border border-block-border rounded-xl shadow-2xl p-4 w-72 animate-fade-in">
          <h4 className="text-sm font-medium text-block-text mb-3">节点类型</h4>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {(Object.keys(nodeTypeLabels) as CallGraphNode['type'][]).map(type => (
              <label key={type} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={visibleTypes.has(type)}
                  onChange={() => toggleType(type)}
                  className="w-4 h-4 rounded border-block-border bg-block-bg text-block-accent focus:ring-block-accent"
                />
                <span className="flex items-center gap-1.5 text-xs">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: nodeColors[type] }} />
                  <span className="text-block-text">{nodeTypeLabels[type]}</span>
                </span>
              </label>
            ))}
          </div>
          <h4 className="text-sm font-medium text-block-text mb-3">边类型</h4>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(edgeTypeLabels) as CallGraphEdge['type'][]).map(type => (
              <label key={type} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={visibleEdgeTypes.has(type)}
                  onChange={() => toggleEdgeType(type)}
                  className="w-4 h-4 rounded border-block-border bg-block-bg text-block-accent focus:ring-block-accent"
                />
                <span className="flex items-center gap-1.5 text-xs">
                  <span className="w-4 h-0.5" style={{ backgroundColor: edgeColors[type], borderStyle: 'solid', borderTop: edgeDasharrays[type] !== 'none' ? `2px ${edgeColors[type]}` : 'none' }} />
                  <span className="text-block-text">{edgeTypeLabels[type]}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div ref={containerRef} className="flex-1 relative">
        <svg ref={svgRef} className="w-full h-full" />

        {selectedNode && (
          <div className="absolute bottom-3 left-3 right-3 bg-block-card border border-block-border/50 rounded-xl p-4 shadow-2xl animate-slide-in">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: nodeColors[selectedNode.type] }}
                >
                  <Maximize2 className="w-5 h-5 text-block-bg" />
                </div>
                <div>
                  <h4 className="font-semibold text-block-text">{selectedNode.label}</h4>
                  <p className="text-xs text-block-text-muted">
                    {selectedNode.contract} · 第 {selectedNode.line} 行
                  </p>
                </div>
              </div>
              {selectedNode.isEntryPoint && (
                <span className="px-2 py-1 bg-block-success/20 text-block-success text-xs rounded-full font-medium">
                  入口点
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 mt-3 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: nodeColors[selectedNode.type] }} />
                <span className="text-block-text-muted">类型:</span>
                <span className="text-block-text">{nodeTypeLabels[selectedNode.type]}</span>
              </div>
              <div>
                <span className="text-block-text-muted">可见性:</span>
                <span className="text-block-text ml-1">{selectedNode.visibility}</span>
              </div>
              <div>
                <span className="text-block-text-muted">合约:</span>
                <span className="text-block-text ml-1">{selectedNode.contract}</span>
              </div>
            </div>
            <p className="text-xs text-block-text-muted mt-3 flex items-center gap-1">
              <Info className="w-3 h-3" />
              拖拽节点可调整位置，滚轮可缩放视图
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 px-4 py-2 border-t border-block-border bg-block-card/50 text-xs">
        {(Object.entries(nodeTypeLabels) as [CallGraphNode['type'], string][]).map(([type, label]) => (
          <div key={type} className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: nodeColors[type] }} />
            <span className="text-block-text-muted">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
