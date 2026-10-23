const express = require('express');
const { crear, listar } = require('../controllers/salarioController');
const { requerirRol } = require('../middleware/auth');

const router = express.Router();

router.use(requerirRol('admin'));

router.get('/', listar);
router.post('/', crear);

module.exports = router;
