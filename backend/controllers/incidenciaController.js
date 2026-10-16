const {
  reportarIncidencia,
  marcarEnReparacion,
  marcarReparado,
  darDeBaja,
  listarIncidencias,
} = require('../services/incidenciaService');

async function crear(req, res, next) {
  try {
    const incidencia = await reportarIncidencia(req.session.usuario.id, req.body);
    res.status(201).json({ mensaje: 'Incidencia registrada', incidencia });
  } catch (err) {
    next(err);
  }
}

async function listar(req, res, next) {
  try {
    const incidencias = await listarIncidencias(req.query);
    res.json({ incidencias });
  } catch (err) {
    next(err);
  }
}

async function enReparacion(req, res, next) {
  try {
    const id = Number(req.params.id);
    const incidencia = await marcarEnReparacion(id);
    res.json({ mensaje: 'Incidencia marcada en reparación', incidencia });
  } catch (err) {
    next(err);
  }
}

async function reparar(req, res, next) {
  try {
    const id = Number(req.params.id);
    const incidencia = await marcarReparado(id, req.session.usuario.id);
    res.json({ mensaje: 'Reparación registrada, el equipo vuelve a disponibles', incidencia });
  } catch (err) {
    next(err);
  }
}

async function baja(req, res, next) {
  try {
    const id = Number(req.params.id);
    const incidencia = await darDeBaja(id, req.session.usuario.id);
    res.json({ mensaje: 'Equipo dado de baja del inventario', incidencia });
  } catch (err) {
    next(err);
  }
}

module.exports = { crear, listar, enReparacion, reparar, baja };
