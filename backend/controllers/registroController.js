const { registrarCliente } = require('../services/registroService');

// Ya no inicia sesión automáticamente: la cuenta queda pendiente de
// verificación por correo antes de poder usarla.
async function registrar(req, res, next) {
  try {
    const usuario = await registrarCliente(req.body);
    res.status(201).json({
      mensaje: 'Cuenta creada. Revisa tu correo para verificarla antes de iniciar sesión.',
      usuario,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { registrar };
