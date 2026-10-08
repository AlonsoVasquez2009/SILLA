const express = require('express');
const { obtener } = require('../controllers/reporteController');
const { requerirRol } = require('../middleware/auth');

const router = express.Router();

router.get('/:tipo', requerirRol('admin'), obtener);

module.exports = router;
