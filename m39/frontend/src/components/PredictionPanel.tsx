import React, { useState } from 'react';
import { List, Tag, Badge, Collapse, Progress } from 'antd';
import { ThunderboltOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { LinkPredictionResult, ThreatPredictionResponse, PREDICTION_COLORS, RELATIONSHIP_LABELS } from '../types';

const { Panel } = Collapse;

interface PredictionPanelProps {
  predictions: LinkPredictionResult[];
  predictionResponse: ThreatPredictionResponse | null;
}

const PredictionPanel: React.FC<PredictionPanelProps> = ({ predictions, predictionResponse }) => {
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);

  const getConfidenceLabel = (confidence: string) => {
    switch (confidence) {
      case 'high': return '高置信';
      case 'medium': return '中置信';
      case 'low': return '低置信';
      default: return confidence;
    }
  };

  const getConfidenceColor = (confidence: string) => {
    return PREDICTION_COLORS[confidence as keyof typeof PREDICTION_COLORS] || '#8899a6';
  };

  const handleToggle = (keys: string | string[]) => {
    setExpandedKeys(Array.isArray(keys) ? keys : [keys]);
  };

  const algorithmLabels: Record<string, string> = {
    common_neighbors: '共同邻居',
    jaccard: 'Jaccard系数',
    adamic_adar: 'Adamic-Adar',
    resource_allocation: '资源分配',
    preferential_attachment: '优先连接',
    embedding_similarity: 'GNN嵌入',
    path_distance: '路径距离',
  };

  return (
    <div className="sidebar-section" style={{ marginTop: 16 }}>
      <div className="sidebar-title">
        <ThunderboltOutlined />
        预测结果详情
      </div>

      {predictionResponse && (
        <div style={{ marginBottom: 12, padding: 8, background: '#1c1f26', borderRadius: 4, fontSize: 12 }}>
          <div style={{ color: '#8899a6', marginBottom: 4 }}>预测统计</div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>候选节点对: {predictionResponse.prediction_metadata.total_candidates}</span>
            <span>预测耗时: {predictionResponse.prediction_metadata.prediction_time_ms.toFixed(0)}ms</span>
          </div>
        </div>
      )}

      <Collapse
        ghost
        activeKey={expandedKeys}
        onChange={handleToggle}
        style={{ maxHeight: 400, overflowY: 'auto' }}
      >
        {predictions.map((pred, index) => (
          <Panel
            key={index.toString()}
            header={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                  <Badge
                    color={getConfidenceColor(pred.confidence)}
                  />
                  <span style={{ fontSize: 12, color: '#e7e9ea', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {pred.source_id.substring(0, 15)} → {pred.target_id.substring(0, 15)}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <Tag
                    color={getConfidenceColor(pred.confidence)}
                    style={{ margin: 0, fontSize: 11 }}
                  >
                    {getConfidenceLabel(pred.confidence)}
                  </Tag>
                  <span style={{ fontSize: 12, color: '#8899a6', minWidth: 45, textAlign: 'right' }}>
                    {(pred.combined_score * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            }
          >
            <div style={{ padding: '8px 4px', fontSize: 12 }}>
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: '#8899a6' }}>综合评分</span>
                  <span style={{ color: getConfidenceColor(pred.confidence), fontWeight: 'bold' }}>
                    {(pred.combined_score * 100).toFixed(2)}%
                  </span>
                </div>
                <Progress
                  percent={pred.combined_score * 100}
                  strokeColor={getConfidenceColor(pred.confidence)}
                  showInfo={false}
                  size="small"
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <div style={{ color: '#8899a6', marginBottom: 6 }}>预测关系</div>
                <Tag color="blue" style={{ margin: 0 }}>
                  {RELATIONSHIP_LABELS[pred.predicted_relationship as keyof typeof RELATIONSHIP_LABELS] || pred.predicted_relationship}
                </Tag>
              </div>

              <div style={{ marginBottom: 12 }}>
                <div style={{ color: '#8899a6', marginBottom: 6 }}>算法详情</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {Object.entries(pred.algorithms).map(([key, value]) => (
                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                      <span style={{ color: '#8899a6' }}>{algorithmLabels[key] || key}</span>
                      <span style={{ color: '#e7e9ea' }}>
                        {typeof value === 'number' ? value.toFixed(4) : String(value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ padding: 8, background: '#1c1f26', borderRadius: 4, borderLeft: '3px solid ' + getConfidenceColor(pred.confidence) }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                  <InfoCircleOutlined style={{ color: getConfidenceColor(pred.confidence) }} />
                  <span style={{ color: getConfidenceColor(pred.confidence), fontWeight: 'bold' }}>预测说明</span>
                </div>
                <p style={{ color: '#8899a6', fontSize: 11, margin: 0, lineHeight: 1.5 }}>
                  {pred.explanation}
                </p>
              </div>
            </div>
          </Panel>
        ))}
      </Collapse>
    </div>
  );
};

export default PredictionPanel;
