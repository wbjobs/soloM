require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sequelize = require('./config/database');
const staticDataController = require('./controllers/staticDataController');

const buildingRoutes = require('./routes/buildings');
const pipeRoutes = require('./routes/pipes');

const app = express();
const PORT = process.env.PORT || 3001;
let USE_STATIC_DATA = process.env.USE_STATIC_DATA === 'true';

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    dataMode: USE_STATIC_DATA ? 'static' : 'database'
  });
});

if (USE_STATIC_DATA) {
  console.log('Running in STATIC DATA mode (no database required)');
  app.get('/api/buildings', staticDataController.getBuildingsGeoJSON);
  app.get('/api/buildings/:id', staticDataController.getBuildingById);
  app.get('/api/pipes', staticDataController.getPipesGeoJSON);
  app.get('/api/pipes/:id', staticDataController.getPipeById);
} else {
  app.use('/api/buildings', buildingRoutes);
  app.use('/api/pipes', pipeRoutes);
}

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

async function startServer() {
  if (!USE_STATIC_DATA) {
    try {
      await sequelize.authenticate();
      console.log('Database connection has been established successfully.');
      console.log('Running in DATABASE mode');
    } catch (error) {
      console.warn('Unable to connect to database, falling back to STATIC DATA mode');
      console.warn('Database error:', error.message);
      USE_STATIC_DATA = true;
      
      app.get('/api/buildings', staticDataController.getBuildingsGeoJSON);
      app.get('/api/buildings/:id', staticDataController.getBuildingById);
      app.get('/api/pipes', staticDataController.getPipesGeoJSON);
      app.get('/api/pipes/:id', staticDataController.getPipeById);
    }
  }
  
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Data mode: ${USE_STATIC_DATA ? 'STATIC (no DB)' : 'PostGIS database'}`);
    console.log(`API Health: http://localhost:${PORT}/api/health`);
    console.log(`Buildings API: http://localhost:${PORT}/api/buildings`);
    console.log(`Pipes API: http://localhost:${PORT}/api/pipes`);
  });
}

startServer();
