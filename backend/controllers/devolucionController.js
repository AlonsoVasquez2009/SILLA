const { registrarDevolucion } = require('../services/devolucionService');

async function crear(req, res, next) {
  try {
    const devolucion = await registrarDevolucion(req.session.usuario.id, req.body);
    res.status(201).json({ mensaje: 'Devolución registrada', devolucion });
  } catch (err) {
    next(err);
  }
}

module.exports = { crear };
