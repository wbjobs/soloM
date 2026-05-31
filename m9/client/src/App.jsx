import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import * as Cesium from 'cesium';
import CesiumMap from './components/CesiumMap';
import DeckGLLayers from './components/DeckGLLayers';
import ControlPanel from './components/ControlPanel';
import PropertyPanel from './components/PropertyPanel';
import TimeAxisController from './components/TimeAxisController';
import SectionSlicer from './components/SectionSlicer';
import { fetchBuildings, fetchPipes, checkHealth } from './services/api';
import { PIPE_TYPE_COLORS, formatNumber } from './utils/colorUtils';
import { generateWaterFlowData, updateParticlePositions, calculateFlowRate } from './utils/waterFlowSimulator';
import { sliceBuildings, slicePipes } from './utils/sectionSlicer';

function App() {
  const [viewer, setViewer] = useState(null);
  const [buildingsData, setBuildingsData] = useState(null);
  const [pipesData, setPipesData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cameraPosition, setCameraPosition] = useState({
    longitude: 116.397,
    latitude: 39.908,
    height: 3000
  });
  
  const [showBuildings, setShowBuildings] = useState(true);
  const [showPipes, setShowPipes] = useState(true);
  const [showPipesByType, setShowPipesByType] = useState({
    water: true,
    sewage: true,
    gas: true,
    electric: true,
    telecom: true,
    heating: true
  });
  
  const [minBuildingHeight, setMinBuildingHeight] = useState(0);
  const [maxBuildingHeight, setMaxBuildingHeight] = useState(200);
  const [buildingHeightRange, setBuildingHeightRange] = useState([0, 200]);
  
  const [selectedFeature, setSelectedFeature] = useState(null);
  const [tooltip, setTooltip] = useState(null);
  const [dataMode, setDataMode] = useState('static');
  
  const animationFrameRef = useRef(null);
  const lastCameraUpdateRef = useRef(0);

  const [showWaterFlow, setShowWaterFlow] = useState(false);
  const [currentTime, setCurrentTime] = useState(12);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [waterParticles, setWaterParticles] = useState([]);
  const waterFlowDataRef = useRef(null);
  const particleUpdateRef = useRef(null);

  const [showSection, setShowSection] = useState(false);
  const [sliceHeight, setSliceHeight] = useState(0);
  const slicedBuildings = useMemo(() => {
    if (!showSection || !buildingsData?.features) return [];
    return sliceBuildings(buildingsData.features, sliceHeight);
  }, [showSection, buildingsData, sliceHeight]);

  const slicedPipes = useMemo(() => {
    if (!showSection || !pipesData?.features) return [];
    return slicePipes(pipesData.features, sliceHeight);
  }, [showSection, pipesData, sliceHeight]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const [buildings, pipes, health] = await Promise.all([
        fetchBuildings(),
        fetchPipes(),
        checkHealth().catch(() => ({ dataMode: 'static' }))
      ]);
      
      setBuildingsData(buildings);
      setPipesData(pipes);
      setDataMode(health.dataMode || 'static');
      
      if (buildings && buildings.features) {
        const heights = buildings.features.map(f => f.properties?.height || 0);
        const minH = Math.floor(Math.min(...heights));
        const maxH = Math.ceil(Math.max(...heights));
        setBuildingHeightRange([minH, maxH]);
        setMaxBuildingHeight(maxH);
      }
    } catch (err) {
      console.error('Error loading data:', err);
      setError('加载数据失败，请检查后端服务是否启动');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!viewer) return;

    const updateDeckGL = () => {
      const now = Date.now();
      
      if (now - lastCameraUpdateRef.current > 50) {
        const camera = viewer.camera;
        const position = camera.position;
        const cartographic = Cesium.Cartographic.fromCartesian(position);
        
        setCameraPosition({
          longitude: Cesium.Math.toDegrees(cartographic.longitude),
          latitude: Cesium.Math.toDegrees(cartographic.latitude),
          height: cartographic.height
        });
        
        lastCameraUpdateRef.current = now;
      }
      
      animationFrameRef.current = requestAnimationFrame(updateDeckGL);
    };

    updateDeckGL();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [viewer]);

  const handleViewerReady = useCallback((cesiumViewer) => {
    setViewer(cesiumViewer);
  }, []);

  const togglePipeType = useCallback((type) => {
    setShowPipesByType(prev => ({
      ...prev,
      [type]: !prev[type]
    }));
  }, []);

  const handleBuildingClick = useCallback((feature) => {
    setSelectedFeature(feature);
  }, []);

  const handlePipeClick = useCallback((feature) => {
    setSelectedFeature(feature);
  }, []);

  const handleHover = useCallback((hoverInfo) => {
    setTooltip(hoverInfo);
  }, []);

  const handleClosePropertyPanel = useCallback(() => {
    setSelectedFeature(null);
  }, []);

  useEffect(() => {
    if (pipesData?.features && showWaterFlow) {
      waterFlowDataRef.current = generateWaterFlowData(pipesData.features);
    }
  }, [pipesData, showWaterFlow]);

  useEffect(() => {
    if (!showWaterFlow || !waterFlowDataRef.current) {
      setWaterParticles([]);
      if (particleUpdateRef.current) {
        cancelAnimationFrame(particleUpdateRef.current);
        particleUpdateRef.current = null;
      }
      return;
    }

    let lastUpdate = Date.now();
    
    const updateParticles = () => {
      const now = Date.now();
      const deltaTime = (now - lastUpdate) / 1000;
      lastUpdate = now;

      if (isPlaying) {
        setCurrentTime(prev => {
          const newTime = prev + deltaTime * playbackSpeed * 0.5;
          return newTime > 24 ? 0 : newTime;
        });
      }

      const updatedParticles = updateParticlePositions(
        waterFlowDataRef.current,
        currentTime,
        isPlaying ? playbackSpeed : 0
      );
      setWaterParticles(updatedParticles);

      particleUpdateRef.current = requestAnimationFrame(updateParticles);
    };

    updateParticles();

    return () => {
      if (particleUpdateRef.current) {
        cancelAnimationFrame(particleUpdateRef.current);
      }
    };
  }, [showWaterFlow, isPlaying, playbackSpeed, currentTime]);

  const flowRate = useMemo(() => {
    return calculateFlowRate(currentTime);
  }, [currentTime]);

  const filteredBuildingCount = buildingsData?.features?.filter(f => {
    const h = f.properties?.height || 0;
    return h >= minBuildingHeight && h <= maxBuildingHeight;
  }).length || 0;

  const filteredPipeCount = pipesData?.features?.filter(f => {
    return showPipesByType[f.properties?.type];
  }).length || 0;

  const totalPipeLength = pipesData?.features?.reduce((sum, f) => {
    if (showPipesByType[f.properties?.type]) {
      return sum + (f.properties?.length || 0);
    }
    return sum;
  }, 0) || 0;

  return (
    <div className="app">
      <CesiumMap onViewerReady={handleViewerReady} />
      
      {viewer && !loading && (
        <DeckGLLayers
          viewer={viewer}
          buildingsData={buildingsData}
          pipesData={pipesData}
          showBuildings={showBuildings}
          showPipes={showPipes}
          showPipesByType={showPipesByType}
          minBuildingHeight={minBuildingHeight}
          maxBuildingHeight={maxBuildingHeight}
          cameraPosition={cameraPosition}
          onBuildingClick={handleBuildingClick}
          onPipeClick={handlePipeClick}
          onHover={handleHover}
          tooltip={tooltip}
          showWaterFlow={showWaterFlow}
          waterParticles={waterParticles}
          showSection={showSection}
          sliceHeight={sliceHeight}
          slicedBuildings={slicedBuildings}
          slicedPipes={slicedPipes}
        />
      )}

      <ControlPanel
        showBuildings={showBuildings}
        setShowBuildings={setShowBuildings}
        showPipes={showPipes}
        setShowPipes={setShowPipes}
        showPipesByType={showPipesByType}
        togglePipeType={togglePipeType}
        minBuildingHeight={minBuildingHeight}
        setMinBuildingHeight={setMinBuildingHeight}
        maxBuildingHeight={maxBuildingHeight}
        setMaxBuildingHeight={setMaxBuildingHeight}
        buildingHeightRange={buildingHeightRange}
        filteredBuildingCount={filteredBuildingCount}
        filteredPipeCount={filteredPipeCount}
        totalPipeLength={totalPipeLength}
        dataMode={dataMode}
        onReload={loadData}
        showWaterFlow={showWaterFlow}
        setShowWaterFlow={setShowWaterFlow}
        showSection={showSection}
        setShowSection={setShowSection}
      />

      {showWaterFlow && (
        <TimeAxisController
          currentTime={currentTime}
          setCurrentTime={setCurrentTime}
          isPlaying={isPlaying}
          setIsPlaying={setIsPlaying}
          playbackSpeed={playbackSpeed}
          setPlaybackSpeed={setPlaybackSpeed}
          flowRate={flowRate}
        />
      )}

      {showSection && (
        <SectionSlicer
          sliceHeight={sliceHeight}
          setSliceHeight={setSliceHeight}
          slicedBuildings={slicedBuildings}
          slicedPipes={slicedPipes}
        />
      )}

      {selectedFeature && (
        <PropertyPanel
          feature={selectedFeature}
          onClose={handleClosePropertyPanel}
        />
      )}

      {loading && (
        <div className="loading-overlay">
          <div className="loading-content">
            <div className="loading-spinner"></div>
            <div className="loading-text">加载城市数据中...</div>
            <div className="loading-subtext">正在准备建筑白模和地下管网数据</div>
          </div>
        </div>
      )}

      {error && (
        <div className="error-banner">
          <span className="error-icon">⚠️</span>
          <span className="error-text">{error}</span>
          <button className="error-close" onClick={() => setError(null)}>×</button>
        </div>
      )}
    </div>
  );
}

export default App;
