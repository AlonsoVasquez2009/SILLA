const { procesarPago, listarPagos } = require('../services/pagoService');

async function crear(req, res, next) {
  try {
    const pago = await procesarPago(req.session.usuario, req.body);
    res.status(201).json({ mensaje: 'Pago aprobado', pago });
  } catch (err) {
    next(err);
  }
}

async function listar(req, res, next) {
  try {
    const pagos = await listarPagos(req.session.usuario);
    res.json({ pagos });
  } catch (err) {
    next(err);
  }
}

module.exports = { crear, listar };
