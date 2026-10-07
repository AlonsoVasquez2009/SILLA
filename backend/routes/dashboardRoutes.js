const express = require('express');
const { obtener } = require('../controllers/dashboardController');
const { requerirSesion } = require('../middleware/auth');

const router = express.Router();

router.get('/', requerirSesion, obtener);

module.exports = router;
