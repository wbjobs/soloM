'use client';

import React, { useMemo } from 'react';
import { LossPoint } from '@/types';
import { cn } from '@/lib/utils';

interface LossChartProps {
  lossHistory: LossPoint[];
  height?: number;
  className?: string;
  showGrid?: boolean;
  showPoints?: boolean;
}

export default function LossChart({
  lossHistory,
  height = 200,
  className,
  showGrid = true,
  showPoints = true,
}: LossChartProps) {
  const { points, minLoss, maxLoss, padding } = useMemo(() => {
    if (lossHistory.length === 0) {
      return { points: [], minLoss: 0, maxLoss: 1, padding: 40 };
    }

    const losses = lossHistory.map(lp => lp.loss);
    const minLoss = Math.min(...losses) * 0.9;
    const maxLoss = Math.max(...losses) * 1.1;
    const padding = 40;

    const points = lossHistory.map((lp, index) => ({
      x: padding + (index / Math.max(lossHistory.length - 1, 1)) * (100 - padding * 2 / 3),
      y: 100 - padding / 2 - ((lp.loss - minLoss) / (maxLoss - minLoss)) * (100 - padding),
      loss: lp.loss,
      step: lp.step,
      epoch: lp.epoch,
    }));

    return { points, minLoss, maxLoss, padding };
  }, [lossHistory]);

  const pathData = useMemo(() => {
    if (points.length < 2) return '';
    
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      path += ` L ${points[i].x} ${points[i].y}`;
    }
    return path;
  }, [points]);

  const areaData = useMemo(() => {
    if (points.length < 2) return '';
    
    let path = `M ${points[0].x} 100`;
    path += ` L ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      path += ` L ${points[i].x} ${points[i].y}`;
    }
    path += ` L ${points[points.length - 1].x} 100 Z`;
    return path;
  }, [points]);

  const latestLoss = lossHistory.length > 0 ? lossHistory[lossHistory.length - 1].loss : 0;

  return (
    <div className={cn('w-full', className)}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">训练 Loss 曲线</span>
        {lossHistory.length > 0 && (
          <span className="text-sm text-gray-500">
            当前 Loss: <span className="font-semibold text-primary-600">{latestLoss.toFixed(4)}</span>
          </span>
        )}
      </div>
      
      <div className="relative w-full bg-gray-50 rounded-lg border border-gray-200 overflow-hidden" style={{ height }}>
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="w-full h-full"
        >
          {showGrid && (
            <>
              <line x1="40" y1="50" x2="95" y2="50" stroke="#e5e7eb" strokeWidth="0.3" strokeDasharray="1,1" />
              <line x1="40" y1="25" x2="95" y2="25" stroke="#e5e7eb" strokeWidth="0.3" strokeDasharray="1,1" />
              <line x1="40" y1="75" x2="95" y2="75" stroke="#e5e7eb" strokeWidth="0.3" strokeDasharray="1,1" />
            </>
          )}
          
          {points.length > 0 && (
            <>
              <path
                d={areaData}
                fill="url(#lossGradient)"
                opacity="0.3"
              />
              
              <path
                d={pathData}
                fill="none"
                stroke="#3b82f6"
                strokeWidth="0.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              
              {showPoints && points.filter((_, i) => i % Math.ceil(points.length / 20) === 0 || i === points.length - 1).map((point, index) => (
                <circle
                  key={index}
                  cx={point.x}
                  cy={point.y}
                  r="1"
                  fill="#3b82f6"
                />
              ))}
            </>
          )}
          
          <defs>
            <linearGradient id="lossGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
        
        {lossHistory.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm text-gray-400">暂无训练数据</span>
          </div>
        )}
        
        {lossHistory.length > 0 && (
          <>
            <span className="absolute left-2 top-2 text-xs text-gray-500">
              {maxLoss.toFixed(2)}
            </span>
            <span className="absolute left-2 bottom-2 text-xs text-gray-500">
              {minLoss.toFixed(2)}
            </span>
            <span className="absolute right-2 bottom-2 text-xs text-gray-500">
              Step {lossHistory.length}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
