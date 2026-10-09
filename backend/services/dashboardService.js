// Junta datos de varias tablas para la vista resumen del dashboard.
const { pool } = require('../db');
const { marcarPrestamosVencidos } = require('./prestamoService');

async function obtenerResumen() {
  await marcarPrestamosVencidos();

  const { rows: recursos } = await pool.query(
    `SELECT tipo, SUM(total) AS total, SUM(disponibles) AS disponibles,
            SUM(reservados) AS reservados, SUM(prestados) AS prestados
     FROM recursos
     GROUP BY tipo`
  );

  const porTipo = { mesa: null, silla: null };
  for (const r of recursos) {
    porTipo[r.tipo] = {
      total: Number(r.total),
      disponibles: Number(r.disponibles),
      reservados: Number(r.reservados),
      prestados: Number(r.prestados),
    };
  }

  const { rows: reservasPendientes } = await pool.query(
    `SELECT COUNT(*) AS n FROM reservas WHERE estado = 'Confirmada'`
  );

  const { rows: prestamosActivos } = await pool.query(
    `SELECT COUNT(*) AS n FROM prestamos WHERE estado IN ('Activo', 'Parcialmente devuelto')`
  );

  const { rows: prestamosVencidos } = await pool.query(
    `SELECT COUNT(*) AS n FROM prestamos WHERE estado = 'Vencido'`
  );

  const { rows: devolucionesPendientes } = await pool.query(
    `SELECT COUNT(*) AS n FROM detalle_prestamos WHERE devuelto < cantidad`
  );

  return {
    mesas: porTipo.mesa || { total: 0, disponibles: 0, reservados: 0, prestados: 0 },
    sillas: porTipo.silla || { total: 0, disponibles: 0, reservados: 0, prestados: 0 },
    operaciones: {
      reservas_confirmadas: Number(reservasPendientes[0].n),
      prestamos_activos: Number(prestamosActivos[0].n),
      prestamos_vencidos: Number(prestamosVencidos[0].n),
      items_pendientes_de_devolucion: Number(devolucionesPendientes[0].n),
    },
  };
}

module.exports = { obtenerResumen };
