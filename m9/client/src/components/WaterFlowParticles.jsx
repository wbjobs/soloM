import React, { useMemo, useEffect, useRef } from 'react';
import { ScatterplotLayer } from '@deck.gl/layers';
import {
  generateWaterFlowData,
  updateParticlePositions,
  getParticlePosition,
  getFlowRateAtTime
} from '../utils/waterFlowSimulator';

const WaterFlowParticles = ({
  pipesData,
  currentTime,
  playbackSpeed,
  showWaterFlow,
  cameraPosition
}) => {
  const flowDataRef = useRef(null);
  const particlesRef = useRef([]);
  const lastTimeRef = useRef(0);

  useEffect(() => {
    if (pipesData && showWaterFlow) {
      flowDataRef.current = generateWaterFlowData(pipesData);
      particlesRef.current = flowDataRef.current.particles;
    }
  }, [pipesData, showWaterFlow]);

  const particleData = useMemo(() => {
    if (!showWaterFlow || !pipesData || !flowDataRef.current) {
      return [];
    }

    const pipesMap = new Map();
    pipesData.features.forEach(p => {
      if (p.properties?.pipeId) {
        pipesMap.set(p.properties.pipeId, p.geometry?.coordinates);
      }
    });

    const updatedParticles = updateParticlePositions(
      particlesRef.current,
      currentTime * 1000,
      playbackSpeed
    );

    const visibleParticles = [];
    
    for (const particle of updatedParticles) {
      const coords = pipesMap.get(particle.pipeId);
      if (!coords) continue;

      const pos = getParticlePosition(coords, particle.currentOffset);
      const flowMultiplier = getFlowRateAtTime(100, currentTime) / 100;
      
      const size = particle.size * flowMultiplier;
      const alpha = Math.min(255, 150 + flowMultiplier * 105);

      visibleParticles.push({
        ...particle,
        position: pos,
        displaySize: size,
        alpha: Math.floor(alpha),
        flowMultiplier
      });
    }

    return visibleParticles;
  }, [pipesData, currentTime, playbackSpeed, showWaterFlow]);

  const layer = useMemo(() => {
    if (!showWaterFlow || particleData.length === 0) return null;

    return new ScatterplotLayer({
      id: 'water-flow-particles',
      data: particleData,
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
      },
      transitions: {
        getPosition: 100
      }
    });
  }, [particleData, showWaterFlow]);

  return layer;
};

export default WaterFlowParticles;
