import React, { useEffect, useRef } from 'react';
import { createViewer } from '../utils/cesiumConfig';

const CesiumMap = ({ onViewerReady, children }) => {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return;

    const viewer = createViewer(containerRef.current);
    viewerRef.current = viewer;

    if (onViewerReady) {
      onViewerReady(viewer);
    }

    return () => {
      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, [onViewerReady]);

  return (
    <>
      <div ref={containerRef} className="cesium-container" />
      <div className="deckgl-overlay">
        {children}
      </div>
    </>
  );
};

export default CesiumMap;
