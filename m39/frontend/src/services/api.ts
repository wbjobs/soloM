import {
  GraphDataWithMetadata,
  GraphStats,
  ThreatNode,
  LinkPredictionResult,
  ThreatPredictionResponse,
  ThreatPredictionOptions,
} from '../types';

const API_BASE = '/api';

export interface QueryOptions {
  maxNodes?: number;
  maxRelationships?: number;
  useCache?: boolean;
}

export async function fetchGraphByIP(
  ip: string,
  maxDepth: number = 2,
  options: QueryOptions = {}
): Promise<GraphDataWithMetadata> {
  const {
    maxNodes = 5000,
    maxRelationships = 10000,
    useCache = true,
  } = options;

  const response = await fetch(`${API_BASE}/threat/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ip,
      max_depth: maxDepth,
      max_nodes: maxNodes,
      max_relationships: maxRelationships,
      use_cache: useCache,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || '查询失败');
  }

  return response.json();
}

export async function fetchStats(): Promise<GraphStats> {
  const response = await fetch(`${API_BASE}/threat/stats`);
  if (!response.ok) {
    throw new Error('获取统计信息失败');
  }
  return response.json();
}

export async function fetchCacheStats(): Promise<{ cache_size: number; cache_ttl_seconds: number }> {
  const response = await fetch(`${API_BASE}/threat/cache/stats`);
  if (!response.ok) {
    throw new Error('获取缓存统计失败');
  }
  return response.json();
}

export async function clearCache(): Promise<void> {
  const response = await fetch(`${API_BASE}/threat/cache/clear`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('清除缓存失败');
  }
}

export async function fetchAllNodes(
  label?: string,
  skip: number = 0,
  limit: number = 50
): Promise<ThreatNode[]> {
  const params = new URLSearchParams();
  if (label) params.append('label', label);
  params.append('skip', String(skip));
  params.append('limit', String(limit));

  const response = await fetch(`${API_BASE}/threat/nodes?${params.toString()}`);
  if (!response.ok) {
    throw new Error('获取节点列表失败');
  }
  return response.json();
}

export async function createNode(
  label: string,
  name: string,
  properties: Record<string, any> = {}
): Promise<ThreatNode> {
  const response = await fetch(`${API_BASE}/threat/nodes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ label, name, properties }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || '创建节点失败');
  }

  return response.json();
}

export async function updateNode(
  nodeId: string,
  name?: string,
  properties?: Record<string, any>
): Promise<ThreatNode> {
  const response = await fetch(`${API_BASE}/threat/nodes/${encodeURIComponent(nodeId)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name, properties }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || '更新节点失败');
  }

  return response.json();
}

export async function deleteNode(nodeId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/threat/nodes/${encodeURIComponent(nodeId)}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || '删除节点失败');
  }
}

export async function createRelationship(
  sourceId: string,
  targetId: string,
  type: string,
  properties: Record<string, any> = {}
): Promise<any> {
  const response = await fetch(`${API_BASE}/threat/relationships`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      source_id: sourceId,
      target_id: targetId,
      type,
      properties,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || '创建关系失败');
  }

  return response.json();
}

export async function deleteRelationship(
  sourceId: string,
  targetId: string,
  type: string
): Promise<void> {
  const params = new URLSearchParams();
  params.append('source_id', sourceId);
  params.append('target_id', targetId);
  params.append('type', type);

  const response = await fetch(`${API_BASE}/threat/relationships?${params.toString()}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || '删除关系失败');
  }
}

export async function predictPotentialThreats(
  centerId: string,
  options: ThreatPredictionOptions = {}
): Promise<ThreatPredictionResponse> {
  const {
    max_depth = 3,
    top_k = 20,
    min_score = 0.3,
    include_graph_data = true,
  } = options;

  const response = await fetch(`${API_BASE}/threat/predict/threats`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      center_id: centerId,
      max_depth,
      top_k,
      min_score,
      include_graph_data,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || '预测失败');
  }

  return response.json();
}

export async function predictSingleLink(
  sourceId: string,
  targetId: string
): Promise<LinkPredictionResult> {
  const response = await fetch(`${API_BASE}/threat/predict/link`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      source_id: sourceId,
      target_id: targetId,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || '预测失败');
  }

  return response.json();
}

export async function getPredictionAlgorithms(): Promise<{
  algorithms: Array<{ name: string; description: string; weight: number }>;
  combination_method: string;
  confidence_thresholds: { high: number; medium: number; low: number };
}> {
  const response = await fetch(`${API_BASE}/threat/predict/algorithms`);
  if (!response.ok) {
    throw new Error('获取算法列表失败');
  }
  return response.json();
}

export async function clearPredictionCache(): Promise<void> {
  const response = await fetch(`${API_BASE}/threat/predict/cache/clear`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || '清除预测缓存失败');
  }
}
