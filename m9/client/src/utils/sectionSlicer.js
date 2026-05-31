function pointLineIntersection(p1, p2, zPlane) {
  const z1 = p1[2] || 0;
  const z2 = p2[2] || 0;
  
  if ((z1 - zPlane) * (z2 - zPlane) > 0) {
    return null;
  }
  
  if (Math.abs(z1 - z2) < 0.0001) {
    return null;
  }
  
  const t = (zPlane - z1) / (z2 - z1);
  
  return [
    p1[0] + (p2[0] - p1[0]) * t,
    p1[1] + (p2[1] - p1[1]) * t,
    zPlane
  ];
}

function slicePolygonAtZ(polygon, zPlane, baseHeight = 0, maxHeight = 100) {
  const coords = polygon[0] || polygon;
  if (!coords || coords.length < 3) return [];
  
  const intersections = [];
  
  for (let i = 0; i < coords.length - 1; i++) {
    const p1 = [...coords[i], baseHeight];
    const p2 = [...coords[i], baseHeight + maxHeight];
    const p3 = [...coords[i + 1], baseHeight + maxHeight];
    const p4 = [...coords[i + 1], baseHeight];
    
    const edges = [
      [p1, p2],
      [p2, p3],
      [p3, p4],
      [p4, p1]
    ];
    
    for (const [e1, e2] of edges) {
      const intersection = pointLineIntersection(e1, e2, zPlane);
      if (intersection) {
        intersections.push(intersection);
      }
    }
  }
  
  if (intersections.length >= 2) {
    const unique = [];
    const seen = new Set();
    for (const p of intersections) {
      const key = `${p[0].toFixed(6)},${p[1].toFixed(6)}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(p);
      }
    }
    
    if (unique.length >= 2) {
      const centerLng = unique.reduce((sum, p) => sum + p[0], 0) / unique.length;
      const centerLat = unique.reduce((sum, p) => sum + p[1], 0) / unique.length;
      
      unique.sort((a, b) => {
        const angleA = Math.atan2(a[1] - centerLat, a[0] - centerLng);
        const angleB = Math.atan2(b[1] - centerLat, b[0] - centerLng);
        return angleA - angleB;
      });
      
      unique.push(unique[0]);
    }
    
    return unique;
  }
  
  return [];
}

function slicePipeAtZ(pipeCoords, zPlane, depth = 3) {
  if (!pipeCoords || pipeCoords.length < 2) return [];
  
  const intersections = [];
  
  for (let i = 0; i < pipeCoords.length - 1; i++) {
    const p1 = [...pipeCoords[i], -depth];
    const p2 = [...pipeCoords[i + 1], -depth];
    const p1Top = [...pipeCoords[i], -depth + 0.5];
    const p2Top = [...pipeCoords[i + 1], -depth + 0.5];
    
    intersections.push(p1, p2);
  }
  
  return intersections;
}

function sliceBuildings(buildings, zPlane, showUnderground = true) {
  const slicedPolygons = [];
  
  if (!buildings || !buildings.features) return slicedPolygons;
  
  for (const building of buildings.features) {
    const coords = building.geometry?.coordinates;
    if (!coords) continue;
    
    const height = building.properties?.height || 50;
    const sliced = slicePolygonAtZ(
      coords,
      zPlane,
      showUnderground ? -5 : 0,
      height
    );
    
    if (sliced.length >= 2) {
      slicedPolygons.push({
        id: building.id,
        properties: building.properties,
        coordinates: sliced,
        originalHeight: height
      });
    }
  }
  
  return slicedPolygons;
}

function slicePipes(pipes, zPlane, tolerance = 2) {
  const slicedPipes = [];
  
  if (!pipes || !pipes.features) return slicedPipes;
  
  for (const pipe of pipes.features) {
    const coords = pipe.geometry?.coordinates;
    const depth = pipe.properties?.depth || 3;
    
    if (Math.abs(zPlane + depth) < tolerance) {
      slicedPipes.push({
        id: pipe.id,
        properties: pipe.properties,
        coordinates: coords,
        depth
      });
    }
  }
  
  return slicedPipes;
}

function getDepthColor(depth, maxDepth = 20) {
  const ratio = Math.min(Math.abs(depth) / maxDepth, 1);
  
  if (ratio < 0.25) {
    return [135, 206, 250, 200];
  } else if (ratio < 0.5) {
    return [70, 130, 180, 200];
  } else if (ratio < 0.75) {
    return [65, 105, 225, 200];
  } else {
    return [0, 0, 139, 200];
  }
}

function createSectionPlane(startPoint, endPoint, depth = 20) {
  return {
    start: startPoint,
    end: endPoint,
    depth,
    normal: [
      endPoint[1] - startPoint[1],
      startPoint[0] - endPoint[0],
      0
    ]
  };
}

function pointToSectionDistance(point, sectionPlane) {
  const { start, end } = sectionPlane;
  const [px, py] = point;
  const [x1, y1] = start;
  const [x2, y2] = end;
  
  const A = py - y1;
  const B = x2 - x1;
  const C = px - x1;
  const D = y2 - y1;
  
  const dot = A * B - C * D;
  const lenSq = B * B + D * D;
  
  if (lenSq === 0) return Infinity;
  
  const t = (A * D + C * B) / lenSq;
  
  if (t < 0 || t > 1) return Infinity;
  
  return Math.abs(dot) / Math.sqrt(lenSq);
}

function generateSectionProfile(sectionPlane, buildings, pipes, samples = 100) {
  const { start, end, depth } = sectionPlane;
  const profile = [];
  
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const lng = start[0] + (end[0] - start[0]) * t;
    const lat = start[1] + (end[1] - start[1]) * t;
    
    const point = {
      lng,
      lat,
      distance: t,
      buildings: [],
      pipes: []
    };
    
    if (buildings?.features) {
      for (const building of buildings.features) {
        const coords = building.geometry?.coordinates?.[0];
        if (!coords) continue;
        
        if (pointInPolygon(lng, lat, coords)) {
          point.buildings.push({
            height: building.properties?.height || 50,
            name: building.properties?.name,
            type: building.properties?.type
          });
        }
      }
    }
    
    if (pipes?.features) {
      for (const pipe of pipes.features) {
        const pipeCoords = pipe.geometry?.coordinates;
        if (!pipeCoords) continue;
        
        const dist = pointToLineDistance([lng, lat], pipeCoords);
        if (dist < 0.0001) {
          point.pipes.push({
            type: pipe.properties?.type,
            depth: pipe.properties?.depth || 3,
            diameter: pipe.properties?.diameter || 300
          });
        }
      }
    }
    
    profile.push(point);
  }
  
  return profile;
}

function pointInPolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    
    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointToLineDistance(point, lineCoords) {
  let minDist = Infinity;
  
  for (let i = 0; i < lineCoords.length - 1; i++) {
    const dist = pointToSegmentDistance(
      point[0], point[1],
      lineCoords[i][0], lineCoords[i][1],
      lineCoords[i + 1][0], lineCoords[i + 1][1]
    );
    minDist = Math.min(minDist, dist.distance);
  }
  
  return minDist;
}

function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  
  if (lenSq === 0) {
    return { distance: Math.sqrt((px - x1) ** 2 + (py - y1) ** 2), t: 0 };
  }
  
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  
  const closestX = x1 + t * dx;
  const closestY = y1 + t * dy;
  
  return {
    distance: Math.sqrt((px - closestX) ** 2 + (py - closestY) ** 2),
    t,
    closestPoint: [closestX, closestY]
  };
}

export {
  pointLineIntersection,
  slicePolygonAtZ,
  slicePipeAtZ,
  sliceBuildings,
  slicePipes,
  getDepthColor,
  createSectionPlane,
  pointToSectionDistance,
  generateSectionProfile,
  pointInPolygon,
  pointToLineDistance,
  pointToSegmentDistance
};
