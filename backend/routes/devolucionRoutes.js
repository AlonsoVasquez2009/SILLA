const express = require('express');
const { crear } = require('../controllers/devolucionController');
const { requerirRol } = require('../middleware/auth');

const router = express.Router();

router.post('/', requerirRol('admin'), crear);

module.exports = router;
