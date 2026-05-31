const { query } = require('../config/database');

async function getPipesGeoJSON(req, res) {
  try {
    const { type, material, minDiameter, maxDiameter, status, bbox } = req.query;
    
    let whereClause = '';
    const params = [];
    
    if (type) {
      params.push(type);
      whereClause += ` AND type = $${params.length}`;
    }
    if (material) {
      params.push(material);
      whereClause += ` AND material = $${params.length}`;
    }
    if (minDiameter !== undefined) {
      params.push(parseFloat(minDiameter));
      whereClause += ` AND diameter >= $${params.length}`;
    }
    if (maxDiameter !== undefined) {
      params.push(parseFloat(maxDiameter));
      whereClause += ` AND diameter <= $${params.length}`;
    }
    if (status) {
      params.push(status);
      whereClause += ` AND status = $${params.length}`;
    }
    if (bbox) {
      const [minLng, minLat, maxLng, maxLat] = bbox.split(',').map(Number);
      params.push(`SRID=4326;POLYGON((${minLng} ${minLat}, ${maxLng} ${minLat}, ${maxLng} ${maxLat}, ${minLng} ${maxLat}, ${minLng} ${minLat}))`);
      whereClause += ` AND ST_Intersects(geom, ST_GeomFromText($${params.length}, 4326))`;
    }

    const sql = `
      SELECT 
        id, "pipeId", type, material, diameter, length, depth, pressure,
        "flowRate", status, "yearInstalled", owner, properties,
        ST_AsGeoJSON(geom)::json as geometry
      FROM pipes
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
          pipeId: row.pipeId,
          type: row.type,
          material: row.material,
          diameter: row.diameter,
          length: row.length,
          depth: row.depth,
          pressure: row.pressure,
          flowRate: row.flowRate,
          status: row.status,
          yearInstalled: row.yearInstalled,
          owner: row.owner,
          ...row.properties
        }
      }))
    };

    res.json(geoJSON);
  } catch (error) {
    console.error('Error fetching pipes:', error);
    res.status(500).json({ error: 'Failed to fetch pipes' });
  }
}

async function getPipeById(req, res) {
  try {
    const { id } = req.params;
    
    const sql = `
      SELECT 
        id, "pipeId", type, material, diameter, length, depth, pressure,
        "flowRate", status, "yearInstalled", owner, properties,
        ST_AsGeoJSON(geom)::json as geometry
      FROM pipes
      WHERE id = $1
    `;

    const result = await query(sql, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pipe not found' });
    }

    const row = result.rows[0];
    const feature = {
      type: 'Feature',
      id: row.id,
      geometry: row.geometry,
      properties: {
        id: row.id,
        pipeId: row.pipeId,
        type: row.type,
        material: row.material,
        diameter: row.diameter,
        length: row.length,
        depth: row.depth,
        pressure: row.pressure,
        flowRate: row.flowRate,
        status: row.status,
        yearInstalled: row.yearInstalled,
        owner: row.owner,
        ...row.properties
      }
    };

    res.json(feature);
  } catch (error) {
    console.error('Error fetching pipe:', error);
    res.status(500).json({ error: 'Failed to fetch pipe' });
  }
}

async function createPipe(req, res) {
  try {
    const { pipeId, type, material, diameter, length, depth, pressure, flowRate, status, yearInstalled, owner, geometry, properties } = req.body;

    const sql = `
      INSERT INTO pipes ("pipeId", type, material, diameter, length, depth, pressure, "flowRate", status, "yearInstalled", owner, geom, properties)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, ST_SetSRID(ST_GeomFromGeoJSON($12), 4326), $13)
      RETURNING id, "pipeId", type, material, diameter, length, depth, pressure, "flowRate", status, "yearInstalled", owner, properties, ST_AsGeoJSON(geom)::json as geometry
    `;

    const result = await query(sql, [pipeId, type, material, diameter, length, depth, pressure, flowRate, status, yearInstalled, owner, geometry, properties]);
    
    const row = result.rows[0];
    res.status(201).json({
      type: 'Feature',
      id: row.id,
      geometry: row.geometry,
      properties: {
        id: row.id,
        pipeId: row.pipeId,
        type: row.type,
        material: row.material,
        diameter: row.diameter,
        length: row.length,
        depth: row.depth,
        pressure: row.pressure,
        flowRate: row.flowRate,
        status: row.status,
        yearInstalled: row.yearInstalled,
        owner: row.owner,
        ...row.properties
      }
    });
  } catch (error) {
    console.error('Error creating pipe:', error);
    res.status(500).json({ error: 'Failed to create pipe' });
  }
}

async function updatePipe(req, res) {
  try {
    const { id } = req.params;
    const { pipeId, type, material, diameter, length, depth, pressure, flowRate, status, yearInstalled, owner, geometry, properties } = req.body;

    const sql = `
      UPDATE pipes 
      SET "pipeId" = COALESCE($1, "pipeId"),
          type = COALESCE($2, type),
          material = COALESCE($3, material),
          diameter = COALESCE($4, diameter),
          length = COALESCE($5, length),
          depth = COALESCE($6, depth),
          pressure = COALESCE($7, pressure),
          "flowRate" = COALESCE($8, "flowRate"),
          status = COALESCE($9, status),
          "yearInstalled" = COALESCE($10, "yearInstalled"),
          owner = COALESCE($11, owner),
          geom = COALESCE(ST_SetSRID(ST_GeomFromGeoJSON($12), 4326), geom),
          properties = COALESCE($13, properties)
      WHERE id = $14
      RETURNING id, "pipeId", type, material, diameter, length, depth, pressure, "flowRate", status, "yearInstalled", owner, properties, ST_AsGeoJSON(geom)::json as geometry
    `;

    const result = await query(sql, [pipeId, type, material, diameter, length, depth, pressure, flowRate, status, yearInstalled, owner, geometry, properties, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pipe not found' });
    }

    const row = result.rows[0];
    res.json({
      type: 'Feature',
      id: row.id,
      geometry: row.geometry,
      properties: {
        id: row.id,
        pipeId: row.pipeId,
        type: row.type,
        material: row.material,
        diameter: row.diameter,
        length: row.length,
        depth: row.depth,
        pressure: row.pressure,
        flowRate: row.flowRate,
        status: row.status,
        yearInstalled: row.yearInstalled,
        owner: row.owner,
        ...row.properties
      }
    });
  } catch (error) {
    console.error('Error updating pipe:', error);
    res.status(500).json({ error: 'Failed to update pipe' });
  }
}

async function deletePipe(req, res) {
  try {
    const { id } = req.params;

    const sql = 'DELETE FROM pipes WHERE id = $1 RETURNING id';
    const result = await query(sql, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pipe not found' });
    }

    res.json({ message: 'Pipe deleted successfully', id: result.rows[0].id });
  } catch (error) {
    console.error('Error deleting pipe:', error);
    res.status(500).json({ error: 'Failed to delete pipe' });
  }
}

module.exports = {
  getPipesGeoJSON,
  getPipeById,
  createPipe,
  updatePipe,
  deletePipe
};
