const express = require('express');
const { obtenerInventario, modificarRecurso } = require('../controllers/inventarioController');
const { requerirSesion, requerirRol } = require('../middleware/auth');

const router = express.Router();

// Cualquier usuario autenticado puede ver el inventario.
router.get('/', requerirSesion, obtenerInventario);

// Solo el admin puede cambiar el total de un recurso.
router.put('/:id', requerirRol('admin'), modificarRecurso);

module.exports = router;
