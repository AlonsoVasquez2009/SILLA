const { listarTrabajadores, crearTrabajador, modificarTrabajador } = require('../services/salarioService');

async function listar(req, res, next) {
  try {
    res.json({ trabajadores: await listarTrabajadores() });
  } catch (err) {
    next(err);
  }
}

async function crear(req, res, next) {
  try {
    const trabajador = await crearTrabajador(req.body);
    res.status(201).json({ mensaje: 'Trabajador creado', trabajador });
  } catch (err) {
    next(err);
  }
}

async function modificar(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      const error = new Error('Id de trabajador inválido');
      error.status = 400;
      throw error;
    }
    const trabajador = await modificarTrabajador(id, req.body);
    res.json({ mensaje: 'Trabajador actualizado', trabajador });
  } catch (err) {
    next(err);
  }
}

module.exports = { listar, crear, modificar };
