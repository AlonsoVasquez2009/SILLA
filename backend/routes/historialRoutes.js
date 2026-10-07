const express = require('express');
const { listar } = require('../controllers/historialController');
const { requerirRol } = require('../middleware/auth');

const router = express.Router();

router.get('/', requerirRol('admin'), listar);

module.exports = router;
