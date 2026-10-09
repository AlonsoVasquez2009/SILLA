const express = require('express');
const { login, logout, me } = require('../controllers/authController');
const { registrar } = require('../controllers/registroController');
const { verificar, reenviar } = require('../controllers/verificacionController');
const { requerirSesion } = require('../middleware/auth');

const router = express.Router();

router.post('/login', login);
router.post('/registro', registrar);
router.get('/verificar', verificar);
router.post('/reenviar-verificacion', reenviar);
router.post('/logout', requerirSesion, logout);
router.get('/me', requerirSesion, me);

module.exports = router;
