import React from 'react';
import {
  PIPE_TYPE_NAMES,
  PIPE_MATERIAL_NAMES,
  PIPE_STATUS_NAMES,
  BUILDING_TYPE_NAMES,
  PIPE_TYPE_ICONS,
  PIPE_TYPE_COLORS,
  getStatusBadgeClass,
  formatNumber
} from '../utils/colorUtils';

const PropertyPanel = ({ selectedFeature, onClose }) => {
  if (!selectedFeature) return null;

  const isBuilding = selectedFeature.geometry?.type === 'Polygon' || 
                     selectedFeature.properties?.height !== undefined;
  const isPipe = selectedFeature.geometry?.type === 'LineString' ||
                 selectedFeature.properties?.pipeId !== undefined;

  const renderBuildingProperties = (props) => {
    const buildingColor = props.height ? `linear-gradient(135deg, #667eea 0%, ${props.height > 100 ? '#f093fb' : '#764ba2'} 100%)` : '#667eea';
    
    return (
      <>
        <div style={{ 
          background: buildingColor,
          padding: '15px',
          borderRadius: '8px',
          marginBottom: '16px',
          color: 'white'
        }}>
          <div style={{ fontSize: '24px', marginBottom: '4px' }}>🏢</div>
          <div style={{ fontSize: '18px', fontWeight: '600' }}>{props.name || '未命名建筑'}</div>
          <div style={{ fontSize: '13px', opacity: 0.9, marginTop: '4px' }}>
            {BUILDING_TYPE_NAMES[props.type] || props.type || '未知类型'}
          </div>
        </div>

        <div className="property-row">
          <span className="property-label">建筑高度</span>
          <span className="property-value">{formatNumber(props.height, 1)} 米</span>
        </div>
        <div className="property-row">
          <span className="property-label">楼层数</span>
          <span className="property-value">{props.floors ? `${props.floors} 层` : '-'}</span>
        </div>
        <div className="property-row">
          <span className="property-label">建筑类型</span>
          <span className="property-value">{BUILDING_TYPE_NAMES[props.type] || props.type || '-'}</span>
        </div>
        <div className="property-row">
          <span className="property-label">建成年份</span>
          <span className="property-value">{props.yearBuilt || '-'}</span>
        </div>
        <div className="property-row">
          <span className="property-label">地址</span>
          <span className="property-value">{props.address || '-'}</span>
        </div>

        {props.properties && Object.keys(props.properties).length > 0 && (
          <>
            <div className="section-divider" />
            <h4 style={{ fontSize: '13px', color: '#4a5568', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              其他属性
            </h4>
            {Object.entries(props.properties).map(([key, value]) => (
              <div key={key} className="property-row">
                <span className="property-label">{key}</span>
                <span className="property-value">{formatNumber(value)}</span>
              </div>
            ))}
          </>
        )}
      </>
    );
  };

  const renderPipeProperties = (props) => {
    const typeColor = PIPE_TYPE_COLORS[props.type] || '#667eea';
    
    return (
      <>
        <div style={{ 
          background: `linear-gradient(135deg, ${typeColor} 0%, ${typeColor}cc 100%)`,
          padding: '15px',
          borderRadius: '8px',
          marginBottom: '16px',
          color: 'white'
        }}>
          <div style={{ fontSize: '24px', marginBottom: '4px' }}>
            {PIPE_TYPE_ICONS[props.type] || '🔧'}
          </div>
          <div style={{ fontSize: '18px', fontWeight: '600' }}>{props.pipeId || '未知管线'}</div>
          <div style={{ fontSize: '13px', opacity: 0.9, marginTop: '4px' }}>
            {PIPE_TYPE_NAMES[props.type] || props.type || '未知类型'}
          </div>
        </div>

        <div className="property-row">
          <span className="property-label">管线编号</span>
          <span className="property-value">{props.pipeId || '-'}</span>
        </div>
        <div className="property-row">
          <span className="property-label">管线类型</span>
          <span className="property-value">{PIPE_TYPE_NAMES[props.type] || props.type || '-'}</span>
        </div>
        <div className="property-row">
          <span className="property-label">管材</span>
          <span className="property-value">{PIPE_MATERIAL_NAMES[props.material] || props.material || '-'}</span>
        </div>
        <div className="property-row">
          <span className="property-label">管径</span>
          <span className="property-value">{props.diameter ? `${formatNumber(props.diameter)} mm` : '-'}</span>
        </div>
        <div className="property-row">
          <span className="property-label">管长</span>
          <span className="property-value">{props.length ? `${formatNumber(props.length, 1)} 米` : '-'}</span>
        </div>
        <div className="property-row">
          <span className="property-label">埋深</span>
          <span className="property-value">{props.depth ? `${formatNumber(props.depth, 1)} 米` : '-'}</span>
        </div>
        {props.pressure !== null && props.pressure !== undefined && (
          <div className="property-row">
            <span className="property-label">设计压力</span>
            <span className="property-value">{formatNumber(props.pressure, 2)} MPa</span>
          </div>
        )}
        {props.flowRate !== null && props.flowRate !== undefined && (
          <div className="property-row">
            <span className="property-label">设计流量</span>
            <span className="property-value">{formatNumber(props.flowRate)} m³/h</span>
          </div>
        )}
        <div className="property-row">
          <span className="property-label">运行状态</span>
          <span className="property-value">
            <span className={`property-badge ${getStatusBadgeClass(props.status)}`}>
              {PIPE_STATUS_NAMES[props.status] || props.status || '未知'}
            </span>
          </span>
        </div>
        <div className="property-row">
          <span className="property-label">铺设年份</span>
          <span className="property-value">{props.yearInstalled || '-'}</span>
        </div>
        <div className="property-row">
          <span className="property-label">产权单位</span>
          <span className="property-value">{props.owner || '-'}</span>
        </div>

        {props.properties && Object.keys(props.properties).length > 0 && (
          <>
            <div className="section-divider" />
            <h4 style={{ fontSize: '13px', color: '#4a5568', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              其他属性
            </h4>
            {Object.entries(props.properties).map(([key, value]) => (
              <div key={key} className="property-row">
                <span className="property-label">{key}</span>
                <span className="property-value">{formatNumber(value)}</span>
              </div>
            ))}
          </>
        )}
      </>
    );
  };

  return (
    <div className="property-panel">
      <div className="property-panel-header">
        <h3>
          {isBuilding ? '🏢 建筑信息' : isPipe ? '🔧 管线信息' : '📋 属性信息'}
        </h3>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>
      <div className="property-panel-content">
        {isBuilding && renderBuildingProperties(selectedFeature.properties)}
        {isPipe && renderPipeProperties(selectedFeature.properties)}
        {!isBuilding && !isPipe && (
          <div className="empty-state">暂无属性信息</div>
        )}
      </div>
    </div>
  );
};

export default PropertyPanel;
