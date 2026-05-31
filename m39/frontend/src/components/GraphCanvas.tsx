import React, { useEffect, useRef, useState, useCallback } from 'react';
import G6 from '@antv/g6';
import { Alert, Modal } from 'antd';
import {
  ThreatNode,
  NODE_COLORS,
  NODE_LABELS,
  RELATIONSHIP_LABELS,
  GraphDataWithMetadata,
  QueryMetadata,
  PERFORMANCE_THRESHOLDS,
  RenderStrategy,
  LinkPredictionResult,
  PREDICTION_COLORS,
} from '../types';
import {
  getOptimizedGraphData,
  formatDuration,
} from '../utils/performance';

interface GraphCanvasProps {
  data: GraphDataWithMetadata | null;
  centerIp: string;
  onNodeClick: (node: ThreatNode) => void;
  loading: boolean;
  predictions?: LinkPredictionResult[] | null;
  showPredictions: boolean;
}

const GraphCanvas: React.FC<GraphCanvasProps> = ({
  data, centerIp, onNodeClick, loading, predictions, showPredictions }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<any>(null);
  const [renderStrategy, setRenderStrategy] = useState<RenderStrategy | null>(null);
  const [isOptimized, setIsOptimized] = useState(false);
  const [showPerformanceWarning, setShowPerformanceWarning] = useState(false);
  const [performanceInfo, setPerformanceInfo] = useState<{
    originalNodeCount: number;
    originalEdgeCount: number;
    renderedNodeCount: number;
    renderedEdgeCount: number;
    renderTime: number;
    metadata?: QueryMetadata;
  } | null>(null);

  const transformNode = useCallback(
    (node: ThreatNode, strategy: RenderStrategy, predictedTargets?: Set<string>, predictionMap?: Map<string, LinkPredictionResult>): any => {
    const isAggregated = (node as any).isAggregated;
    const baseSize = isAggregated ? 50 + Math.min((node as any).aggregatedCount / 10, 30) : 30;

    const isPredicted = predictedTargets?.has(node.id);
    const prediction = predictionMap?.get(node.id);

    const predictedColor = prediction ? PREDICTION_COLORS[prediction.confidence] : NODE_COLORS[node.label];

    return {
      id: node.id,
      label: strategy.showLabels
        ? node.name.length > 15
          ? node.name.substring(0, 12) + '...'
          : node.name
        : '',
      type: isAggregated ? 'diamond' : node.label === 'IP' && node.name.startsWith('192.168') ? 'diamond' : 'circle',
      size: isPredicted ? baseSize * 1.3 : baseSize,
      color: isPredicted ? predictedColor : NODE_COLORS[node.label],
      style: {
        fill: isAggregated ? `url(#agg-${node.label})` : isPredicted ? predictedColor : NODE_COLORS[node.label],
        stroke: isPredicted ? predictedColor : NODE_COLORS[node.label],
        lineWidth: isPredicted ? 4 : isAggregated ? 3 : 2,
        opacity: 0.9,
        shadowBlur: isPredicted ? 25 : isAggregated ? 20 : 5,
        shadowColor: isPredicted ? predictedColor : NODE_COLORS[node.label],
      },
      labelCfg: {
        style: {
          fill: '#e7e9ea',
          fontSize: isPredicted ? 12 : 10,
          fontWeight: isPredicted ? 'bold' : 'normal',
        },
        position: 'bottom',
      },
      nodeType: node.label,
      originalData: node,
      isAggregated,
      isPredicted,
      prediction,
    };
  },
  []
);

const transformEdge = useCallback(
  (rel: any, index: number, strategy: RenderStrategy, predictedEdges?: Set<string>, predictionMap?: Map<string, LinkPredictionResult>): any => {
    const isAggregated = rel.properties?.aggregated;
    const count = rel.properties?.count || 1;

    const edgeKey = `${rel.source_id}|${rel.target_id}`;
    const isPredicted = predictedEdges?.has(edgeKey);
    const prediction = predictionMap?.get(edgeKey);

    const predictedColor = prediction ? PREDICTION_COLORS[prediction.confidence] : '#5b7083';

    return {
      id: `edge_${index}`,
      source: rel.source_id,
      target: rel.target_id,
      label: strategy.showLabels ? RELATIONSHIP_LABELS[rel.type as keyof typeof RELATIONSHIP_LABELS] || rel.type : '',
      type: 'quadratic',
      curveOffset: isAggregated ? 10 : 20,
      style: {
        stroke: isPredicted ? predictedColor : isAggregated ? '#f59e0b' : '#5b7083',
        lineWidth: isPredicted ? 4 : isAggregated ? Math.min(count / 2, 5) : 1.5,
        opacity: isPredicted ? 1 : isAggregated ? 0.8 : 0.6,
        lineDash: isPredicted ? [5, 5] : null,
        endArrow: strategy.renderEdges
          ? {
              path: G6.Arrow.triangle(isPredicted ? 10 : 6, isPredicted ? 12 : 8, 0),
              fill: isPredicted ? predictedColor : isAggregated ? '#f59e0b' : '#5b7083',
            }
          : undefined,
      },
      labelCfg: {
        autoRotate: true,
        style: {
          fill: isPredicted ? predictedColor : '#8899a6',
          fontSize: isPredicted ? 11 : 9,
          background: {
            fill: '#15181c',
            padding: [2, 4],
            radius: 2,
          },
          fontWeight: isPredicted ? 'bold' : 'normal',
        },
      },
      relType: rel.type,
      isPredicted,
      prediction,
    };
  },
  []
);

  useEffect(() => {
    if (!containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const graph = new G6.Graph({
      container: containerRef.current,
      width,
      height,
      renderer: 'canvas',
      modes: {
        default: ['drag-canvas', 'zoom-canvas', 'drag-node', 'click-select'],
      },
      layout: {
        type: 'force',
        linkDistance: 120,
        nodeStrength: -300,
        collideStrength: 0.6,
        alpha: 0.2,
        alphaDecay: 0.028,
        alphaMin: 0.005,
      },
      defaultNode: {
        type: 'circle',
        size: 30,
        style: {
          lineWidth: 2,
          opacity: 0.9,
        },
        labelCfg: {
          style: {
            fill: '#e7e9ea',
            fontSize: 10,
          },
          position: 'bottom',
        },
      },
      defaultEdge: {
        type: 'quadratic',
        style: {
          lineWidth: 1.5,
          opacity: 0.6,
        },
      },
    });

    graph.on('node:click', (e: any) => {
      if (e.item) {
        const model = e.item.getModel();
        const originalData = model.originalData as ThreatNode;
        if (model.isPredicted && model.prediction) {
          Modal.info({
            title: '预测目标节点',
            content: (
              <div>
                <p><strong>预测置信度:</strong> {model.prediction.confidence === 'high' ? '高' : model.prediction.confidence === 'medium' ? '中' : '低'}</p>
                <p><strong>预测评分:</strong> {model.prediction.combined_score.toFixed(3)}</p>
                <p><strong>预测关系:</strong> {RELATIONSHIP_LABELS[model.prediction.predicted_relationship as keyof typeof RELATIONSHIP_LABELS] || model.prediction.predicted_relationship}</p>
                <p style={{ marginTop: 8, fontSize: 12, color: '#8899a6' }}>{model.prediction.explanation}</p>
              </div>
            ),
          });
        } else if (model.isAggregated) {
          Modal.info({
            title: '聚合节点',
            content: (
              <div>
                <p>这是一个聚合节点，包含 {(originalData as any).aggregatedCount} 个同类型节点</p>
                <p>节点类型：{NODE_LABELS[originalData.label]}</p>
              </div>
            ),
          });
        } else {
          onNodeClick(originalData);
        }
      }
    });

    graph.on('edge:click', (e: any) => {
      if (e.item) {
        const model = e.item.getModel();
        if (model.isPredicted && model.prediction) {
          Modal.info({
            title: '预测攻击链路',
            content: (
              <div>
                <p><strong>源节点:</strong> {model.source}</p>
                <p><strong>目标节点:</strong> {model.target}</p>
                <p><strong>预测置信度:</strong> {model.prediction.confidence === 'high' ? '高' : model.prediction.confidence === 'medium' ? '中' : '低'}</p>
                <p><strong>预测评分:</strong> {model.prediction.combined_score.toFixed(3)}</p>
                <p><strong>预测关系:</strong> {RELATIONSHIP_LABELS[model.prediction.predicted_relationship as keyof typeof RELATIONSHIP_LABELS] || model.prediction.predicted_relationship}</p>
                <p style={{ marginTop: 8, fontSize: 12, color: '#8899a6' }}>{model.prediction.explanation}</p>
              </div>
            ),
          });
        }
      }
    });

    graph.on('node:mouseenter', (e: any) => {
      graph.setItemState(e.item, 'hover', true);
    });

    graph.on('node:mouseleave', (e: any) => {
      graph.setItemState(e.item, 'hover', false);
    });

    graphRef.current = graph;

    const handleResize = () => {
      if (containerRef.current && graphRef.current) {
        graphRef.current.changeSize(
          containerRef.current.clientWidth,
          containerRef.current.clientHeight
        );
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      graph.destroy();
    };
  }, [onNodeClick]);

  useEffect(() => {
    if (!graphRef.current || !data) {
      if (graphRef.current && !data) {
        graphRef.current.data({ nodes: [], edges: [] });
        graphRef.current.render();
      }
      return;
    }

    const renderStartTime = performance.now();

    const originalNodeCount = data.nodes.length;
    const originalEdgeCount = data.relationships.length;

    if (originalNodeCount >= PERFORMANCE_THRESHOLDS.WARNING_NODE_COUNT) {
      setShowPerformanceWarning(true);
    }

    const optimized = getOptimizedGraphData(
      { nodes: data.nodes, relationships: data.relationships },
      centerIp
    );

    setRenderStrategy(optimized.strategy);
    setIsOptimized(optimized.isOptimized);

    if (optimized.strategy.mode === 'aggregated') {
      graphRef.current.get('canvas').set('cache', true);
    } else {
      graphRef.current.get('canvas').set('cache', false);
    }

    const predictedTargets = new Set<string>();
    const predictionNodeMap = new Map<string, LinkPredictionResult>();
    const predictedEdges = new Set<string>();
    const predictionEdgeMap = new Map<string, LinkPredictionResult>();

    if (showPredictions && predictions && predictions.length > 0) {
      for (const pred of predictions) {
        predictedTargets.add(pred.target_id);
        predictionNodeMap.set(pred.target_id, pred);
        const edgeKey = `${pred.source_id}|${pred.target_id}`;
        predictedEdges.add(edgeKey);
        predictionEdgeMap.set(edgeKey, pred);
      }
    }

    const g6Data: any = {
      nodes: optimized.nodes.map((n) => transformNode(n, optimized.strategy, predictedTargets, predictionNodeMap)),
      edges: optimized.strategy.renderEdges
        ? optimized.edges.map((e, i) => transformEdge(e, i, optimized.strategy, predictedEdges, predictionEdgeMap))
        : [],
    };

    if (!optimized.strategy.enableLayoutAnimation) {
      const layout = graphRef.current.get('layoutController');
      if (layout) {
        layout.destroyLayout();
      }
    }

    graphRef.current.data(g6Data);
    graphRef.current.render();

    if (!optimized.strategy.enableLayoutAnimation) {
      graphRef.current.fitView(50);
    }

    const renderEndTime = performance.now();

    setPerformanceInfo({
      originalNodeCount,
      originalEdgeCount,
      renderedNodeCount: optimized.nodes.length,
      renderedEdgeCount: optimized.edges.length,
      renderTime: renderEndTime - renderStartTime,
      metadata: data.metadata,
    });
  }, [data, centerIp, transformNode, transformEdge, predictions, showPredictions]);

  const handleZoomIn = () => {
    graphRef.current?.zoomTo(graphRef.current.getZoom() * 1.2);
  };

  const handleZoomOut = () => {
    graphRef.current?.zoomTo(graphRef.current.getZoom() * 0.8);
  };

  const handleFitView = () => {
    graphRef.current?.fitView(30);
  };

  const handleRelayout = () => {
    if (graphRef.current) {
      const layout = graphRef.current.get('layoutController');
      if (layout) {
        layout.relayout();
      }
    }
  };

  return (
    <div className="graph-container" ref={containerRef}>
      <div className="graph-toolbar">
        <button
          onClick={handleZoomIn}
          style={{
            padding: '6px 12px',
            background: '#1da1f2',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          放大
        </button>
        <button
          onClick={handleZoomOut}
          style={{
            padding: '6px 12px',
            background: '#1da1f2',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          缩小
        </button>
        <button
          onClick={handleFitView}
          style={{
            padding: '6px 12px',
            background: '#1da1f2',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          适应
        </button>
        <button
          onClick={handleRelayout}
          style={{
            padding: '6px 12px',
            background: '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          重排
        </button>
      </div>

      {showPerformanceWarning && performanceInfo && (
        <div
          style={{
            position: 'absolute',
            top: 60,
            right: 16,
            left: 16,
            zIndex: 20,
          }}
        >
          <Alert
            message={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>
                  {isOptimized ? (
                    <strong>性能优化已启用</strong>
                  ) : (
                    <strong>大数据量警告</strong>
                  )}
                  <span style={{ marginLeft: 12, fontSize: 12, opacity: 0.9 }}>
                    原始节点: {performanceInfo.originalNodeCount} |
                    原始关系: {performanceInfo.originalEdgeCount} |
                    渲染节点: {performanceInfo.renderedNodeCount} |
                    渲染时间: {formatDuration(performanceInfo.renderTime)}
                    {performanceInfo.metadata && (
                      <span>
                        {' | '}
                        查询时间: {formatDuration(performanceInfo.metadata.query_time_ms)}
                        {performanceInfo.metadata.used_cache && ' (缓存)'}
                      </span>
                    )}
                    {renderStrategy && (
                      <span>
                        {' | '}
                        模式: {renderStrategy.mode === 'full' ? '完整' : renderStrategy.mode === 'sampled' ? '采样' : '聚合'}
                      </span>
                    )}
                    {showPredictions && predictions && (
                      <span>
                        {' | '}
                        预测链路: {predictions.length}
                      </span>
                    )}
                  </span>
                </span>
                <button
                  onClick={() => setShowPerformanceWarning(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'inherit',
                    cursor: 'pointer',
                    fontSize: '16px',
                  }}
                >
                  ×
                </button>
              </div>
            }
            type={isOptimized ? 'info' : 'warning'}
            showIcon
            banner
          />
        </div>
      )}

      {loading && (
        <div className="graph-loading">
          <div style={{ fontSize: '16px', color: '#1da1f2' }}>正在加载图谱数据...</div>
        </div>
      )}

      {!data && !loading && (
        <div className="empty-state">
          <div className="empty-state-icon" style={{ fontSize: 64, marginBottom: 16, opacity: 0.3 }}>
            🕸️
          </div>
          <div className="empty-state-text" style={{ fontSize: 14, textAlign: 'center' }}>
            请在左侧输入恶意IP地址
            <br />
            点击查询按钮查看关联图谱
          </div>
        </div>
      )}
    </div>
  );
};

export default GraphCanvas;
