const { crearReserva, listarReservas, cancelarReserva } = require('../services/reservaService');

async function crear(req, res, next) {
  try {
    const reserva = await crearReserva(req.session.usuario.id, req.body);
    res.status(201).json({ mensaje: 'Reserva confirmada', reserva });
  } catch (err) {
    next(err);
  }
}

async function listar(req, res, next) {
  try {
    const reservas = await listarReservas(req.session.usuario);
    res.json({ reservas });
  } catch (err) {
    next(err);
  }
}

async function cancelar(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      const error = new Error('Id de reserva inválido');
      error.status = 400;
      throw error;
    }
    const resultado = await cancelarReserva(id, req.session.usuario);
    res.json({ mensaje: 'Reserva cancelada', reserva: resultado });
  } catch (err) {
    next(err);
  }
}

module.exports = { crear, listar, cancelar };
