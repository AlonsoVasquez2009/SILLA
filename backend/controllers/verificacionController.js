const { verificarCuenta, reenviarVerificacion } = require('../services/verificacionService');

async function verificar(req, res, next) {
  try {
    const resultado = await verificarCuenta(req.query.token);
    res.json(resultado);
  } catch (err) {
    next(err);
  }
}

async function reenviar(req, res, next) {
  try {
    const resultado = await reenviarVerificacion(req.body.email);
    res.json(resultado);
  } catch (err) {
    next(err);
  }
}

module.exports = { verificar, reenviar };
