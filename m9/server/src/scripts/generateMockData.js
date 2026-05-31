const fs = require('fs');
const path = require('path');

const CENTER_LNG = 116.397;
const CENTER_LAT = 39.908;

function generateBuildings(count = 100) {
  const features = [];
  
  for (let i = 0; i < count; i++) {
    const baseLng = CENTER_LNG + (Math.random() - 0.5) * 0.08;
    const baseLat = CENTER_LAT + (Math.random() - 0.5) * 0.08;
    
    const width = 0.0003 + Math.random() * 0.0008;
    const height = 0.0003 + Math.random() * 0.0008;
    
    const coordinates = [
      [baseLng, baseLat],
      [baseLng + width, baseLat],
      [baseLng + width, baseLat + height],
      [baseLng, baseLat + height],
      [baseLng, baseLat]
    ];
    
    const buildingHeight = 10 + Math.floor(Math.random() * 150);
    const types = ['commercial', 'residential', 'industrial', 'public'];
    const type = types[Math.floor(Math.random() * types.length)];
    
    features.push({
      type: 'Feature',
      id: i + 1,
      geometry: {
        type: 'Polygon',
        coordinates: [coordinates]
      },
      properties: {
        id: i + 1,
        name: `建筑 ${i + 1}`,
        height: buildingHeight,
        floors: Math.floor(buildingHeight / 3),
        type: type,
        yearBuilt: 1980 + Math.floor(Math.random() * 44),
        address: `示例路 ${Math.floor(Math.random() * 1000)} 号`,
        properties: {
          area: Math.floor(width * height * 111000 * 111000 * Math.cos(baseLat * Math.PI / 180)),
          usage: type
        }
      }
    });
  }
  
  return {
    type: 'FeatureCollection',
    features
  };
}

function generatePipes(count = 50) {
  const features = [];
  const types = ['water', 'sewage', 'gas', 'electric', 'telecom', 'heating'];
  const materials = {
    water: ['steel', 'pvc', 'cast_iron'],
    sewage: ['concrete', 'pvc'],
    gas: ['steel', 'cast_iron'],
    electric: ['pvc', 'concrete'],
    telecom: ['pvc'],
    heating: ['steel', 'cast_iron']
  };
  
  const typeColors = {
    water: '#1E90FF',
    sewage: '#556B2F',
    gas: '#FF6347',
    electric: '#FFD700',
    telecom: '#9370DB',
    heating: '#FF4500'
  };
  
  for (let i = 0; i < count; i++) {
    const type = types[Math.floor(Math.random() * types.length)];
    const materialList = materials[type];
    const material = materialList[Math.floor(Math.random() * materialList.length)];
    
    const numPoints = 3 + Math.floor(Math.random() * 5);
    const coordinates = [];
    
    let lng = CENTER_LNG + (Math.random() - 0.5) * 0.1;
    let lat = CENTER_LAT + (Math.random() - 0.5) * 0.1;
    
    coordinates.push([lng, lat]);
    
    for (let j = 1; j < numPoints; j++) {
      lng += (Math.random() - 0.5) * 0.02;
      lat += (Math.random() - 0.5) * 0.02;
      coordinates.push([lng, lat]);
    }
    
    let length = 0;
    for (let j = 1; j < coordinates.length; j++) {
      const dx = (coordinates[j][0] - coordinates[j-1][0]) * 111000 * Math.cos(coordinates[j][1] * Math.PI / 180);
      const dy = (coordinates[j][1] - coordinates[j-1][1]) * 111000;
      length += Math.sqrt(dx * dx + dy * dy);
    }
    
    features.push({
      type: 'Feature',
      id: i + 1,
      geometry: {
        type: 'LineString',
        coordinates
      },
      properties: {
        id: i + 1,
        pipeId: `PIPE-${String(i + 1).padStart(6, '0')}`,
        type: type,
        material: material,
        diameter: 100 + Math.floor(Math.random() * 900),
        length: Math.round(length * 10) / 10,
        depth: 1 + Math.random() * 5,
        pressure: type === 'water' || type === 'gas' ? 0.2 + Math.random() * 1.5 : null,
        flowRate: type === 'water' || type === 'sewage' ? Math.floor(Math.random() * 500) : null,
        status: ['normal', 'maintenance', 'normal', 'normal', 'normal'][Math.floor(Math.random() * 5)],
        yearInstalled: 1990 + Math.floor(Math.random() * 34),
        owner: `${type === 'water' ? '水务' : type === 'gas' ? '燃气' : type === 'electric' ? '电力' : type === 'telecom' ? '电信' : type === 'heating' ? '热力' : '市政'}集团`,
        color: typeColors[type],
        properties: {
          maintenanceDate: `2024-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`,
          warrantyYears: 10 + Math.floor(Math.random() * 20)
        }
      }
    });
  }
  
  return {
    type: 'FeatureCollection',
    features
  };
}

const buildingsData = generateBuildings(150);
const pipesData = generatePipes(80);

const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

fs.writeFileSync(
  path.join(dataDir, 'buildings.geojson'),
  JSON.stringify(buildingsData, null, 2)
);

fs.writeFileSync(
  path.join(dataDir, 'pipes.geojson'),
  JSON.stringify(pipesData, null, 2)
);

console.log(`Generated ${buildingsData.features.length} buildings`);
console.log(`Generated ${pipesData.features.length} pipes`);
console.log(`Data saved to ${dataDir}/`);
