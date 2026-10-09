// Reportes de solo lectura, construidos sobre las tablas ya existentes.
const { pool } = require('../db');
const { marcarPrestamosVencidos } = require('./prestamoService');

async function prestamosVencidos() {
  await marcarPrestamosVencidos();

  const { rows } = await pool.query(
    `SELECT p.id, p.usuario_id, u.nombre AS usuario_nombre, p.fecha_prestamo,
            p.fecha_prevista, p.estado,
            (CURRENT_DATE - p.fecha_prevista) AS dias_de_atraso,
            COALESCE(
              json_agg(
                json_build_object(
                  'recurso_id', dp.recurso_id, 'nombre', rec.nombre,
                  'cantidad', dp.cantidad, 'devuelto', dp.devuelto,
                  'pendiente', dp.cantidad - dp.devuelto
                )
              ) FILTER (WHERE dp.id IS NOT NULL), '[]'
            ) AS items
     FROM prestamos p
     JOIN usuarios u ON u.id = p.usuario_id
     LEFT JOIN detalle_prestamos dp ON dp.prestamo_id = p.id
     LEFT JOIN recursos rec ON rec.id = dp.recurso_id
     WHERE p.estado = 'Vencido'
     GROUP BY p.id, u.nombre
     ORDER BY p.fecha_prevista ASC`
  );
  return rows;
}

async function inventarioActual() {
  const { rows } = await pool.query(
    `SELECT id, nombre, tipo, total, disponibles, reservados, prestados
     FROM recursos
     ORDER BY tipo, nombre`
  );
  return rows;
}

const REPORTES = {
  'prestamos-vencidos': prestamosVencidos,
  inventario: inventarioActual,
};

async function generarReporte(tipo) {
  const funcion = REPORTES[tipo];
  if (!funcion) {
    const error = new Error(
      `Reporte desconocido: "${tipo}". Disponibles: ${Object.keys(REPORTES).join(', ')}`
    );
    error.status = 400;
    throw error;
  }
  return funcion();
}

module.exports = { generarReporte };
