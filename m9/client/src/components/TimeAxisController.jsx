import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TIME_PERIODS, getTimePeriod, formatTimeLabel, getFlowRateAtTime } from '../utils/waterFlowSimulator';

const TimeAxisController = ({
  currentTime,
  setCurrentTime,
  isPlaying,
  setIsPlaying,
  playbackSpeed,
  setPlaybackSpeed,
  flowRates,
  onTimePeriodChange
}) => {
  const animationRef = useRef(null);
  const lastUpdateRef = useRef(Date.now());

  const currentPeriod = getTimePeriod(currentTime);

  useEffect(() => {
    if (!isPlaying) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    const animate = () => {
      const now = Date.now();
      const delta = (now - lastUpdateRef.current) / 1000;
      lastUpdateRef.current = now;

      setCurrentTime(prev => {
        const newTime = prev + delta * playbackSpeed * 0.5;
        return newTime >= 24 ? 0 : newTime;
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    lastUpdateRef.current = Date.now();
    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, playbackSpeed, setCurrentTime]);

  useEffect(() => {
    if (onTimePeriodChange) {
      onTimePeriodChange(currentPeriod);
    }
  }, [currentTime, currentPeriod, onTimePeriodChange]);

  const togglePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleTimeChange = (e) => {
    setCurrentTime(parseFloat(e.target.value));
  };

  const setTimePeriod = (period) => {
    setCurrentTime(period.startHour + (period.endHour - period.startHour) / 2);
  };

  const averageFlowRate = flowRates && flowRates.length > 0
    ? flowRates.reduce((sum, f) => sum + getFlowRateAtTime(f.baseFlowRate, currentTime), 0) / flowRates.length
    : 0;

  return (
    <div className="time-axis-container">
      <div className="time-axis-header">
        <div className="time-display">
          <span className="time-icon">{currentPeriod.icon}</span>
          <span className="time-value">{formatTimeLabel(currentTime)}</span>
          <span className="time-period">{currentPeriod.label}</span>
        </div>
        
        <div className="time-controls">
          <button 
            className={`time-btn ${playbackSpeed === 0.5 ? 'active' : ''}`}
            onClick={() => setPlaybackSpeed(0.5)}
            title="0.5x 速度"
          >
            0.5×
          </button>
          <button 
            className={`time-btn ${playbackSpeed === 1 ? 'active' : ''}`}
            onClick={() => setPlaybackSpeed(1)}
            title="1x 速度"
          >
            1×
          </button>
          <button 
            className={`time-btn ${playbackSpeed === 2 ? 'active' : ''}`}
            onClick={() => setPlaybackSpeed(2)}
            title="2x 速度"
          >
            2×
          </button>
          
          <button 
            className="play-pause-btn"
            onClick={togglePlayPause}
            title={isPlaying ? '暂停' : '播放'}
          >
            {isPlaying ? '⏸️' : '▶️'}
          </button>
          
          <button 
            className="time-btn"
            onClick={() => setCurrentTime(0)}
            title="重置"
          >
            ⏮️
          </button>
        </div>
      </div>

      <div className="time-periods">
        {TIME_PERIODS.map(period => (
          <button
            key={period.id}
            className={`period-btn ${currentPeriod.id === period.id ? 'active' : ''}`}
            onClick={() => setTimePeriod(period)}
            title={`${period.label} (${period.startHour}:00 - ${period.endHour}:00)`}
          >
            <span className="period-icon">{period.icon}</span>
            <span className="period-label">{period.label}</span>
          </button>
        ))}
      </div>

      <div className="time-slider-container">
        <input
          type="range"
          min="0"
          max="24"
          step="0.1"
          value={currentTime}
          onChange={handleTimeChange}
          className="time-slider"
        />
        <div className="time-slider-labels">
          <span>00:00</span>
          <span>06:00</span>
          <span>12:00</span>
          <span>18:00</span>
          <span>24:00</span>
        </div>
      </div>

      {flowRates && flowRates.length > 0 && (
        <div className="flow-stats">
          <div className="flow-stat">
            <span className="flow-label">平均流量</span>
            <span className="flow-value">{averageFlowRate.toFixed(0)} m³/h</span>
          </div>
          <div className="flow-stat">
            <span className="flow-label">流量变化</span>
            <span className={`flow-change ${averageFlowRate > 100 ? 'increase' : averageFlowRate < 80 ? 'decrease' : ''}`}>
              {averageFlowRate > 100 ? '↑ 高峰' : averageFlowRate < 80 ? '↓ 低谷' : '→ 正常'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default TimeAxisController;
