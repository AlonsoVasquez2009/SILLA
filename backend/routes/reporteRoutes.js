const express = require('express');
const { obtener, obtenerCSV } = require('../controllers/reporteController');
const { requerirRol } = require('../middleware/auth');

const router = express.Router();

router.get('/:tipo/csv', requerirRol('admin'), obtenerCSV);
router.get('/:tipo', requerirRol('admin'), obtener);

module.exports = router;
