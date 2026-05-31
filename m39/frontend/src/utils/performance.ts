import {
  ThreatNode,
  ThreatRelationship,
  NodeType,
  AggregatedNode,
  GraphData,
  RenderStrategy,
  PERFORMANCE_THRESHOLDS,
  NODE_COLORS,
} from '../types';

export function determineRenderStrategy(nodeCount: number, edgeCount: number): RenderStrategy {
  if (nodeCount >= PERFORMANCE_THRESHOLDS.AGGREGATE_MODE_THRESHOLD) {
    return {
      mode: 'aggregated',
      sampleRate: 0.3,
      showLabels: false,
      enableLayoutAnimation: false,
      renderEdges: false,
    };
  }

  if (nodeCount >= PERFORMANCE_THRESHOLDS.SAMPLE_MODE_THRESHOLD) {
    return {
      mode: 'sampled',
      sampleRate: Math.max(0.2, 500 / nodeCount),
      showLabels: false,
      enableLayoutAnimation: false,
      renderEdges: true,
    };
  }

  if (nodeCount >= PERFORMANCE_THRESHOLDS.CRITICAL_NODE_COUNT) {
    return {
      mode: 'full',
      sampleRate: 1,
      showLabels: false,
      enableLayoutAnimation: true,
      renderEdges: true,
    };
  }

  return {
    mode: 'full',
    sampleRate: 1,
    showLabels: true,
    enableLayoutAnimation: true,
    renderEdges: true,
  };
}

export function sampleNodes(nodes: ThreatNode[], sampleRate: number, centerIp?: string): ThreatNode[] {
  if (sampleRate >= 1) return nodes;

  const sampled: ThreatNode[] = [];
  const centerNode = nodes.find((n) => n.name === centerIp);
  if (centerNode) {
    sampled.push(centerNode);
  }

  const otherNodes = nodes.filter((n) => n.name !== centerIp);
  const sampleSize = Math.ceil(otherNodes.length * sampleRate);
  const step = Math.ceil(otherNodes.length / sampleSize);

  for (let i = 0; i < otherNodes.length; i += step) {
    sampled.push(otherNodes[i]);
  }

  return sampled;
}

export function filterEdgesForNodes(
  edges: ThreatRelationship[],
  nodeIds: Set<string>
): ThreatRelationship[] {
  return edges.filter(
    (edge) => nodeIds.has(edge.source_id) && nodeIds.has(edge.target_id)
  );
}

export function aggregateNodesByType(
  nodes: ThreatNode[],
  centerIp?: string
): { aggregatedNodes: AggregatedNode[]; originalToAggregated: Map<string, string> } {
  const nodesByType = new Map<NodeType, ThreatNode[]>();
  const originalToAggregated = new Map<string, string>();
  const aggregatedNodes: AggregatedNode[] = [];

  const centerNode = nodes.find((n) => n.name === centerIp);
  if (centerNode) {
    aggregatedNodes.push({
      ...centerNode,
      isAggregated: false,
      aggregatedCount: 1,
      aggregatedType: centerNode.label,
      childNodes: [centerNode.id],
    });
  }

  for (const node of nodes) {
    if (node.name === centerIp) continue;

    if (!nodesByType.has(node.label)) {
      nodesByType.set(node.label, []);
    }
    nodesByType.get(node.label)!.push(node);
  }

  let groupId = 0;
  for (const [type, typeNodes] of nodesByType.entries()) {
    const maxGroupSize = 200;
    for (let i = 0; i < typeNodes.length; i += maxGroupSize) {
      const groupNodes = typeNodes.slice(i, i + maxGroupSize);
      const aggId = `agg_${type}_${groupId++}`;

      const aggNode: AggregatedNode = {
        id: aggId,
        label: type,
        name: `${type} 节点 (${groupNodes.length}个)`,
        properties: {
          aggregated: true,
          count: groupNodes.length,
          nodeType: type,
        },
        isAggregated: true,
        aggregatedCount: groupNodes.length,
        aggregatedType: type,
        childNodes: groupNodes.map((n) => n.id),
      };

      aggregatedNodes.push(aggNode);

      for (const node of groupNodes) {
        originalToAggregated.set(node.id, aggId);
      }
    }
  }

  return { aggregatedNodes, originalToAggregated };
}

export function aggregateEdges(
  edges: ThreatRelationship[],
  originalToAggregated: Map<string, string>,
  centerIp?: string
): ThreatRelationship[] {
  const edgeMap = new Map<string, ThreatRelationship>();

  for (const edge of edges) {
    let sourceId = originalToAggregated.get(edge.source_id) || edge.source_id;
    let targetId = originalToAggregated.get(edge.target_id) || edge.target_id;

    if (sourceId === targetId) continue;

    const edgeKey = [sourceId, targetId].sort().join('|') + '|' + edge.type;

    if (!edgeMap.has(edgeKey)) {
      edgeMap.set(edgeKey, {
        source_id: sourceId,
        target_id: targetId,
        type: edge.type,
        properties: { aggregated: true, count: 1 },
      });
    } else {
      const existing = edgeMap.get(edgeKey)!;
      if (existing.properties) {
        existing.properties.count = (existing.properties.count || 0) + 1;
      }
    }
  }

  return Array.from(edgeMap.values());
}

export function getOptimizedGraphData(
  data: GraphData,
  centerIp: string
): {
  nodes: ThreatNode[];
  edges: ThreatRelationship[];
  strategy: RenderStrategy;
  isOptimized: boolean;
} {
  const nodeCount = data.nodes.length;
  const edgeCount = data.relationships.length;

  const strategy = determineRenderStrategy(nodeCount, edgeCount);

  if (strategy.mode === 'full' && strategy.sampleRate >= 1) {
    return {
      nodes: data.nodes,
      edges: data.relationships,
      strategy,
      isOptimized: false,
    };
  }

  if (strategy.mode === 'aggregated') {
    const { aggregatedNodes, originalToAggregated } = aggregateNodesByType(data.nodes, centerIp);
    const aggregatedEdges = aggregateEdges(data.relationships, originalToAggregated, centerIp);
    return {
      nodes: aggregatedNodes as unknown as ThreatNode[],
      edges: aggregatedEdges,
      strategy,
      isOptimized: true,
    };
  }

  if (strategy.mode === 'sampled') {
    const sampledNodes = sampleNodes(data.nodes, strategy.sampleRate, centerIp);
    const sampledNodeIds = new Set(sampledNodes.map((n) => n.id));
    const filteredEdges = filterEdgesForNodes(data.relationships, sampledNodeIds);
    return {
      nodes: sampledNodes,
      edges: filteredEdges,
      strategy,
      isOptimized: true,
    };
  }

  return {
    nodes: data.nodes,
    edges: data.relationships,
    strategy,
    isOptimized: false,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return ms.toFixed(2) + ' ms';
  return (ms / 1000).toFixed(2) + ' s';
}
