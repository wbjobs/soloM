class SpatialGridIndex {
  constructor(cellSize = 0.001) {
    this.cellSize = cellSize;
    this.grid = new Map();
  }

  getCellKey(lng, lat) {
    const cellX = Math.floor(lng / this.cellSize);
    const cellY = Math.floor(lat / this.cellSize);
    return `${cellX},${cellY}`;
  }

  getCenter(feature) {
    const coords = feature.geometry?.coordinates;
    if (!coords) return null;

    if (feature.geometry.type === 'Polygon') {
      const ring = coords[0] || coords;
      let sumLng = 0, sumLat = 0;
      const count = ring.length - 1;
      for (let i = 0; i < count; i++) {
        sumLng += ring[i][0];
        sumLat += ring[i][1];
      }
      return { lng: sumLng / count, lat: sumLat / count };
    } else if (feature.geometry.type === 'LineString') {
      const midIndex = Math.floor(coords.length / 2);
      return { lng: coords[midIndex][0], lat: coords[midIndex][1] };
    }
    return null;
  }

  insert(feature) {
    const center = this.getCenter(feature);
    if (!center) return;

    const key = this.getCellKey(center.lng, center.lat);
    if (!this.grid.has(key)) {
      this.grid.set(key, []);
    }
    this.grid.get(key).push(feature);
    feature._cellKey = key;
    feature._center = center;
  }

  buildIndex(features) {
    this.grid.clear();
    features.forEach(f => this.insert(f));
    return this;
  }

  query(bounds) {
    const { minLng, minLat, maxLng, maxLat } = bounds;
    const results = [];

    const minCellX = Math.floor(minLng / this.cellSize);
    const maxCellX = Math.floor(maxLng / this.cellSize);
    const minCellY = Math.floor(minLat / this.cellSize);
    const maxCellY = Math.floor(maxLat / this.cellSize);

    for (let x = minCellX; x <= maxCellX; x++) {
      for (let y = minCellY; y <= maxCellY; y++) {
        const key = `${x},${y}`;
        const cell = this.grid.get(key);
        if (cell) {
          results.push(...cell);
        }
      }
    }

    return results;
  }

  getAll() {
    const results = [];
    this.grid.forEach(cell => results.push(...cell));
    return results;
  }

  getCellCount() {
    return this.grid.size;
  }
}

class Quadtree {
  constructor(bounds, maxPoints = 10, maxDepth = 8) {
    this.bounds = bounds;
    this.maxPoints = maxPoints;
    this.maxDepth = maxDepth;
    this.points = [];
    this.children = null;
  }

  subdivide() {
    const { minLng, minLat, maxLng, maxLat } = this.bounds;
    const midLng = (minLng + maxLng) / 2;
    const midLat = (minLat + maxLat) / 2;

    this.children = [
      new Quadtree({ minLng, minLat, maxLng: midLng, maxLat: midLat }, this.maxPoints, this.maxDepth - 1),
      new Quadtree({ minLng: midLng, minLat, maxLng, maxLat: midLat }, this.maxPoints, this.maxDepth - 1),
      new Quadtree({ minLng, minLat: midLat, maxLng: midLng, maxLat }, this.maxPoints, this.maxDepth - 1),
      new Quadtree({ minLng: midLng, minLat: midLat, maxLng, maxLat }, this.maxPoints, this.maxDepth - 1)
    ];

    for (const point of this.points) {
      this._insertIntoChildren(point);
    }
    this.points = [];
  }

  _insertIntoChildren(point) {
    for (const child of this.children) {
      if (child._contains(point)) {
        child.insert(point);
        return;
      }
    }
  }

  _contains(point) {
    const { lng, lat } = point;
    const { minLng, minLat, maxLng, maxLat } = this.bounds;
    return lng >= minLng && lng < maxLng && lat >= minLat && lat < maxLat;
  }

  insert(feature) {
    const coords = feature.geometry?.coordinates;
    if (!coords) return false;

    let lng, lat;
    if (feature.geometry.type === 'Polygon') {
      const ring = coords[0] || coords;
      lng = ring[0][0];
      lat = ring[0][1];
    } else if (feature.geometry.type === 'LineString') {
      lng = coords[0][0];
      lat = coords[0][1];
    } else {
      return false;
    }

    const point = { lng, lat, feature };

    if (!this._contains(point)) {
      return false;
    }

    if (this.children) {
      this._insertIntoChildren(point);
      return true;
    }

    this.points.push(point);

    if (this.points.length > this.maxPoints && this.maxDepth > 0) {
      this.subdivide();
    }

    return true;
  }

  buildIndex(features) {
    this.points = [];
    this.children = null;
    features.forEach(f => this.insert(f));
    return this;
  }

  query(bounds, results = []) {
    if (!this._intersects(bounds)) {
      return results;
    }

    for (const point of this.points) {
      if (point.lng >= bounds.minLng && point.lng < bounds.maxLng &&
          point.lat >= bounds.minLat && point.lat < bounds.maxLat) {
        results.push(point.feature);
      }
    }

    if (this.children) {
      for (const child of this.children) {
        child.query(bounds, results);
      }
    }

    return results;
  }

  _intersects(bounds) {
    return !(this.bounds.maxLng < bounds.minLng ||
             this.bounds.minLng > bounds.maxLng ||
             this.bounds.maxLat < bounds.minLat ||
             this.bounds.minLat > bounds.maxLat);
  }

  getAll(results = []) {
    results.push(...this.points.map(p => p.feature));
    if (this.children) {
      for (const child of this.children) {
        child.getAll(results);
      }
    }
    return results;
  }
}

function calculateViewBounds(viewState, fov = 60) {
  const { longitude, latitude, zoom } = viewState;
  
  const metersPerPixel = 156543.03392 * Math.cos(latitude * Math.PI / 180) / Math.pow(2, zoom);
  const viewportMeters = metersPerPixel * Math.max(window.innerWidth, window.innerHeight);
  const viewportDegrees = viewportMeters / 111000 * 1.5;

  return {
    minLng: longitude - viewportDegrees,
    maxLng: longitude + viewportDegrees,
    minLat: latitude - viewportDegrees,
    maxLat: latitude + viewportDegrees
  };
}

function getDistanceFromCamera(feature, cameraPosition) {
  const center = feature._center;
  if (!center) return Infinity;

  const dx = (center.lng - cameraPosition.longitude) * 111000 * Math.cos(center.lat * Math.PI / 180);
  const dy = (center.lat - cameraPosition.latitude) * 111000;
  const dz = cameraPosition.height;

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function filterFeaturesByLOD(features, cameraPosition, lodLevels) {
  return features.map(feature => {
    const distance = getDistanceFromCamera(feature, cameraPosition);
    let lodLevel = 0;

    for (let i = lodLevels.length - 1; i >= 0; i--) {
      if (distance >= lodLevels[i].minDistance) {
        lodLevel = i;
        break;
      }
    }

    return {
      ...feature,
      _distance: distance,
      _lodLevel: lodLevel,
      _visible: distance <= lodLevels[lodLevels.length - 1].maxDistance
    };
  });
}

const DEFAULT_LOD_LEVELS = [
  { minDistance: 0, maxDistance: 500, quality: 'high', showOutline: true, maxFeatures: Infinity },
  { minDistance: 500, maxDistance: 2000, quality: 'medium', showOutline: false, maxFeatures: 2000 },
  { minDistance: 2000, maxDistance: 5000, quality: 'low', showOutline: false, maxFeatures: 1000 },
  { minDistance: 5000, maxDistance: 10000, quality: 'verylow', showOutline: false, maxFeatures: 500 },
  { minDistance: 10000, maxDistance: Infinity, quality: 'hidden', showOutline: false, maxFeatures: 0 }
];

export {
  SpatialGridIndex,
  Quadtree,
  calculateViewBounds,
  getDistanceFromCamera,
  filterFeaturesByLOD,
  DEFAULT_LOD_LEVELS
};
