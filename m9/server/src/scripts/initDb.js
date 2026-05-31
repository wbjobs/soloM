require('dotenv').config();
const { query, pool } = require('../config/database');

async function initDatabase() {
  try {
    console.log('Creating PostGIS extension...');
    await query('CREATE EXTENSION IF NOT EXISTS postgis');
    await query('CREATE EXTENSION IF NOT EXISTS postgis_topology');
    console.log('PostGIS extension created successfully');

    console.log('Creating buildings table...');
    await query(`
      CREATE TABLE IF NOT EXISTS buildings (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
        height FLOAT NOT NULL,
        floors INTEGER,
        type VARCHAR(50),
        "yearBuilt" INTEGER,
        address VARCHAR(200),
        geom GEOMETRY(POLYGON, 4326) NOT NULL,
        properties JSONB,
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    console.log('Creating spatial index on buildings...');
    await query(`
      CREATE INDEX IF NOT EXISTS idx_buildings_geom 
      ON buildings USING GIST(geom)
    `);

    console.log('Creating pipes table...');
    await query(`
      CREATE TABLE IF NOT EXISTS pipes (
        id SERIAL PRIMARY KEY,
        "pipeId" VARCHAR(50) NOT NULL UNIQUE,
        type VARCHAR(50) NOT NULL,
        material VARCHAR(50),
        diameter FLOAT,
        length FLOAT,
        depth FLOAT,
        pressure FLOAT,
        "flowRate" FLOAT,
        status VARCHAR(20) DEFAULT 'normal',
        "yearInstalled" INTEGER,
        owner VARCHAR(100),
        geom GEOMETRY(LINESTRING, 4326) NOT NULL,
        properties JSONB,
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    console.log('Creating indexes on pipes...');
    await query(`
      CREATE INDEX IF NOT EXISTS idx_pipes_geom 
      ON pipes USING GIST(geom)
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_pipes_type 
      ON pipes(type)
    `);

    console.log('Database initialization completed successfully!');
  } catch (error) {
    console.error('Error initializing database:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

initDatabase();
