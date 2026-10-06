// URLs de autenticación. Solo conecta cada ruta con su controlador.
const express = require('express');
const { login, logout, me } = require('../controllers/authController');
const { requerirSesion } = require('../middleware/auth');

const router = express.Router();

router.post('/login', login);
router.post('/logout', requerirSesion, logout);
router.get('/me', requerirSesion, me);

module.exports = router;
