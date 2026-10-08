const { generarReporte } = require('../services/reporteService');

async function obtener(req, res, next) {
  try {
    const datos = await generarReporte(req.params.tipo);
    res.json({ tipo: req.params.tipo, datos });
  } catch (err) {
    next(err);
  }
}

module.exports = { obtener };
