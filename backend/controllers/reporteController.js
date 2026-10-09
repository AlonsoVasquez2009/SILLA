const { generarReporte, generarReporteCSV } = require('../services/reporteService');

async function obtener(req, res, next) {
  try {
    const datos = await generarReporte(req.params.tipo);
    res.json({ tipo: req.params.tipo, datos });
  } catch (err) {
    next(err);
  }
}

async function obtenerCSV(req, res, next) {
  try {
    const csv = await generarReporteCSV(req.params.tipo);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.tipo}.csv"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
}

module.exports = { obtener, obtenerCSV };
