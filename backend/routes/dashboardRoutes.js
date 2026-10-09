const express = require('express');
const { obtener } = require('../controllers/dashboardController');
const { requerirRol } = require('../middleware/auth');

const router = express.Router();

router.get('/', requerirRol('admin'), obtener);

module.exports = router;
