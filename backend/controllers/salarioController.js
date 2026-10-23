const { registrarSalario, listarSalarios } = require('../services/salarioService');

async function crear(req, res, next) {
  try {
    const salario = await registrarSalario(req.body);
    res.status(201).json({ mensaje: 'Planilla registrada', salario });
  } catch (err) {
    next(err);
  }
}

async function listar(req, res, next) {
  try {
    const trabajadorId = req.query.trabajador_id ? Number(req.query.trabajador_id) : undefined;
    res.json({ salarios: await listarSalarios(trabajadorId) });
  } catch (err) {
    next(err);
  }
}

module.exports = { crear, listar };
