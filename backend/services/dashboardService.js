// Junta datos de varias tablas para la vista resumen del dashboard.
const { pool } = require('../db');
const { marcarPrestamosVencidos } = require('./prestamoService');

async function obtenerResumen() {
  await marcarPrestamosVencidos();

  const { rows: recursos } = await pool.query(
    `SELECT tipo, SUM(total) AS total, SUM(disponibles) AS disponibles, SUM(prestados) AS prestados
     FROM recursos
     GROUP BY tipo`
  );

  // "Reservado" ya no es un contador fijo: se calcula como la suma de
  // reservas confirmadas de hoy en adelante (independiente de la ventana
  // de 3 días, que solo aplica para decidir si una reserva nueva cabe).
  const { rows: reservadoPorTipo } = await pool.query(
    `SELECT rec.tipo, COALESCE(SUM(dr.cantidad), 0) AS reservado
     FROM detalle_reservas dr
     JOIN reservas r ON r.id = dr.reserva_id
     JOIN recursos rec ON rec.id = dr.recurso_id
     WHERE r.estado = 'Confirmada' AND r.fecha >= CURRENT_DATE
     GROUP BY rec.tipo`
  );
  const reservadoMap = new Map(reservadoPorTipo.map((r) => [r.tipo, Number(r.reservado)]));

  const porTipo = { mesa: null, silla: null };
  for (const r of recursos) {
    porTipo[r.tipo] = {
      total: Number(r.total),
      disponibles: Number(r.disponibles),
      reservados: reservadoMap.get(r.tipo) || 0,
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
