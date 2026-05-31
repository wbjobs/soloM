import React, { useState, useEffect } from 'react';
import SankeyChart from './components/SankeyChart.jsx';
import NodeDetailPanel from './components/NodeDetailPanel.jsx';
import StatsPanel from './components/StatsPanel.jsx';
import DateRangePicker from './components/DateRangePicker.jsx';
import { fetchSankeyData, fetchNodeDetails, fetchAvailableFiles } from './services/api.js';

function App() {
  const [sankeyData, setSankeyData] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [nodeDetails, setNodeDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [availableFiles, setAvailableFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [pendingStartDate, setPendingStartDate] = useState(null);
  const [pendingEndDate, setPendingEndDate] = useState(null);
  const [minDate, setMinDate] = useState(null);
  const [maxDate, setMaxDate] = useState(null);

  const loadData = async (file, start, end) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSankeyData(file, start, end);
      setSankeyData(data);
      setSelectedNode(null);
      setNodeDetails(null);
      
      if (data.date_range) {
        setMinDate(data.date_range.min_date);
        setMaxDate(data.date_range.max_date);
      }
    } catch (err) {
      setError('加载数据失败，请检查后端服务是否启动');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        const files = await fetchAvailableFiles();
        setAvailableFiles(files);
      } catch (err) {
        console.error('Failed to fetch files:', err);
      }
      await loadData();
    };
    init();
  }, []);

  const handleNodeClick = async (nodeName) => {
    if (selectedNode === nodeName) {
      setSelectedNode(null);
      setNodeDetails(null);
      return;
    }
    
    setSelectedNode(nodeName);
    try {
      const details = await fetchNodeDetails(nodeName);
      setNodeDetails(details);
    } catch (err) {
      console.error('Failed to fetch node details:', err);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.value;
    setSelectedFile(file || null);
    setPendingStartDate(null);
    setPendingEndDate(null);
    setStartDate(null);
    setEndDate(null);
    loadData(file || null, null, null);
  };

  const handleCloseDetail = () => {
    setSelectedNode(null);
    setNodeDetails(null);
  };

  const handleRefresh = () => {
    loadData(selectedFile, startDate, endDate);
  };

  const handleDateChange = (start, end) => {
    setPendingStartDate(start);
    setPendingEndDate(end);
  };

  const handleApplyDate = () => {
    setStartDate(pendingStartDate);
    setEndDate(pendingEndDate);
    loadData(selectedFile, pendingStartDate, pendingEndDate);
  };

  const handleResetDate = () => {
    setPendingStartDate(null);
    setPendingEndDate(null);
    setStartDate(null);
    setEndDate(null);
    loadData(selectedFile, null, null);
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-content">
          <h1>📈 电商用户行为路径桑基图分析系统</h1>
          <p className="subtitle">可视化分析用户在电商平台的页面流转行为与转化率</p>
        </div>
        <div className="header-controls">
          <select 
            className="file-select" 
            value={selectedFile || ''} 
            onChange={handleFileChange}
          >
            <option value="">默认数据</option>
            {availableFiles.map(file => (
              <option key={file} value={file}>{file}</option>
            ))}
          </select>
          <button className="refresh-btn" onClick={handleRefresh}>
            🔄 刷新数据
          </button>
        </div>
      </header>

      <main className="app-main">
        {loading ? (
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>正在加载数据...</p>
          </div>
        ) : error ? (
          <div className="error-container">
            <div className="error-icon">⚠️</div>
            <h3>{error}</h3>
            <p>请确保后端服务已启动 (运行: python backend/app.py)</p>
            <button className="retry-btn" onClick={() => loadData(selectedFile)}>
              重试
            </button>
          </div>
        ) : (
          <>
            <DateRangePicker
              startDate={pendingStartDate}
              endDate={pendingEndDate}
              minDate={minDate}
              maxDate={maxDate}
              appliedStartDate={startDate}
              appliedEndDate={endDate}
              onDateChange={handleDateChange}
              onApply={handleApplyDate}
              onReset={handleResetDate}
            />
            
            <StatsPanel stats={sankeyData?.stats} />
            
            <div className="content-wrapper">
              <div className="chart-section">
                <div className="section-header">
                  <h2>用户行为路径桑基图</h2>
                  <div className="legend">
                    <span className="legend-item">
                      <span className="legend-color" style={{ background: '#6366f1' }}></span>
                      节点 = 页面
                    </span>
                    <span className="legend-item">
                      <span className="legend-color" style={{ background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }}></span>
                      连线 = 流转路径
                    </span>
                    <span className="legend-item">
                      <span className="legend-hint">💡 点击节点查看详情</span>
                    </span>
                  </div>
                </div>
                <SankeyChart 
                  data={sankeyData} 
                  onNodeClick={handleNodeClick}
                  selectedNode={selectedNode}
                />
              </div>

              <NodeDetailPanel 
                details={nodeDetails} 
                onClose={handleCloseDetail}
              />
            </div>

            <div className="instructions">
              <h3>📖 使用说明</h3>
              <ul>
                <li><strong>时间筛选</strong>：选择日期范围并点击"应用筛选"，桑基图将实时重绘以展示该时间段的用户路径</li>
                <li><strong>快捷选择</strong>：可直接点击"最近7天/14天/30天"快速选择常用时间范围</li>
                <li><strong>鼠标悬停</strong>：查看节点或连线的详细数据</li>
                <li><strong>点击节点</strong>：高亮显示该节点的上下游路径，并在右侧显示详细转化率数据</li>
                <li><strong>再次点击</strong>：取消选中，恢复完整视图</li>
                <li><strong>节点高度</strong>：表示该页面的访问量大小</li>
                <li><strong>连线粗细</strong>：表示两个页面间的用户流转数量</li>
              </ul>
            </div>
          </>
        )}
      </main>

      <footer className="app-footer">
        <p>电商用户行为路径分析系统 | 后端: Python + Pandas | 前端: React + D3.js</p>
      </footer>
    </div>
  );
}

export default App;
