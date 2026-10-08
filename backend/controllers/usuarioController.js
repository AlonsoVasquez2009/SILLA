const { listarUsuarios, crearUsuario, modificarUsuario } = require('../services/usuarioService');

async function listar(req, res, next) {
  try {
    res.json({ usuarios: await listarUsuarios() });
  } catch (err) {
    next(err);
  }
}

async function crear(req, res, next) {
  try {
    const usuario = await crearUsuario(req.body);
    res.status(201).json({ mensaje: 'Usuario creado', usuario });
  } catch (err) {
    next(err);
  }
}

async function modificar(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      const error = new Error('Id de usuario inválido');
      error.status = 400;
      throw error;
    }
    const usuario = await modificarUsuario(id, req.body);
    res.json({ mensaje: 'Usuario actualizado', usuario });
  } catch (err) {
    next(err);
  }
}

module.exports = { listar, crear, modificar };
