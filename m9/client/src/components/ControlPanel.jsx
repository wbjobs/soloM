import React from 'react';
import { PIPE_TYPE_COLORS, PIPE_TYPE_NAMES, PIPE_TYPE_ICONS, formatNumber } from '../utils/colorUtils';

const ControlPanel = ({
  showBuildings,
  setShowBuildings,
  showPipes,
  setShowPipes,
  showPipesByType,
  togglePipeType,
  minBuildingHeight,
  setMinBuildingHeight,
  maxBuildingHeight,
  setMaxBuildingHeight,
  buildingHeightRange,
  filteredBuildingCount,
  filteredPipeCount,
  totalPipeLength,
  dataMode,
  onReload,
  showWaterFlow,
  setShowWaterFlow,
  showSection,
  setShowSection
}) => {
  const pipeTypes = Object.keys(PIPE_TYPE_COLORS);

  return (
    <div className="control-panel">
      <h3>🏙️ 图层控制</h3>
      
      <div className="control-section">
        <h4>建筑白模</h4>
        <div className="toggle-group">
          <div className="toggle-item">
            <input
              type="checkbox"
              id="showBuildings"
              checked={showBuildings}
              onChange={(e) => setShowBuildings(e.target.checked)}
            />
            <label htmlFor="showBuildings">显示建筑</label>
            <span className="stat-value" style={{ fontSize: '14px' }}>{formatNumber(filteredBuildingCount)}</span>
          </div>
        </div>
        
        {showBuildings && (
          <>
            <div className="section-divider" />
            <div className="slider-container">
              <label>
                <span>最小高度</span>
                <span>{minBuildingHeight}m</span>
              </label>
              <input
                type="range"
                min={buildingHeightRange[0]}
                max={buildingHeightRange[1]}
                value={minBuildingHeight}
                onChange={(e) => setMinBuildingHeight(Number(e.target.value))}
              />
            </div>
            <div className="slider-container" style={{ marginTop: '12px' }}>
              <label>
                <span>最大高度</span>
                <span>{maxBuildingHeight}m</span>
              </label>
              <input
                type="range"
                min={buildingHeightRange[0]}
                max={buildingHeightRange[1]}
                value={maxBuildingHeight}
                onChange={(e) => setMaxBuildingHeight(Number(e.target.value))}
              />
            </div>
          </>
        )}
      </div>

      <div className="section-divider" />

      <div className="control-section">
        <h4>地下管网</h4>
        <div className="toggle-group">
          <div className="toggle-item">
            <input
              type="checkbox"
              id="showPipes"
              checked={showPipes}
              onChange={(e) => setShowPipes(e.target.checked)}
            />
            <label htmlFor="showPipes">显示管网</label>
            <span className="stat-value" style={{ fontSize: '14px' }}>{formatNumber(filteredPipeCount)}</span>
          </div>
        </div>

        {showPipes && (
          <>
            <div className="section-divider" />
            <h4>管网类型</h4>
            <div className="toggle-group">
              {pipeTypes.map(type => (
                <div key={type} className="toggle-item">
                  <input
                    type="checkbox"
                    id={`pipe-${type}`}
                    checked={showPipesByType[type]}
                    onChange={() => togglePipeType(type)}
                  />
                  <label htmlFor={`pipe-${type}`}>
                    <span className="color-dot" style={{ backgroundColor: PIPE_TYPE_COLORS[type] }} />
                    {PIPE_TYPE_ICONS[type]} {PIPE_TYPE_NAMES[type]}
                  </label>
                </div>
              ))}
            </div>
            <div className="pipe-stats">
              总长度: <strong>{formatNumber(totalPipeLength, 1)}m</strong>
            </div>
          </>
        )}
      </div>

      <div className="section-divider" />

      <div className="control-section">
        <h4>💧 水流动画</h4>
        <div className="toggle-group">
          <div className="toggle-item">
            <input
              type="checkbox"
              id="showWaterFlow"
              checked={showWaterFlow}
              onChange={(e) => setShowWaterFlow(e.target.checked)}
            />
            <label htmlFor="showWaterFlow">显示水流模拟</label>
          </div>
        </div>
        {showWaterFlow && (
          <div className="feature-hint">
            已启用时间轴控制，可在底部控制时间与播放速度
          </div>
        )}
      </div>

      <div className="section-divider" />

      <div className="control-section">
        <h4>📏 剖面切片</h4>
        <div className="toggle-group">
          <div className="toggle-item">
            <input
              type="checkbox"
              id="showSection"
              checked={showSection}
              onChange={(e) => setShowSection(e.target.checked)}
            />
            <label htmlFor="showSection">启用剖面查看</label>
          </div>
        </div>
        {showSection && (
          <div className="feature-hint">
            已启用剖面切片模式，可在右侧调节切片高度查看地下结构
          </div>
        )}
      </div>

      <div className="section-divider" />

      <div className="control-section">
        <div className="data-source-info">
          <span className="data-source-label">数据源:</span>
          <span className={`data-source-value ${dataMode}`}>
            {dataMode === 'database' ? '🗄️ PostGIS数据库' : '📁 静态JSON'}
          </span>
        </div>
        <button className="reload-button" onClick={onReload}>
          🔄 重新加载数据
        </button>
      </div>
    </div>
  );
};

export default ControlPanel;
