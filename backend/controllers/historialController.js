const { listarHistorial } = require('../services/historialService');

async function listar(req, res, next) {
  try {
    const historial = await listarHistorial(req.query);
    res.json({ historial });
  } catch (err) {
    next(err);
  }
}

module.exports = { listar };
