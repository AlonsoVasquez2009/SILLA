const express = require('express');
const { crear, listar } = require('../controllers/prestamoController');
const { requerirSesion, requerirRol } = require('../middleware/auth');

const router = express.Router();

router.post('/', requerirRol('admin'), crear);
router.get('/', requerirSesion, listar);

module.exports = router;
