// Lee la petición, delega en el servicio y responde.
const { iniciarSesion } = require('../services/authService');

async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
      const error = new Error('Correo y contraseña son obligatorios');
      error.status = 400;
      throw error;
    }

    const usuario = await iniciarSesion(email.trim(), password);

    // Regenerar la sesión al iniciar sesión evita que se reutilice un identificador antiguo.
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.usuario = usuario;
      res.json({ mensaje: 'Sesión iniciada', usuario });
    });
  } catch (err) {
    next(err);
  }
}

function logout(req, res, next) {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('connect.sid');
    res.json({ mensaje: 'Sesión cerrada' });
  });
}

function me(req, res) {
  res.json({ usuario: req.session.usuario });
}

module.exports = { login, logout, me };
