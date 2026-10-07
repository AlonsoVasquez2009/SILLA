const express = require('express');
const { crear, listar, cancelar } = require('../controllers/reservaController');
const { requerirSesion } = require('../middleware/auth');

const router = express.Router();

router.use(requerirSesion);

router.post('/', crear);
router.get('/', listar);
router.put('/:id/cancelar', cancelar);

module.exports = router;
