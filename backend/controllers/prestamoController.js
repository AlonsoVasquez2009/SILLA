const { crearPrestamo, listarPrestamos } = require('../services/prestamoService');

async function crear(req, res, next) {
  try {
    const prestamo = await crearPrestamo(req.session.usuario.id, req.body);
    res.status(201).json({ mensaje: 'Préstamo registrado', prestamo });
  } catch (err) {
    next(err);
  }
}

async function listar(req, res, next) {
  try {
    const prestamos = await listarPrestamos(req.session.usuario);
    res.json({ prestamos });
  } catch (err) {
    next(err);
  }
}

module.exports = { crear, listar };
