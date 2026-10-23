const express = require('express');
const { listar, crear, modificar } = require('../controllers/trabajadorController');
const { requerirRol } = require('../middleware/auth');

const router = express.Router();

router.use(requerirRol('admin'));

router.get('/', listar);
router.post('/', crear);
router.put('/:id', modificar);

module.exports = router;
