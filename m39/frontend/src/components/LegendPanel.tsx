import React from 'react';
import { ThreatNode, NODE_COLORS, NODE_LABELS, RELATIONSHIP_LABELS, RelationshipType } from '../types';
import { CloseOutlined } from '@ant-design/icons';

interface LegendPanelProps {
  selectedNode: ThreatNode | null;
  onCloseNode: () => void;
}

const LegendPanel: React.FC<LegendPanelProps> = ({ selectedNode, onCloseNode }) => {
  const legends = [
    { type: 'IP', color: NODE_COLORS.IP, label: NODE_LABELS.IP, desc: 'IP地址节点' },
    { type: 'Domain', color: NODE_COLORS.Domain, label: NODE_LABELS.Domain, desc: '域名节点' },
    { type: 'Hash', color: NODE_COLORS.Hash, label: NODE_LABELS.Hash, desc: '文件哈希节点' },
    { type: 'CVE', color: NODE_COLORS.CVE, label: NODE_LABELS.CVE, desc: '漏洞节点' },
  ];

  const relationships = [
    { type: 'RESOLVES_TO', label: RELATIONSHIP_LABELS.RESOLVES_TO },
    { type: 'COMMUNICATES_WITH', label: RELATIONSHIP_LABELS.COMMUNICATES_WITH },
    { type: 'HOSTS', label: RELATIONSHIP_LABELS.HOSTS },
    { type: 'DOWNLOADS', label: RELATIONSHIP_LABELS.DOWNLOADS },
    { type: 'EXPLOITS', label: RELATIONSHIP_LABELS.EXPLOITS },
    { type: 'RELATED_TO', label: RELATIONSHIP_LABELS.RELATED_TO },
  ];

  return (
    <>
      <div className="sidebar-section">
        <div className="sidebar-title">节点类型</div>
        <div className="legend-panel">
          {legends.map((item) => (
            <div key={item.type} className="legend-item">
              <div
                className="legend-color"
                style={{ backgroundColor: item.color }}
              />
              <div style={{ flex: 1 }}>
                <div className="legend-label">{item.label}</div>
                <div className="legend-desc">{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-title">关系类型</div>
        <div className="legend-panel" style={{ maxHeight: 200 }}>
          {relationships.map((item) => (
            <div key={item.type} className="legend-item">
              <div
                style={{
                  width: 24,
                  height: 2,
                  background: '#5b7083',
                  flexShrink: 0,
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    right: -4,
                    top: -3,
                    width: 0,
                    height: 0,
                    borderTop: '4px solid transparent',
                    borderBottom: '4px solid transparent',
                    borderLeft: '6px solid #5b7083',
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div className="legend-label">{item.label}</div>
                <div className="legend-desc">{item.type}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {selectedNode && (
        <div className="node-detail-panel">
          <div className="node-detail-title">
            <span>节点详情</span>
            <CloseOutlined
              onClick={onCloseNode}
              style={{ cursor: 'pointer', color: '#8899a6' }}
            />
          </div>
          <div className="node-property">
            <div className="node-property-label">名称</div>
            <div className="node-property-value">{selectedNode.name}</div>
          </div>
          <div className="node-property">
            <div className="node-property-label">类型</div>
            <div className="node-property-value">{NODE_LABELS[selectedNode.label]}</div>
          </div>
          {Object.entries(selectedNode.properties).map(([key, value]) => (
            <div key={key} className="node-property">
              <div className="node-property-label">{key}</div>
              <div className="node-property-value">
                {Array.isArray(value) ? value.join(', ') : String(value)}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
};

export default LegendPanel;
