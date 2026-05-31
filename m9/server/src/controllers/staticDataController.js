const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');

function ensureDataExists() {
  const buildingsPath = path.join(DATA_DIR, 'buildings.geojson');
  const pipesPath = path.join(DATA_DIR, 'pipes.geojson');
  
  if (!fs.existsSync(buildingsPath) || !fs.existsSync(pipesPath)) {
    require('../scripts/generateMockData');
  }
}

function getBuildingsGeoJSON(req, res) {
  try {
    ensureDataExists();
    
    const { minHeight, maxHeight, type } = req.query;
    
    const dataPath = path.join(DATA_DIR, 'buildings.geojson');
    const rawData = fs.readFileSync(dataPath, 'utf8');
    let data = JSON.parse(rawData);
    
    if (minHeight !== undefined || maxHeight !== undefined || type) {
      data.features = data.features.filter(feature => {
        const props = feature.properties;
        if (minHeight !== undefined && props.height < parseFloat(minHeight)) return false;
        if (maxHeight !== undefined && props.height > parseFloat(maxHeight)) return false;
        if (type && props.type !== type) return false;
        return true;
      });
    }
    
    res.json(data);
  } catch (error) {
    console.error('Error fetching buildings:', error);
    res.status(500).json({ error: 'Failed to fetch buildings' });
  }
}

function getBuildingById(req, res) {
  try {
    ensureDataExists();
    
    const { id } = req.params;
    const dataPath = path.join(DATA_DIR, 'buildings.geojson');
    const rawData = fs.readFileSync(dataPath, 'utf8');
    const data = JSON.parse(rawData);
    
    const feature = data.features.find(f => f.id === parseInt(id) || f.properties.id === parseInt(id));
    
    if (!feature) {
      return res.status(404).json({ error: 'Building not found' });
    }
    
    res.json(feature);
  } catch (error) {
    console.error('Error fetching building:', error);
    res.status(500).json({ error: 'Failed to fetch building' });
  }
}

function getPipesGeoJSON(req, res) {
  try {
    ensureDataExists();
    
    const { type, material, minDiameter, maxDiameter, status } = req.query;
    
    const dataPath = path.join(DATA_DIR, 'pipes.geojson');
    const rawData = fs.readFileSync(dataPath, 'utf8');
    let data = JSON.parse(rawData);
    
    if (type || material || minDiameter !== undefined || maxDiameter !== undefined || status) {
      data.features = data.features.filter(feature => {
        const props = feature.properties;
        if (type && props.type !== type) return false;
        if (material && props.material !== material) return false;
        if (minDiameter !== undefined && props.diameter < parseFloat(minDiameter)) return false;
        if (maxDiameter !== undefined && props.diameter > parseFloat(maxDiameter)) return false;
        if (status && props.status !== status) return false;
        return true;
      });
    }
    
    res.json(data);
  } catch (error) {
    console.error('Error fetching pipes:', error);
    res.status(500).json({ error: 'Failed to fetch pipes' });
  }
}

function getPipeById(req, res) {
  try {
    ensureDataExists();
    
    const { id } = req.params;
    const dataPath = path.join(DATA_DIR, 'pipes.geojson');
    const rawData = fs.readFileSync(dataPath, 'utf8');
    const data = JSON.parse(rawData);
    
    const feature = data.features.find(f => f.id === parseInt(id) || f.properties.id === parseInt(id));
    
    if (!feature) {
      return res.status(404).json({ error: 'Pipe not found' });
    }
    
    res.json(feature);
  } catch (error) {
    console.error('Error fetching pipe:', error);
    res.status(500).json({ error: 'Failed to fetch pipe' });
  }
}

module.exports = {
  getBuildingsGeoJSON,
  getBuildingById,
  getPipesGeoJSON,
  getPipeById
};
