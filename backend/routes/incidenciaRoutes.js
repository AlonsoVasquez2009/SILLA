const express = require('express');
const { crear, listar, enReparacion, reparar, baja } = require('../controllers/incidenciaController');
const { requerirRol } = require('../middleware/auth');

const router = express.Router();

// Reportar, ver y resolver incidencias es solo del admin.
router.post('/', requerirRol('admin'), crear);
router.get('/', requerirRol('admin'), listar);
router.put('/:id/en-reparacion', requerirRol('admin'), enReparacion);
router.put('/:id/reparar', requerirRol('admin'), reparar);
router.put('/:id/baja', requerirRol('admin'), baja);

module.exports = router;
