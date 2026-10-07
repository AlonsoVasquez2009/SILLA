const { obtenerResumen } = require('../services/dashboardService');

async function obtener(req, res, next) {
  try {
    const resumen = await obtenerResumen();
    res.json(resumen);
  } catch (err) {
    next(err);
  }
}

module.exports = { obtener };
