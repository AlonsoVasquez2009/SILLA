const express = require('express');
const { crear, listar } = require('../controllers/pagoController');
const { requerirSesion } = require('../middleware/auth');

const router = express.Router();

router.use(requerirSesion);

router.post('/', crear);
router.get('/', listar);

module.exports = router;
