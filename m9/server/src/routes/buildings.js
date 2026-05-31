const express = require('express');
const router = express.Router();
const buildingController = require('../controllers/buildingController');

router.get('/', buildingController.getBuildingsGeoJSON);
router.get('/:id', buildingController.getBuildingById);
router.post('/', buildingController.createBuilding);
router.put('/:id', buildingController.updateBuilding);
router.delete('/:id', buildingController.deleteBuilding);

module.exports = router;
