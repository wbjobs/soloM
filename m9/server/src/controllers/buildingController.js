const { query } = require('../config/database');
const Building = require('../models/Building');

async function getBuildingsGeoJSON(req, res) {
  try {
    const { minHeight, maxHeight, type, bbox } = req.query;
    
    let whereClause = '';
    const params = [];
    
    if (minHeight !== undefined) {
      params.push(parseFloat(minHeight));
      whereClause += ` AND height >= $${params.length}`;
    }
    if (maxHeight !== undefined) {
      params.push(parseFloat(maxHeight));
      whereClause += ` AND height <= $${params.length}`;
    }
    if (type) {
      params.push(type);
      whereClause += ` AND type = $${params.length}`;
    }
    if (bbox) {
      const [minLng, minLat, maxLng, maxLat] = bbox.split(',').map(Number);
      params.push(`SRID=4326;POLYGON((${minLng} ${minLat}, ${maxLng} ${minLat}, ${maxLng} ${maxLat}, ${minLng} ${maxLat}, ${minLng} ${minLat}))`);
      whereClause += ` AND ST_Intersects(geom, ST_GeomFromText($${params.length}, 4326))`;
    }

    const sql = `
      SELECT 
        id, name, height, floors, type, "yearBuilt", address, properties,
        ST_AsGeoJSON(geom)::json as geometry
      FROM buildings
      WHERE 1=1 ${whereClause}
    `;

    const result = await query(sql, params);

    const geoJSON = {
      type: 'FeatureCollection',
      features: result.rows.map(row => ({
        type: 'Feature',
        id: row.id,
        geometry: row.geometry,
        properties: {
          id: row.id,
          name: row.name,
          height: row.height,
          floors: row.floors,
          type: row.type,
          yearBuilt: row.yearBuilt,
          address: row.address,
          ...row.properties
        }
      }))
    };

    res.json(geoJSON);
  } catch (error) {
    console.error('Error fetching buildings:', error);
    res.status(500).json({ error: 'Failed to fetch buildings' });
  }
}

async function getBuildingById(req, res) {
  try {
    const { id } = req.params;
    
    const sql = `
      SELECT 
        id, name, height, floors, type, "yearBuilt", address, properties,
        ST_AsGeoJSON(geom)::json as geometry
      FROM buildings
      WHERE id = $1
    `;

    const result = await query(sql, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Building not found' });
    }

    const row = result.rows[0];
    const feature = {
      type: 'Feature',
      id: row.id,
      geometry: row.geometry,
      properties: {
        id: row.id,
        name: row.name,
        height: row.height,
        floors: row.floors,
        type: row.type,
        yearBuilt: row.yearBuilt,
        address: row.address,
        ...row.properties
      }
    };

    res.json(feature);
  } catch (error) {
    console.error('Error fetching building:', error);
    res.status(500).json({ error: 'Failed to fetch building' });
  }
}

async function createBuilding(req, res) {
  try {
    const { name, height, floors, type, yearBuilt, address, geometry, properties } = req.body;

    const sql = `
      INSERT INTO buildings (name, height, floors, type, "yearBuilt", address, geom, properties)
      VALUES ($1, $2, $3, $4, $5, $6, ST_SetSRID(ST_GeomFromGeoJSON($7), 4326), $8)
      RETURNING id, name, height, floors, type, "yearBuilt", address, properties, ST_AsGeoJSON(geom)::json as geometry
    `;

    const result = await query(sql, [name, height, floors, type, yearBuilt, address, geometry, properties]);
    
    const row = result.rows[0];
    res.status(201).json({
      type: 'Feature',
      id: row.id,
      geometry: row.geometry,
      properties: {
        id: row.id,
        name: row.name,
        height: row.height,
        floors: row.floors,
        type: row.type,
        yearBuilt: row.yearBuilt,
        address: row.address,
        ...row.properties
      }
    });
  } catch (error) {
    console.error('Error creating building:', error);
    res.status(500).json({ error: 'Failed to create building' });
  }
}

async function updateBuilding(req, res) {
  try {
    const { id } = req.params;
    const { name, height, floors, type, yearBuilt, address, geometry, properties } = req.body;

    const sql = `
      UPDATE buildings 
      SET name = COALESCE($1, name),
          height = COALESCE($2, height),
          floors = COALESCE($3, floors),
          type = COALESCE($4, type),
          "yearBuilt" = COALESCE($5, "yearBuilt"),
          address = COALESCE($6, address),
          geom = COALESCE(ST_SetSRID(ST_GeomFromGeoJSON($7), 4326), geom),
          properties = COALESCE($8, properties)
      WHERE id = $9
      RETURNING id, name, height, floors, type, "yearBuilt", address, properties, ST_AsGeoJSON(geom)::json as geometry
    `;

    const result = await query(sql, [name, height, floors, type, yearBuilt, address, geometry, properties, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Building not found' });
    }

    const row = result.rows[0];
    res.json({
      type: 'Feature',
      id: row.id,
      geometry: row.geometry,
      properties: {
        id: row.id,
        name: row.name,
        height: row.height,
        floors: row.floors,
        type: row.type,
        yearBuilt: row.yearBuilt,
        address: row.address,
        ...row.properties
      }
    });
  } catch (error) {
    console.error('Error updating building:', error);
    res.status(500).json({ error: 'Failed to update building' });
  }
}

async function deleteBuilding(req, res) {
  try {
    const { id } = req.params;

    const sql = 'DELETE FROM buildings WHERE id = $1 RETURNING id';
    const result = await query(sql, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Building not found' });
    }

    res.json({ message: 'Building deleted successfully', id: result.rows[0].id });
  } catch (error) {
    console.error('Error deleting building:', error);
    res.status(500).json({ error: 'Failed to delete building' });
  }
}

module.exports = {
  getBuildingsGeoJSON,
  getBuildingById,
  createBuilding,
  updateBuilding,
  deleteBuilding
};
