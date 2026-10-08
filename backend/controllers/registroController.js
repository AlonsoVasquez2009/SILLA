const { registrarCliente } = require('../services/registroService');

async function registrar(req, res, next) {
  try {
    const usuario = await registrarCliente(req.body);

    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.usuario = usuario;
      res.status(201).json({ mensaje: 'Cuenta creada', usuario });
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { registrar };
