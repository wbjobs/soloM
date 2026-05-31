import React, { useMemo, useCallback, useRef, useEffect, useState } from 'react';
import DeckGL from '@deck.gl/react';
import { PolygonLayer, PathLayer, ScatterplotLayer, SolidPolygonLayer } from '@deck.gl/layers';
import { WebMercatorViewport } from '@deck.gl/core';
import {
  SpatialGridIndex,
  calculateViewBounds,
  filterFeaturesByLOD,
  DEFAULT_LOD_LEVELS
} from '../utils/spatialIndex';
import {
  pickFeature,
  findNearestPipe,
  findNearestBuilding,
  pointToLineStringDistance
} from '../utils/pipePicking';
import { sliceBuildings, slicePipes, getDepthColor } from '../utils/sectionSlicer';
import memoryMonitor from '../utils/memoryMonitor';
import { getHeightColor, hexToRgb, PIPE_TYPE_COLORS, formatNumber } from '../utils/colorUtils';

const DeckGLLayers = ({
  viewer,
  buildingsData,
  pipesData,
  showBuildings,
  showPipes,
  showPipesByType,
  minBuildingHeight,
  maxBuildingHeight,
  cameraPosition,
  onBuildingClick,
  onPipeClick,
  onHover,
  tooltip,
  showWaterFlow,
  waterParticles,
  showSection,
  sliceHeight,
  slicedBuildings,
  slicedPipes
}) => {
  const deckRef = useRef(null);
  const buildingIndexRef = useRef(null);
  const pipeIndexRef = useRef(null);
  const viewportRef = useRef(null);
  const [performanceStats, setPerformanceStats] = useState(null);

  useEffect(() => {
    if (buildingsData?.features) {
      buildingIndexRef.current = new SpatialGridIndex(0.002);
      buildingIndexRef.current.buildIndex(buildingsData.features);
    }
  }, [buildingsData]);

  useEffect(() => {
    if (pipesData?.features) {
      pipeIndexRef.current = new SpatialGridIndex(0.005);
      pipeIndexRef.current.buildIndex(pipesData.features);
    }
  }, [pipesData]);

  useEffect(() => {
    const unsubscribe = memoryMonitor.onUpdate((stats) => {
      setPerformanceStats(stats);
    });
    return unsubscribe;
  }, []);

  const getViewState = useCallback(() => {
    if (!viewer) return null;
    
    const camera = viewer.camera;
    const position = camera.position;
    const cartographic = viewer.scene.globe.ellipsoid.cartesianToCartographic(position);
    
    return {
      longitude: cartographic.longitude * 180 / Math.PI,
      latitude: cartographic.latitude * 180 / Math.PI,
      zoom: Math.log2(156543.03392 / Math.abs(cartographic.height) * Math.cos(cartographic.latitude)) - 1,
      pitch: -camera.pitch * 180 / Math.PI,
      bearing: camera.heading * 180 / Math.PI
    };
  }, [viewer]);

  const viewState = getViewState();

  useEffect(() => {
    if (viewState) {
      viewportRef.current = new WebMercatorViewport({
        ...viewState,
        width: window.innerWidth,
        height: window.innerHeight
      });
    }
  }, [viewState]);

  const { filteredBuildings, filteredPipes, lodLevel } = useMemo(() => {
    if (!viewState || !cameraPosition) {
      return { filteredBuildings: [], filteredPipes: {}, lodLevel: 0 };
    }

    const viewBounds = calculateViewBounds(viewState);
    const maxFeatures = memoryMonitor.getMaxFeatures();

    let inViewBuildings = [];
    if (showBuildings && buildingIndexRef.current && !showSection) {
      inViewBuildings = buildingIndexRef.current.query(viewBounds);
      inViewBuildings = inViewBuildings.filter(f => {
        const h = f.properties?.height || 0;
        return h >= minBuildingHeight && h <= maxBuildingHeight;
      });

      const lodFeatures = filterFeaturesByLOD(inViewBuildings, cameraPosition, DEFAULT_LOD_LEVELS);
      inViewBuildings = lodFeatures
        .filter(f => f._visible)
        .sort((a, b) => a._distance - b._distance)
        .slice(0, Math.min(inViewBuildings.length, maxFeatures));
    }

    const filteredPipesByType = {};
    if (showPipes && pipeIndexRef.current && !showSection) {
      const inViewPipes = pipeIndexRef.current.query(viewBounds);
      const lodPipes = filterFeaturesByLOD(inViewPipes, cameraPosition, DEFAULT_LOD_LEVELS);
      const visiblePipes = lodPipes.filter(f => f._visible);

      Object.entries(showPipesByType).forEach(([type, visible]) => {
        if (!visible) {
          filteredPipesByType[type] = [];
          return;
        }
        filteredPipesByType[type] = visiblePipes
          .filter(f => f.properties?.type === type)
          .sort((a, b) => a._distance - b._distance)
          .slice(0, Math.min(visiblePipes.length, maxFeatures));
      });
    }

    const currentLodLevel = cameraPosition.height > 8000 ? 4 :
                           cameraPosition.height > 5000 ? 3 :
                           cameraPosition.height > 2000 ? 2 :
                           cameraPosition.height > 500 ? 1 : 0;

    if (!showSection) {
      memoryMonitor.updateFeatureStats(
        inViewBuildings,
        Object.values(filteredPipesByType).flat(),
        currentLodLevel
      );
    }
    memoryMonitor.updateFrame();

    return {
      filteredBuildings: inViewBuildings,
      filteredPipes: filteredPipesByType,
      lodLevel: currentLodLevel
    };
  }, [
    viewState,
    cameraPosition,
    showBuildings,
    showPipes,
    showPipesByType,
    minBuildingHeight,
    maxBuildingHeight,
    buildingsData,
    pipesData,
    showSection
  ]);

  const handleClick = useCallback((event) => {
    if (!viewportRef.current || showSection) return;

    const { x, y } = event;

    const picked = pickFeature(
      [],
      x,
      y,
      viewportRef.current,
      { features: filteredBuildings },
      { features: Object.values(filteredPipes).flat() },
      { maxPipeDistance: 30 }
    );

    if (picked) {
      if (picked.type === 'building' && onBuildingClick) {
        onBuildingClick(picked.object);
      } else if (picked.type === 'pipe' && onPipeClick) {
        onPipeClick(picked.object);
      }
    }
  }, [filteredBuildings, filteredPipes, onBuildingClick, onPipeClick, showSection]);

  const handleHover = useCallback((event) => {
    const { x, y, object, index } = event;

    if (!object || !viewportRef.current || showSection) {
      if (onHover) onHover(null);
      return;
    }

    const viewport = viewportRef.current;
    const worldCoords = viewport.unproject([x, y]);
    
    if (object.geometry?.type === 'LineString') {
      const result = pointToLineStringDistance(
        worldCoords[0],
        worldCoords[1],
        object.geometry.coordinates
      );
      
      const distanceMeters = result.distance * 111000 * Math.cos(worldCoords[1] * Math.PI / 180);

      if (onHover) {
        onHover({
          x,
          y,
          object,
          type: 'pipe'
        });
      }
    } else {
      if (onHover) {
        onHover({
          x,
          y,
          object,
          type: 'building'
        });
      }
    }
  }, [onHover, showSection]);

  const layers = useMemo(() => {
    const result = [];
    const qualityLevel = memoryMonitor.stats.qualityLevel;
    const showOutline = memoryMonitor.shouldRenderOutline();
    const showGlow = memoryMonitor.shouldRenderGlow();

    if (showSection) {
      if (slicedBuildings && slicedBuildings.length > 0) {
        result.push(
          new PolygonLayer({
            id: 'section-buildings',
            data: slicedBuildings,
            getPolygon: d => d.coordinates,
            getFillColor: d => {
              const heightRatio = d.originalHeight / 200;
              return getHeightColor(heightRatio * 150, 150);
            },
            getLineColor: [255, 255, 255, 255],
            lineWidthMinPixels: 2,
            opacity: 0.8,
            pickable: true,
            onClick: ({ object }) => onBuildingClick && onBuildingClick({
              id: object.id,
              properties: object.properties,
              geometry: { type: 'Polygon', coordinates: [object.coordinates] }
            }),
            parameters: {
              depthTest: false
            }
          })
        );
      }

      if (slicedPipes && slicedPipes.length > 0) {
        Object.entries(
          slicedPipes.reduce((acc, pipe) => {
            const type = pipe.properties?.type || 'unknown';
            if (!acc[type]) acc[type] = [];
            acc[type].push(pipe);
            return acc;
          }, {})
        ).forEach(([type, pipes]) => {
          if (pipes.length === 0) return;
          
          const color = hexToRgb(PIPE_TYPE_COLORS[type] || '#666666', 230);
          
          result.push(
            new PathLayer({
              id: `section-pipes-${type}`,
              data: pipes,
              getPath: d => d.coordinates,
              getColor: color,
              getWidth: d => {
                const diameter = d.properties?.diameter || 300;
                return Math.max(3, diameter / 80);
              },
              widthMinPixels: 3,
              widthMaxPixels: 10,
              opacity: 1,
              pickable: true,
              onClick: ({ object }) => onPipeClick && onPipeClick({
                id: object.id,
                properties: object.properties,
                geometry: { type: 'LineString', coordinates: object.coordinates }
              }),
              parameters: {
                depthTest: false,
                lineJoin: 'round',
                lineCap: 'round'
              }
            })
          );
        });
      }

      const sectionPlaneData = [];
      if (buildingsData?.features && buildingsData.features.length > 0) {
        const allCoords = buildingsData.features.flatMap(f => 
          f.geometry?.coordinates?.[0] || f.geometry?.coordinates || []
        );
        if (allCoords.length > 0) {
          const minLng = Math.min(...allCoords.map(c => c[0]));
          const maxLng = Math.max(...allCoords.map(c => c[0]));
          const minLat = Math.min(...allCoords.map(c => c[1]));
          const maxLat = Math.max(...allCoords.map(c => c[1]));
          const centerLng = (minLng + maxLng) / 2;
          const centerLat = (minLat + maxLat) / 2;
          const size = Math.max(maxLng - minLng, maxLat - minLat) * 1.2;
          
          sectionPlaneData.push({
            polygon: [
              [centerLng - size, centerLat - size, sliceHeight],
              [centerLng + size, centerLat - size, sliceHeight],
              [centerLng + size, centerLat + size, sliceHeight],
              [centerLng - size, centerLat + size, sliceHeight],
              [centerLng - size, centerLat - size, sliceHeight]
            ]
          });
        }
      }

      if (sectionPlaneData.length > 0) {
        result.push(
          new SolidPolygonLayer({
            id: 'section-plane',
            data: sectionPlaneData,
            getPolygon: d => d.polygon,
            getFillColor: [100, 150, 255, 40],
            getLineColor: [100, 150, 255, 200],
            lineWidthMinPixels: 2,
            filled: true,
            stroked: true,
            opacity: 0.5,
            pickable: false,
            parameters: {
              depthTest: false
            }
          })
        );
      }

      return result;
    }

    if (showBuildings && filteredBuildings.length > 0) {
      const opacity = qualityLevel === 'high' ? 0.85 : 
                      qualityLevel === 'medium' ? 0.75 : 0.6;

      result.push(
        new PolygonLayer({
          id: 'buildings-3d',
          data: filteredBuildings,
          extruded: true,
          wireframe: false,
          getPolygon: d => d.geometry?.coordinates?.[0] || d.geometry?.coordinates,
          getElevation: d => d.properties?.height || 0,
          getFillColor: d => {
            const height = d.properties?.height || 0;
            return getHeightColor(height, 150);
          },
          getLineColor: [255, 255, 255, 80],
          lineWidthMinPixels: qualityLevel === 'high' ? 0.5 : 0,
          opacity,
          pickable: true,
          onClick: handleClick,
          onHover: handleHover,
          updateTriggers: {
            getFillColor: [minBuildingHeight, maxBuildingHeight, qualityLevel],
            getPolygon: [filteredBuildings]
          },
          parameters: {
            depthTest: true,
            cullFace: true
          }
        })
      );

      if (showOutline) {
        result.push(
          new PolygonLayer({
            id: 'buildings-outline',
            data: filteredBuildings.filter(f => f._distance < 1500),
            extruded: true,
            wireframe: true,
            getPolygon: d => d.geometry?.coordinates?.[0] || d.geometry?.coordinates,
            getElevation: d => d.properties?.height || 0,
            getFillColor: [0, 0, 0, 0],
            getLineColor: [255, 255, 255, 120],
            lineWidthMinPixels: 0.5,
            opacity: 1,
            pickable: false,
            parameters: {
              depthTest: true,
              cullFace: true
            }
          })
        );
      }
    }

    if (showPipes) {
      Object.entries(filteredPipes).forEach(([type, pipes]) => {
        if (pipes.length === 0) return;

        const color = hexToRgb(PIPE_TYPE_COLORS[type] || '#666666', 220);
        
        result.push(
          new PathLayer({
            id: `pipes-${type}-collision`,
            data: pipes,
            getPath: d => d.geometry?.coordinates || [],
            getColor: [0, 0, 0, 0],
            getWidth: d => {
              const diameter = d.properties?.diameter || 300;
              return Math.max(15, diameter / 20);
            },
            widthMinPixels: 15,
            widthMaxPixels: 30,
            opacity: 0,
            pickable: true,
            onClick: handleClick,
            onHover: handleHover,
            parameters: {
              depthTest: false
            }
          })
        );

        result.push(
          new PathLayer({
            id: `pipes-${type}`,
            data: pipes,
            getPath: d => d.geometry?.coordinates || [],
            getColor: color,
            getWidth: d => {
              const diameter = d.properties?.diameter || 300;
              const baseWidth = qualityLevel === 'high' ? diameter / 100 : diameter / 150;
              return Math.max(1.5, baseWidth);
            },
            widthMinPixels: qualityLevel === 'high' ? 2 : 1,
            widthMaxPixels: qualityLevel === 'high' ? 8 : 5,
            opacity: qualityLevel === 'high' ? 0.95 : 0.85,
            pickable: false,
            parameters: {
              depthTest: false,
              lineJoin: 'round',
              lineCap: 'round'
            }
          })
        );

        if (showGlow) {
          result.push(
            new PathLayer({
              id: `pipes-${type}-glow`,
              data: pipes.filter(f => f._distance < 2000),
              getPath: d => d.geometry?.coordinates || [],
              getColor: [...color.slice(0, 3), 80],
              getWidth: d => {
                const diameter = d.properties?.diameter || 300;
                return Math.max(4, diameter / 50);
              },
              widthMinPixels: 3,
              widthMaxPixels: 12,
              opacity: 0.4,
              pickable: false,
              parameters: {
                depthTest: false,
                lineJoin: 'round',
                lineCap: 'round'
              }
            })
          );
        }
      });
    }

    if (showWaterFlow && waterParticles && waterParticles.length > 0) {
      result.push(
        new ScatterplotLayer({
          id: 'water-flow-particles',
          data: waterParticles,
          getPosition: d => d.position,
          getRadius: d => d.displaySize,
          getFillColor: d => [...d.color, d.alpha],
          radiusScale: 1,
          radiusMinPixels: 1,
          radiusMaxPixels: 8,
          opacity: 0.9,
          pickable: false,
          parameters: {
            depthTest: false,
            blending: true
          }
        })
      );
    }

    return result;
  }, [
    filteredBuildings,
    filteredPipes,
    showBuildings,
    showPipes,
    minBuildingHeight,
    maxBuildingHeight,
    handleClick,
    handleHover,
    showWaterFlow,
    waterParticles,
    showSection,
    sliceHeight,
    slicedBuildings,
    slicedPipes,
    onBuildingClick,
    onPipeClick,
    buildingsData
  ]);

  if (!viewState) return null;

  return (
    <>
      <DeckGL
        ref={deckRef}
        initialViewState={viewState}
        viewState={viewState}
        controller={false}
        layers={layers}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'auto'
        }}
        getCursor={({ isDragging, isHovering }) => {
          if (isDragging) return 'grabbing';
          if (isHovering) return 'pointer';
          return 'default';
        }}
      />
      
      {tooltip && tooltip.object && !showSection && (
        <div
          className="tooltip"
          style={{
            left: tooltip.x + 15,
            top: tooltip.y + 15
          }}
        >
          {tooltip.type === 'building' && tooltip.object.properties && (
            <>
              <div className="tooltip-title">
                🏢 {tooltip.object.properties.name || '建筑'}
              </div>
              <div className="tooltip-content">
                高度: {formatNumber(tooltip.object.properties.height, 1)}m | 
                {tooltip.object.properties.floors ? ` ${tooltip.object.properties.floors}层` : ''}
              </div>
            </>
          )}
          {tooltip.type === 'pipe' && tooltip.object.properties && (
            <>
              <div className="tooltip-title">
                🔧 {tooltip.object.properties.pipeId || '管线'}
              </div>
              <div className="tooltip-content">
                {tooltip.object.properties.diameter ? `管径: ${formatNumber(tooltip.object.properties.diameter)}mm | ` : ''}
                {tooltip.object.properties.length ? `长度: ${formatNumber(tooltip.object.properties.length, 1)}m` : ''}
              </div>
            </>
          )}
        </div>
      )}

      {performanceStats && !showSection && (
        <div style={{
          position: 'absolute',
          bottom: '20px',
          right: '200px',
          zIndex: 1000,
          background: 'rgba(26, 26, 46, 0.85)',
          color: 'white',
          padding: '10px 15px',
          borderRadius: '8px',
          fontSize: '11px',
          fontFamily: 'monospace',
          lineHeight: '1.6',
          backdropFilter: 'blur(10px)',
          pointerEvents: 'none'
        }}>
          <div>FPS: <span style={{ color: performanceStats.fps >= 50 ? '#22c55e' : performanceStats.fps >= 30 ? '#eab308' : '#ef4444' }}>
            {performanceStats.fps}
          </span></div>
          <div>显存: {(performanceStats.gpuMemoryEstimate / 1024 / 1024).toFixed(1)} MB</div>
          <div>渲染: {performanceStats.featureCount.toLocaleString()} 个</div>
          <div>质量: <span style={{ color: performanceStats.qualityLevel === 'high' ? '#22c55e' : performanceStats.qualityLevel === 'medium' ? '#eab308' : '#ef4444' }}>
            {performanceStats.qualityLevel.toUpperCase()}
          </span></div>
        </div>
      )}

      {showSection && (
        <div style={{
          position: 'absolute',
          top: '80px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1000,
          background: 'rgba(59, 130, 246, 0.9)',
          color: 'white',
          padding: '8px 20px',
          borderRadius: '20px',
          fontSize: '13px',
          fontWeight: '600',
          backdropFilter: 'blur(10px)',
          pointerEvents: 'none'
        }}>
          📏 剖面切片模式 | {sliceHeight > 0 ? `地面以上 ${sliceHeight.toFixed(0)}m` : 
           sliceHeight < 0 ? `地面以下 ${Math.abs(sliceHeight).toFixed(0)}m` : '地面高度'}
        </div>
      )}
    </>
  );
};

export default DeckGLLayers;
        </div>
      )}
    </>
  );
};

export default Deck