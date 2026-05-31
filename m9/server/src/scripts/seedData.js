require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { query, pool } = require('../config/database');

async function seedData() {
  try {
    const dataDir = path.join(__dirname, '../../data');
    
    const buildingsPath = path.join(dataDir, 'buildings.geojson');
    const pipesPath = path.join(dataDir, 'pipes.geojson');
    
    if (!fs.existsSync(buildingsPath) || !fs.existsSync(pipesPath)) {
      console.log('Generating mock data first...');
      require('./generateMockData');
    }
    
    const buildingsData = JSON.parse(fs.readFileSync(buildingsPath, 'utf8'));
    const pipesData = JSON.parse(fs.readFileSync(pipesPath, 'utf8'));
    
    console.log('Clearing existing data...');
    await query('DELETE FROM pipes');
    await query('DELETE FROM buildings');
    await query('ALTER SEQUENCE buildings_id_seq RESTART WITH 1');
    await query('ALTER SEQUENCE pipes_id_seq RESTART WITH 1');
    
    console.log(`Inserting ${buildingsData.features.length} buildings...`);
    for (const feature of buildingsData.features) {
      const { name, height, floors, type, yearBuilt, address, properties } = feature.properties;
      
      await query(`
        INSERT INTO buildings (name, height, floors, type, "yearBuilt", address, geom, properties)
        VALUES ($1, $2, $3, $4, $5, $6, ST_SetSRID(ST_GeomFromGeoJSON($7), 4326), $8)
      `, [
        name,
        height,
        floors,
        type,
        yearBuilt,
        address,
        JSON.stringify(feature.geometry),
        properties || {}
      ]);
    }
    
    console.log(`Inserting ${pipesData.features.length} pipes...`);
    for (const feature of pipesData.features) {
      const { pipeId, type, material, diameter, length, depth, pressure, flowRate, status, yearInstalled, owner, properties } = feature.properties;
      
      await query(`
        INSERT INTO pipes ("pipeId", type, material, diameter, length, depth, pressure, "flowRate", status, "yearInstalled", owner, geom, properties)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, ST_SetSRID(ST_GeomFromGeoJSON($12), 4326), $13)
      `, [
        pipeId,
        type,
        material,
        diameter,
        length,
        depth,
        pressure,
        flowRate,
        status,
        yearInstalled,
        owner,
        JSON.stringify(feature.geometry),
        properties || {}
      ]);
    }
    
    console.log('Data seeding completed successfully!');
  } catch (error) {
    console.error('Error seeding data:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seedData();
