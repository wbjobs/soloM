const express = require('express');
const router = express.Router();
const pipeController = require('../controllers/pipeController');

router.get('/', pipeController.getPipesGeoJSON);
router.get('/:id', pipeController.getPipeById);
router.post('/', pipeController.createPipe);
router.put('/:id', pipeController.updatePipe);
router.delete('/:id', pipeController.deletePipe);

module.exports = router;
