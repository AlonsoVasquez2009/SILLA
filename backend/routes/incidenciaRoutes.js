const express = require('express');
const { crear, listar, enReparacion, reparar, baja } = require('../controllers/incidenciaController');
const { requerirSesion, requerirRol } = require('../middleware/auth');

const router = express.Router();

// Cualquier usuario autenticado puede reportar un daño o pérdida.
router.post('/', requerirSesion, crear);

// Gestionar y resolver incidencias es solo del admin.
router.get('/', requerirRol('admin'), listar);
router.put('/:id/en-reparacion', requerirRol('admin'), enReparacion);
router.put('/:id/reparar', requerirRol('admin'), reparar);
router.put('/:id/baja', requerirRol('admin'), baja);

module.exports = router;
