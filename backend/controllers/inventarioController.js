const { listarInventario, actualizarTotal } = require('../services/inventarioService');

async function obtenerInventario(req, res, next) {
  try {
    const recursos = await listarInventario();
    res.json({ recursos });
  } catch (err) {
    next(err);
  }
}

async function modificarRecurso(req, res, next) {
  try {
    const id = Number(req.params.id);
    const { total } = req.body;

    if (!Number.isInteger(id)) {
      const error = new Error('Id de recurso inválido');
      error.status = 400;
      throw error;
    }

    const recurso = await actualizarTotal(id, total);
    res.json({ mensaje: 'Recurso actualizado', recurso });
  } catch (err) {
    next(err);
  }
}

module.exports = { obtenerInventario, modificarRecurso };
