// Reglas de negocio de devoluciones.
// Cada devolución es un evento propio; un préstamo puede tener varias
// hasta quedar completamente devuelto.
const { pool } = require('../db');

// items: [{ recurso_id, cantidad }, ...]
async function registrarDevolucion(registradoPor, { prestamo_id, items }) {
  if (!prestamo_id) {
    const error = new Error('Debes indicar el préstamo');
    error.status = 400;
    throw error;
  }
  if (!Array.isArray(items) || items.length === 0) {
    const error = new Error('Debes indicar al menos un recurso a devolver');
    error.status = 400;
    throw error;
  }
  for (const item of items) {
    if (!Number.isInteger(item.cantidad) || item.cantidad <= 0) {
      const error = new Error('Las cantidades deben ser enteros mayores que 0');
      error.status = 400;
      throw error;
    }
  }

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    const { rows: prestamoRows } = await cliente.query(
      `SELECT * FROM prestamos WHERE id = $1 FOR UPDATE`,
      [prestamo_id]
    );
    const prestamo = prestamoRows[0];

    if (!prestamo) {
      const error = new Error('Préstamo no encontrado');
      error.status = 404;
      throw error;
    }
    if (prestamo.estado === 'Devuelto') {
      const error = new Error('Este préstamo ya fue devuelto por completo');
      error.status = 409;
      throw error;
    }

    const idsOrdenados = [...new Set(items.map((i) => i.recurso_id))].sort((a, b) => a - b);
    const { rows: detalles } = await cliente.query(
      `SELECT dp.id, dp.recurso_id, dp.cantidad, dp.devuelto, rec.nombre
       FROM detalle_prestamos dp
       JOIN recursos rec ON rec.id = dp.recurso_id
       WHERE dp.prestamo_id = $1 AND dp.recurso_id = ANY($2)
       FOR UPDATE OF dp`,
      [prestamo_id, idsOrdenados]
    );
    const detallePorRecurso = new Map(detalles.map((d) => [d.recurso_id, d]));

    for (const item of items) {
      const detalle = detallePorRecurso.get(item.recurso_id);
      if (!detalle) {
        const error = new Error(`El recurso indicado no pertenece a este préstamo`);
        error.status = 400;
        throw error;
      }
      const pendiente = detalle.cantidad - detalle.devuelto;
      if (item.cantidad > pendiente) {
        const error = new Error(
          `No se puede devolver más de lo pendiente de "${detalle.nombre}": quedan ${pendiente}`
        );
        error.status = 409;
        throw error;
      }
    }

    const { rows: devolucionRows } = await cliente.query(
      `INSERT INTO devoluciones (prestamo_id, registrado_por)
       VALUES ($1, $2)
       RETURNING id, prestamo_id, registrado_por, fecha_real`,
      [prestamo_id, registradoPor]
    );
    const devolucion = devolucionRows[0];

    for (const item of items) {
      await cliente.query(
        `INSERT INTO detalle_devoluciones (devolucion_id, recurso_id, cantidad)
         VALUES ($1, $2, $3)`,
        [devolucion.id, item.recurso_id, item.cantidad]
      );

      await cliente.query(
        `UPDATE detalle_prestamos SET devuelto = devuelto + $1
         WHERE prestamo_id = $2 AND recurso_id = $3`,
        [item.cantidad, prestamo_id, item.recurso_id]
      );

      await cliente.query(
        `UPDATE recursos SET disponibles = disponibles + $1, prestados = prestados - $1 WHERE id = $2`,
        [item.cantidad, item.recurso_id]
      );

      await cliente.query(
        `INSERT INTO historial (usuario_id, tipo_operacion, recurso_id, cantidad, estado_anterior, estado_posterior)
         VALUES ($1, 'Devolución registrada', $2, $3, $4, NULL)`,
        [registradoPor, item.recurso_id, item.cantidad, prestamo.estado]
      );
    }

    // Recalcula si el préstamo queda parcial o totalmente devuelto.
    const { rows: pendientes } = await cliente.query(
      `SELECT SUM(cantidad - devuelto) AS total_pendiente FROM detalle_prestamos WHERE prestamo_id = $1`,
      [prestamo_id]
    );
    const totalPendiente = Number(pendientes[0].total_pendiente);
    const nuevoEstado = totalPendiente === 0 ? 'Devuelto' : 'Parcialmente devuelto';

    await cliente.query(`UPDATE prestamos SET estado = $1 WHERE id = $2`, [nuevoEstado, prestamo_id]);

    await cliente.query('COMMIT');
    return { ...devolucion, items, estado_prestamo: nuevoEstado };
  } catch (err) {
    await cliente.query('ROLLBACK');
    throw err;
  } finally {
    cliente.release();
  }
}

module.exports = { registrarDevolucion };
