import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useAppStore } from '@/stores/appStore';
import { renderDicomImage } from '@/lib/dicomRenderer';
import { GPURenderer } from '@/lib/gpuRenderer';
import { AlertCircle, Cpu, Monitor } from 'lucide-react';

export default function ImageCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const gpuRendererRef = useRef<GPURenderer | null>(null);
  const image = useAppStore((s) => s.image);
  const windowCenter = useAppStore((s) => s.windowCenter);
  const windowWidth = useAppStore((s) => s.windowWidth);
  const brightness = useAppStore((s) => s.brightness);
  const contrast = useAppStore((s) => s.contrast);
  const gpuAcceleration = useAppStore((s) => s.gpuAcceleration);
  const loading = useAppStore((s) => s.loading);
  const error = useAppStore((s) => s.error);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [gpuSupported, setGpuSupported] = useState(true);

  useEffect(() => {
    if (!canvasRef.current || !gpuAcceleration) {
      if (gpuRendererRef.current) {
        gpuRendererRef.current.destroy();
        gpuRendererRef.current = null;
      }
      return;
    }

    try {
      gpuRendererRef.current = new GPURenderer(canvasRef.current);
      setGpuSupported(gpuRendererRef.current.isSupported());
    } catch {
      setGpuSupported(false);
    }

    return () => {
      if (gpuRendererRef.current) {
        gpuRendererRef.current.destroy();
        gpuRendererRef.current = null;
      }
    };
  }, [gpuAcceleration]);

  const render = useCallback(() => {
    if (!canvasRef.current || !image) {
      setRenderError(null);
      return;
    }

    try {
      if (gpuAcceleration && gpuRendererRef.current && gpuSupported) {
        gpuRendererRef.current.setImageData(image, windowCenter, windowWidth);
        gpuRendererRef.current.render(brightness, contrast);
      } else {
        renderDicomImage(canvasRef.current, image, windowCenter, windowWidth, brightness, contrast);
      }
      setRenderError(null);
    } catch {
      setRenderError('Failed to render image');
    }
  }, [image, windowCenter, windowWidth, brightness, contrast, gpuAcceleration, gpuSupported]);

  useEffect(() => {
    render();
  }, [render]);

  useEffect(() => {
    if (!containerRef.current || !image) return;

    const updateScale = () => {
      if (!containerRef.current || !image) return;
      const container = containerRef.current;
      const containerWidth = container.clientWidth - 32;
      const containerHeight = container.clientHeight - 32;
      const imageRatio = image.columns / image.rows;
      const containerRatio = containerWidth / containerHeight;

      let newScale: number;
      if (imageRatio > containerRatio) {
        newScale = containerWidth / image.columns;
      } else {
        newScale = containerHeight / image.rows;
      }
      setScale(Math.min(newScale, 1));
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, [image]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-black rounded-lg">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-4 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-slate-400 animate-pulse">Loading image...</p>
        </div>
      </div>
    );
  }

  if (error || renderError) {
    return (
      <div className="flex items-center justify-center h-full bg-black rounded-lg">
        <div className="flex flex-col items-center gap-3 text-center p-8">
          <AlertCircle className="w-12 h-12 text-red-400" />
          <p className="text-red-400">{error || renderError}</p>
        </div>
      </div>
    );
  }

  if (!image) {
    return (
      <div className="flex items-center justify-center h-full bg-black rounded-lg">
        <p className="text-slate-500">No image loaded</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700 rounded-t-lg">
        <div className="flex items-center gap-2 text-xs">
          {gpuAcceleration && gpuSupported ? (
            <>
              <Monitor className="w-3 h-3 text-green-400" />
              <span className="text-green-400">GPU 加速</span>
            </>
          ) : (
            <>
              <Cpu className="w-3 h-3 text-orange-400" />
              <span className="text-orange-400">CPU 渲染</span>
            </>
          )}
        </div>
        <div className="text-xs text-slate-500">
          {image.columns} × {image.rows}
        </div>
      </div>
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center bg-black rounded-b-lg overflow-hidden"
      >
        <canvas
          ref={canvasRef}
          style={{
            transform: `scale(${scale})`,
            transformOrigin: 'center center',
          }}
          className="max-w-full max-h-full"
        />
      </div>
    </div>
  );
}
