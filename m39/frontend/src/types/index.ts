export type NodeType = 'IP' | 'Domain' | 'Hash' | 'CVE';

export type RelationshipType =
  | 'RESOLVES_TO'
  | 'COMMUNICATES_WITH'
  | 'HOSTS'
  | 'DOWNLOADS'
  | 'EXPLOITS'
  | 'RELATED_TO'
  | 'BELONGS_TO'
  | 'INDICATES';

export interface ThreatNode {
  id: string;
  label: NodeType;
  name: string;
  properties: Record<string, any>;
}

export interface ThreatRelationship {
  source_id: string;
  target_id: string;
  type: RelationshipType;
  properties: Record<string, any>;
}

export interface GraphData {
  nodes: ThreatNode[];
  relationships: ThreatRelationship[];
}

export interface QueryMetadata {
  query_time_ms: number;
  node_count: number;
  relationship_count: number;
  query_depth: number;
  is_truncated: boolean;
  max_nodes_limit: number;
  max_relationships_limit: number;
  used_cache: boolean;
}

export interface GraphDataWithMetadata extends GraphData {
  metadata?: QueryMetadata;
}

export interface GraphStats {
  IP: number;
  Domain: number;
  Hash: number;
  CVE: number;
  relationships: number;
}

export interface AggregatedNode extends ThreatNode {
  isAggregated: boolean;
  aggregatedCount: number;
  aggregatedType: NodeType;
  childNodes: string[];
}

export interface RenderStrategy {
  mode: 'full' | 'sampled' | 'aggregated';
  sampleRate: number;
  showLabels: boolean;
  enableLayoutAnimation: boolean;
  renderEdges: boolean;
}

export const NODE_COLORS: Record<NodeType, string> = {
  IP: '#ef4444',
  Domain: '#f59e0b',
  Hash: '#8b5cf6',
  CVE: '#06b6d4',
};

export const NODE_LABELS: Record<NodeType, string> = {
  IP: 'IP 地址',
  Domain: '域名',
  Hash: '文件哈希',
  CVE: '漏洞',
};

export const RELATIONSHIP_LABELS: Record<RelationshipType, string> = {
  RESOLVES_TO: '解析至',
  COMMUNICATES_WITH: '通信',
  HOSTS: '托管',
  DOWNLOADS: '下载',
  EXPLOITS: '利用',
  RELATED_TO: '关联',
  BELONGS_TO: '属于',
  INDICATES: '指示',
};

export const PERFORMANCE_THRESHOLDS = {
  WARNING_NODE_COUNT: 200,
  CRITICAL_NODE_COUNT: 500,
  SAMPLE_MODE_THRESHOLD: 1000,
  AGGREGATE_MODE_THRESHOLD: 3000,
  MAX_DISPLAY_NODES: 5000,
  MAX_DISPLAY_EDGES: 10000,
};

export interface LinkPredictionResult {
  source_id: string;
  target_id: string;
  score: number;
  algorithms: Record<string, number>;
  combined_score: number;
  explanation: string;
  predicted_relationship: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface ThreatPredictionResponse {
  center_id: string;
  predictions: LinkPredictionResult[];
  graph_data?: GraphDataWithMetadata;
  prediction_metadata: {
    prediction_time_ms: number;
    total_candidates: number;
    prediction_count: number;
    center_node: string;
    max_depth: number;
    min_score: number;
    high_confidence_count: number;
    medium_confidence_count: number;
    low_confidence_count: number;
  };
}

export interface ThreatPredictionOptions {
  max_depth?: number;
  top_k?: number;
  min_score?: number;
  include_graph_data?: boolean;
}

export const PREDICTION_COLORS = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#10b981',
};

export const CONFIDENCE_LABELS: Record<string, string> = {
  high: '高置信',
  medium: '中置信',
  low: '低置信',
};
