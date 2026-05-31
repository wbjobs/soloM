import React, { useState, useEffect } from 'react';
import { message } from 'antd';
import { RadarChartOutlined } from '@ant-design/icons';
import QueryPanel from './components/QueryPanel';
import GraphCanvas from './components/GraphCanvas';
import LegendPanel from './components/LegendPanel';
import PredictionPanel from './components/PredictionPanel';
import { GraphDataWithMetadata, GraphStats, ThreatNode, LinkPredictionResult, ThreatPredictionResponse } from './types';
import { fetchGraphByIP, fetchStats, predictPotentialThreats, QueryOptions } from './services/api';
import { formatDuration } from './utils/performance';

const App: React.FC = () => {
  const [graphData, setGraphData] = useState<GraphDataWithMetadata | null>(null);
  const [stats, setStats] = useState<GraphStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [predictionLoading, setPredictionLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState<ThreatNode | null>(null);
  const [centerIp, setCenterIp] = useState<string>('');
  const [predictions, setPredictions] = useState<LinkPredictionResult[] | null>(null);
  const [showPredictions, setShowPredictions] = useState(true);
  const [predictionResponse, setPredictionResponse] = useState<ThreatPredictionResponse | null>(null);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const data = await fetchStats();
      setStats(data);
    } catch (error) {
      console.error('加载统计信息失败:', error);
    }
  };

  const handleQuery = async (ip: string, depth: number, options?: QueryOptions) => {
    setLoading(true);
    setGraphData(null);
    setSelectedNode(null);
    setCenterIp(ip);
    setPredictions(null);
    setPredictionResponse(null);

    try {
      const data = await fetchGraphByIP(ip, depth, options);

      const nodeCount = data.nodes.length;
      const relCount = data.relationships.length;
      const queryTime = data.metadata?.query_time_ms || 0;

      let infoMsg = `查询成功：${nodeCount} 个节点，${relCount} 条关系`;
      if (queryTime > 0) {
        infoMsg += `，查询耗时 ${formatDuration(queryTime)}`;
      }
      if (data.metadata?.is_truncated) {
        infoMsg += '（结果已截断）';
      }
      if (data.metadata?.used_cache) {
        infoMsg += '（使用缓存）';
      }

      if (data.metadata?.is_truncated) {
        message.warning(infoMsg);
      } else {
        message.success(infoMsg);
      }

      setGraphData(data);
      loadStats();
    } catch (error: any) {
      message.error(error.message || '查询失败，请确保后端服务正常运行');
      console.error('查询失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePredictThreats = async (ip: string, maxDepth: number, topK: number, minScore: number) => {
    setPredictionLoading(true);

    try {
      const response = await predictPotentialThreats(ip, {
        max_depth: maxDepth,
        top_k: topK,
        min_score: minScore,
        include_graph_data: false,
      });

      setPredictionResponse(response);
      setPredictions(response.predictions);
      setShowPredictions(true);

      const highCount = response.predictions.filter(p => p.confidence === 'high').length;
      const mediumCount = response.predictions.filter(p => p.confidence === 'medium').length;
      const lowCount = response.predictions.filter(p => p.confidence === 'low').length;

      message.success(
        `威胁预测完成：发现 ${response.predictions.length} 条潜在链路 ` +
        `（高置信 ${highCount}，中置信 ${mediumCount}，低置信 ${lowCount}）`
      );
    } catch (error: any) {
      message.error(error.message || '威胁预测失败');
      console.error('威胁预测失败:', error);
    } finally {
      setPredictionLoading(false);
    }
  };

  const handleTogglePredictions = () => {
    setShowPredictions(prev => !prev);
  };

  const handleNodeClick = (node: ThreatNode) => {
    setSelectedNode(node);
  };

  const handleCloseNode = () => {
    setSelectedNode(null);
  };

  return (
    <div className="app-container">
      <div className="app-header">
        <h1>
          <RadarChartOutlined />
          威胁情报知识图谱分析系统
        </h1>
        <div className="stats">
          <div className="stat-item">
            <span className="stat-label">IP节点</span>
            <span className="stat-value">{stats?.IP || 0}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">域名节点</span>
            <span className="stat-value">{stats?.Domain || 0}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">哈希节点</span>
            <span className="stat-value">{stats?.Hash || 0}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">漏洞节点</span>
            <span className="stat-value">{stats?.CVE || 0}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">关系总数</span>
            <span className="stat-value">{stats?.relationships || 0}</span>
          </div>
        </div>
      </div>

      <div className="app-content">
        <div className="sidebar">
          <QueryPanel
            onQuery={handleQuery}
            onPredictThreats={handlePredictThreats}
            onTogglePredictions={handleTogglePredictions}
            loading={loading}
            predictionLoading={predictionLoading}
            showPredictions={showPredictions}
            predictions={predictions}
          />
          {predictions && predictions.length > 0 && showPredictions && (
            <PredictionPanel
              predictions={predictions}
              predictionResponse={predictionResponse}
            />
          )}
          <LegendPanel selectedNode={selectedNode} onCloseNode={handleCloseNode} />
        </div>
        <GraphCanvas
          data={graphData}
          centerIp={centerIp}
          onNodeClick={handleNodeClick}
          loading={loading}
          predictions={predictions}
          showPredictions={showPredictions}
        />
      </div>
    </div>
  );
};

export default App;
