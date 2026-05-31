function degToRad(deg) {
  return deg * Math.PI / 180;
}

function latLngToMeters(lng1, lat1, lng2, lat2) {
  const R = 6371000;
  const φ1 = degToRad(lat1);
  const φ2 = degToRad(lat2);
  const Δφ = degToRad(lat2 - lat1);
  const Δλ = degToRad(lng2 - lng1);

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    return {
      distance: Math.sqrt((px - x1) ** 2 + (py - y1) ** 2),
      t: 0,
      closestPoint: { x: x1, y: y1 }
    };
  }

  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const closestX = x1 + t * dx;
  const closestY = y1 + t * dy;

  return {
    distance: Math.sqrt((px - closestX) ** 2 + (py - closestY) ** 2),
    t,
    closestPoint: { x: closestX, y: closestY }
  };
}

function pointToLineStringDistance(px, py, coordinates) {
  if (!coordinates || coordinates.length < 2) {
    return { distance: Infinity, closestPoint: null, segmentIndex: -1 };
  }

  let minDistance = Infinity;
  let closestPoint = null;
  let closestSegmentIndex = -1;
  let closestT = 0;

  for (let i = 0; i < coordinates.length - 1; i++) {
    const [x1, y1] = coordinates[i];
    const [x2, y2] = coordinates[i + 1];

    const result = pointToSegmentDistance(px, py, x1, y1, x2, y2);

    if (result.distance < minDistance) {
      minDistance = result.distance;
      closestPoint = result.closestPoint;
      closestSegmentIndex = i;
      closestT = result.t;
    }
  }

  return {
    distance: minDistance,
    closestPoint,
    segmentIndex: closestSegmentIndex,
    t: closestT
  };
}

function screenToLonLat(screenX, screenY, viewport) {
  if (!viewport) return null;

  try {
    const { longitude, latitude } = viewport.unproject([screenX, screenY]);
    return { longitude, latitude };
  } catch (e) {
    return null;
  }
}

function findNearestPipe(pipes, clickLng, clickLat, maxDistanceMeters = 20) {
  if (!pipes || pipes.length === 0) return null;

  let nearestPipe = null;
  let nearestDistance = Infinity;
  let nearestInfo = null;

  for (const pipe of pipes) {
    const coordinates = pipe.geometry?.coordinates;
    if (!coordinates || coordinates.length < 2) continue;

    const result = pointToLineStringDistance(clickLng, clickLat, coordinates);
    
    const distanceMeters = result.distance * 111000 * Math.cos(clickLat * Math.PI / 180);

    if (distanceMeters < nearestDistance && distanceMeters <= maxDistanceMeters) {
      nearestDistance = distanceMeters;
      nearestPipe = pipe;
      nearestInfo = result;
    }
  }

  if (nearestPipe) {
    return {
      pipe: nearestPipe,
      distance: nearestDistance,
      ...nearestInfo
    };
  }

  return null;
}

function findNearestBuilding(buildings, clickLng, clickLat) {
  if (!buildings || buildings.length === 0) return null;

  for (const building of buildings) {
    const coordinates = building.geometry?.coordinates?.[0] || building.geometry?.coordinates;
    if (!coordinates || coordinates.length < 3) continue;

    if (pointInPolygon(clickLng, clickLat, coordinates)) {
      return building;
    }
  }

  return null;
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

function pickFeature(layers, screenX, screenY, viewport, pipesData, buildingsData, options = {}) {
  const { maxPipeDistance = 20 } = options;
  
  const worldCoords = screenToLonLat(screenX, screenY, viewport);
  if (!worldCoords) return null;

  const { longitude, latitude } = worldCoords;

  const building = findNearestBuilding(
    buildingsData?.features || [],
    longitude,
    latitude
  );

  if (building) {
    return {
      type: 'building',
      object: building,
      x: screenX,
      y: screenY
    };
  }

  const pipeResult = findNearestPipe(
    pipesData?.features || [],
    longitude,
    latitude,
    maxPipeDistance
  );

  if (pipeResult) {
    return {
      type: 'pipe',
      object: pipeResult.pipe,
      x: screenX,
      y: screenY,
      distance: pipeResult.distance
    };
  }

  return null;
}

function createPickingCollisionLayer(pipes, type, color = [255, 0, 0, 0]) {
  return pipes.map(pipe => ({
    ...pipe,
    _collision: true,
    _originalWidth: pipe.properties?.diameter || 300
  }));
}

export {
  degToRad,
  latLngToMeters,
  pointToSegmentDistance,
  pointToLineStringDistance,
  screenToLonLat,
  findNearestPipe,
  findNearestBuilding,
  pointInPolygon,
  pickFeature,
  createPickingCollisionLayer
};
