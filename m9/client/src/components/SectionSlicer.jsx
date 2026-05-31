import React, { useState, useCallback, useRef } from 'react';
import { sliceBuildings, slicePipes, getDepthColor } from '../utils/sectionSlicer';
import { formatNumber, PIPE_TYPE_NAMES, PIPE_TYPE_COLORS } from '../utils/colorUtils';

const SectionSlicer = ({
  buildingsData,
  pipesData,
  showSection,
  setShowSection,
  sliceHeight,
  setSliceHeight,
  slicedBuildings,
  slicedPipes
}) => {
  const [showUnderground, setShowUnderground] = useState(true);
  const [sliceMode, setSliceMode] = useState('height');

  const buildingCount = slicedBuildings?.length || 0;
  const pipeCount = slicedPipes?.length || 0;

  const handleModeChange = (mode) => {
    setSliceMode(mode);
  };

  return (
    <div className={`section-slicer-container ${showSection ? 'expanded' : ''}`}>
      <div className="section-header" onClick={() => setShowSection(!showSection)}>
        <span className="section-icon">📏</span>
        <span className="section-title">剖面切片</span>
        <span className={`toggle-icon ${showSection ? 'open' : ''}`}>▼</span>
      </div>

      {showSection && (
        <div className="section-content">
          <div className="section-mode-selector">
            <button
              className={`mode-btn ${sliceMode === 'height' ? 'active' : ''}`}
              onClick={() => handleModeChange('height')}
            >
              高度切片
            </button>
            <button
              className={`mode-btn ${sliceMode === 'plane' ? 'active' : ''}`}
              onClick={() => handleModeChange('plane')}
              disabled
              title="开发中"
            >
              任意剖面
            </button>
          </div>

          <div className="section-slider-container">
            <div className="slider-label">
              <span>切片高度</span>
              <span className="slice-height-value">
                {sliceHeight > 0 ? `地面以上 ${sliceHeight.toFixed(0)}m` : 
                 sliceHeight < 0 ? `地面以下 ${Math.abs(sliceHeight).toFixed(0)}m` : '地面'}
              </span>
            </div>
            <input
              type="range"
              min="-20"
              max="200"
              step="1"
              value={sliceHeight}
              onChange={(e) => setSliceHeight(parseFloat(e.target.value))}
              className="section-slider"
            />
            <div className="slice-markers">
              <span className="marker underground" title="地下">-20m</span>
              <span className="marker ground" title="地面">0</span>
              <span className="marker low" title="低层">50m</span>
              <span className="marker mid" title="中层">100m</span>
              <span className="marker high" title="高层">200m</span>
            </div>
          </div>

          <div className="section-options">
            <label className="option-checkbox">
              <input
                type="checkbox"
                checked={showUnderground}
                onChange={(e) => setShowUnderground(e.target.checked)}
              />
              <span>显示地下结构</span>
            </label>
          </div>

          <div className="section-stats">
            <div className="stat-item">
              <span className="stat-icon">🏢</span>
              <div className="stat-info">
                <span className="stat-value">{buildingCount}</span>
                <span className="stat-label">建筑截面</span>
              </div>
            </div>
            <div className="stat-item">
              <span className="stat-icon">🔧</span>
              <div className="stat-info">
                <span className="stat-value">{pipeCount}</span>
                <span className="stat-label">管网数量</span>
              </div>
            </div>
          </div>

          {slicedBuildings && slicedBuildings.length > 0 && (
            <div className="section-buildings-list">
              <div className="list-title">截面建筑</div>
              <div className="building-list">
                {slicedBuildings.slice(0, 5).map(b => (
                  <div key={b.id} className="building-item">
                    <span className="building-name">{b.properties?.name || `建筑 ${b.id}`}</span>
                    <span className="building-height">总高: {b.originalHeight}m</span>
                  </div>
                ))}
                {slicedBuildings.length > 5 && (
                  <div className="more-indicator">...还有 {slicedBuildings.length - 5} 个</div>
                )}
              </div>
            </div>
          )}

          {slicedPipes && slicedPipes.length > 0 && (
            <div className="section-pipes-list">
              <div className="list-title">截面管网</div>
              <div className="pipe-list">
                {slicedPipes.slice(0, 5).map(p => (
                  <div key={p.id} className="pipe-item">
                    <span 
                      className="pipe-type-dot"
                      style={{ backgroundColor: PIPE_TYPE_COLORS[p.properties?.type] || '#999' }}
                    />
                    <span className="pipe-name">{PIPE_TYPE_NAMES[p.properties?.type] || p.properties?.type}</span>
                    <span className="pipe-depth">深 {p.depth?.toFixed(1)}m</span>
                  </div>
                ))}
                {slicedPipes.length > 5 && (
                  <div className="more-indicator">...还有 {slicedPipes.length - 5} 条</div>
                )}
              </div>
            </div>
          )}

          <div className="depth-legend">
            <div className="legend-title">深度图例</div>
            <div className="legend-gradient-horizontal">
              <div className="gradient-bar" style={{
                background: 'linear-gradient(to right, #87CEEB, #4682B4, #4169E1, #00008B)'
              }} />
              <div className="legend-labels">
                <span>0m</span>
                <span>5m</span>
                <span>10m</span>
                <span>15m</span>
                <span>20m+</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SectionSlicer;
