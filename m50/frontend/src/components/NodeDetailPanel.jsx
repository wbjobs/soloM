import React from 'react';

const NodeDetailPanel = ({ details, onClose }) => {
  if (!details) return null;

  const { node, conversion, incoming_links, outgoing_links } = details;

  return (
    <div className="detail-panel">
      <div className="detail-header">
        <h3>节点详情</h3>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>
      
      <div className="detail-section">
        <div className="detail-title">{node.name}</div>
        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-label">访问次数</div>
            <div className="metric-value">{node.visit_count}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">入口用户</div>
            <div className="metric-value">{node.entry_count}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">退出用户</div>
            <div className="metric-value">{node.exit_count}</div>
          </div>
          <div className="metric-card highlight">
            <div className="metric-label">下一步转化率</div>
            <div className="metric-value">{node.conversion_rate}%</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">入口率</div>
            <div className="metric-value">{node.entry_rate}%</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">从上步转化率</div>
            <div className="metric-value">{conversion.conversion_from_prev}%</div>
          </div>
        </div>
      </div>

      {incoming_links && incoming_links.length > 0 && (
        <div className="detail-section">
          <div className="section-title">流入路径 (Top)</div>
          <div className="links-list">
            {incoming_links
              .sort((a, b) => b.value - a.value)
              .slice(0, 5)
              .map((link, index) => (
                <div key={index} className="link-item">
                  <div className="link-path">
                    <span className="link-source">{link.source}</span>
                    <span className="link-arrow">→</span>
                    <span className="link-target">当前</span>
                  </div>
                  <div className="link-metrics">
                    <span className="link-count">{link.value} 用户</span>
                    <span className="link-prob">{link.probability}%</span>
                  </div>
                  <div className="link-bar">
                    <div 
                      className="link-bar-fill incoming" 
                      style={{ width: `${link.probability}%` }}
                    ></div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {outgoing_links && outgoing_links.length > 0 && (
        <div className="detail-section">
          <div className="section-title">流出路径 (Top)</div>
          <div className="links-list">
            {outgoing_links
              .sort((a, b) => b.value - a.value)
              .slice(0, 5)
              .map((link, index) => (
                <div key={index} className="link-item">
                  <div className="link-path">
                    <span className="link-source">当前</span>
                    <span className="link-arrow">→</span>
                    <span className="link-target">{link.target}</span>
                  </div>
                  <div className="link-metrics">
                    <span className="link-count">{link.value} 用户</span>
                    <span className="link-prob">{link.probability}%</span>
                  </div>
                  <div className="link-bar">
                    <div 
                      className="link-bar-fill outgoing" 
                      style={{ width: `${link.probability}%` }}
                    ></div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      <div className="detail-section">
        <div className="section-title">流量概览</div>
        <div className="flow-summary">
          <div className="flow-item">
            <div className="flow-label">总流入</div>
            <div className="flow-value">{conversion.inflow}</div>
          </div>
          <div className="flow-arrow">→</div>
          <div className="flow-item current">
            <div className="flow-label">当前节点</div>
            <div className="flow-value">{node.visit_count}</div>
          </div>
          <div className="flow-arrow">→</div>
          <div className="flow-item">
            <div className="flow-label">总流出</div>
            <div className="flow-value">{conversion.outflow}</div>
          </div>
        </div>
        <div className="flow-summary">
          <div className="flow-item">
            <div className="flow-label">直接进入</div>
            <div className="flow-value">{node.entry_count}</div>
          </div>
          <div className="flow-item">
            <div className="flow-label">直接退出</div>
            <div className="flow-value">{node.exit_count}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NodeDetailPanel;
