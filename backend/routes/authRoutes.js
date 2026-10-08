const express = require('express');
const { login, logout, me } = require('../controllers/authController');
const { registrar } = require('../controllers/registroController');
const { requerirSesion } = require('../middleware/auth');

const router = express.Router();

router.post('/login', login);
router.post('/registro', registrar);
router.post('/logout', requerirSesion, logout);
router.get('/me', requerirSesion, me);

module.exports = router;
