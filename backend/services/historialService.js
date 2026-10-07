// Consulta de solo lectura sobre la tabla historial.
const { pool } = require('../db');

// Filtros opcionales: tipo_operacion, recurso_id, usuario_id, desde, hasta.
async function listarHistorial(filtros) {
  const condiciones = [];
  const valores = [];

  if (filtros.tipo_operacion) {
    valores.push(filtros.tipo_operacion);
    condiciones.push(`h.tipo_operacion = $${valores.length}`);
  }
  if (filtros.recurso_id) {
    valores.push(Number(filtros.recurso_id));
    condiciones.push(`h.recurso_id = $${valores.length}`);
  }
  if (filtros.usuario_id) {
    valores.push(Number(filtros.usuario_id));
    condiciones.push(`h.usuario_id = $${valores.length}`);
  }
  if (filtros.desde) {
    valores.push(filtros.desde);
    condiciones.push(`h.fecha >= $${valores.length}`);
  }
  if (filtros.hasta) {
    valores.push(filtros.hasta);
    condiciones.push(`h.fecha <= $${valores.length}`);
  }

  const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT h.id, h.usuario_id, u.nombre AS usuario_nombre, h.tipo_operacion,
            h.recurso_id, rec.nombre AS recurso_nombre, h.cantidad,
            h.estado_anterior, h.estado_posterior, h.fecha
     FROM historial h
     LEFT JOIN usuarios u ON u.id = h.usuario_id
     LEFT JOIN recursos rec ON rec.id = h.recurso_id
     ${where}
     ORDER BY h.fecha DESC
     LIMIT 200`,
    valores
  );
  return rows;
}

module.exports = { listarHistorial };
