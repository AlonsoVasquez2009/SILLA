// Reglas de negocio de reservas. Las reservas son automáticas:
// si hay disponibilidad, se confirman en el mismo momento de crearlas.
const { pool } = require('../db');

// items: [{ recurso_id, cantidad }, ...]
async function crearReserva(usuarioId, { fecha, hora_inicio, hora_fin, items }) {
  if (!fecha || !hora_inicio || !hora_fin) {
    const error = new Error('Fecha, hora de inicio y hora de fin son obligatorias');
    error.status = 400;
    throw error;
  }
  if (!Array.isArray(items) || items.length === 0) {
    const error = new Error('Debes indicar al menos un recurso');
    error.status = 400;
    throw error;
  }

  // No se permite repetir el mismo recurso dos veces en una misma reserva.
  const recursoIds = items.map((i) => i.recurso_id);
  if (new Set(recursoIds).size !== recursoIds.length) {
    const error = new Error('No se puede repetir el mismo recurso en una reserva');
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

    // Ordenamos por recurso_id antes de bloquear: si dos reservas piden
    // los mismos recursos en distinto orden, evita un interbloqueo (deadlock).
    const idsOrdenados = [...recursoIds].sort((a, b) => a - b);
    const { rows: recursos } = await cliente.query(
      `SELECT id, nombre, disponibles FROM recursos WHERE id = ANY($1) FOR UPDATE`,
      [idsOrdenados]
    );

    if (recursos.length !== recursoIds.length) {
      const error = new Error('Alguno de los recursos indicados no existe');
      error.status = 404;
      throw error;
    }

    const disponiblesPorId = new Map(recursos.map((r) => [r.id, r]));

    for (const item of items) {
      const recurso = disponiblesPorId.get(item.recurso_id);
      if (item.cantidad > recurso.disponibles) {
        const error = new Error(
          `No hay suficiente disponibilidad de "${recurso.nombre}": quedan ${recurso.disponibles}`
        );
        error.status = 409;
        throw error;
      }
    }

    const { rows: reservaRows } = await cliente.query(
      `INSERT INTO reservas (usuario_id, fecha, hora_inicio, hora_fin, estado)
       VALUES ($1, $2, $3, $4, 'Confirmada')
       RETURNING id, usuario_id, fecha, hora_inicio, hora_fin, estado, created_at`,
      [usuarioId, fecha, hora_inicio, hora_fin]
    );
    const reserva = reservaRows[0];

    for (const item of items) {
      await cliente.query(
        `INSERT INTO detalle_reservas (reserva_id, recurso_id, cantidad)
         VALUES ($1, $2, $3)`,
        [reserva.id, item.recurso_id, item.cantidad]
      );

      await cliente.query(
        `UPDATE recursos
         SET disponibles = disponibles - $1, reservados = reservados + $1
         WHERE id = $2`,
        [item.cantidad, item.recurso_id]
      );

      await cliente.query(
        `INSERT INTO historial (usuario_id, tipo_operacion, recurso_id, cantidad, estado_anterior, estado_posterior)
         VALUES ($1, 'Reserva creada', $2, $3, NULL, 'Confirmada')`,
        [usuarioId, item.recurso_id, item.cantidad]
      );
    }

    await cliente.query('COMMIT');
    return { ...reserva, items };
  } catch (err) {
    await cliente.query('ROLLBACK');
    throw err;
  } finally {
    cliente.release();
  }
}

// El admin ve todas las reservas; un usuario normal solo las suyas.
async function listarReservas(usuario) {
  const esAdmin = usuario.rol === 'admin';
  const condicion = esAdmin ? '' : 'WHERE r.usuario_id = $1';
  const parametros = esAdmin ? [] : [usuario.id];

  const { rows } = await pool.query(
    `SELECT r.id, r.usuario_id, u.nombre AS usuario_nombre, r.fecha, r.hora_inicio,
            r.hora_fin, r.estado, r.created_at,
            COALESCE(
              json_agg(
                json_build_object('recurso_id', dr.recurso_id, 'nombre', rec.nombre, 'cantidad', dr.cantidad)
              ) FILTER (WHERE dr.id IS NOT NULL), '[]'
            ) AS items
     FROM reservas r
     JOIN usuarios u ON u.id = r.usuario_id
     LEFT JOIN detalle_reservas dr ON dr.reserva_id = r.id
     LEFT JOIN recursos rec ON rec.id = dr.recurso_id
     ${condicion}
     GROUP BY r.id, u.nombre
     ORDER BY r.fecha DESC, r.hora_inicio DESC`,
    parametros
  );
  return rows;
}

// Cancela una reserva y libera sus recursos. Un usuario normal solo puede
// cancelar sus propias reservas; el admin puede cancelar cualquiera.
async function cancelarReserva(reservaId, usuario) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    const { rows: reservaRows } = await cliente.query(
      `SELECT * FROM reservas WHERE id = $1 FOR UPDATE`,
      [reservaId]
    );
    const reserva = reservaRows[0];

    if (!reserva) {
      const error = new Error('Reserva no encontrada');
      error.status = 404;
      throw error;
    }
    if (usuario.rol !== 'admin' && reserva.usuario_id !== usuario.id) {
      const error = new Error('No puedes cancelar la reserva de otro usuario');
      error.status = 403;
      throw error;
    }
    if (reserva.estado !== 'Confirmada') {
      const error = new Error(`La reserva ya está en estado "${reserva.estado}"`);
      error.status = 409;
      throw error;
    }

    const { rows: detalles } = await cliente.query(
      `SELECT recurso_id, cantidad FROM detalle_reservas WHERE reserva_id = $1`,
      [reservaId]
    );

    for (const d of detalles) {
      await cliente.query(
        `UPDATE recursos
         SET disponibles = disponibles + $1, reservados = reservados - $1
         WHERE id = $2`,
        [d.cantidad, d.recurso_id]
      );

      await cliente.query(
        `INSERT INTO historial (usuario_id, tipo_operacion, recurso_id, cantidad, estado_anterior, estado_posterior)
         VALUES ($1, 'Reserva cancelada', $2, $3, 'Confirmada', 'Cancelada')`,
        [usuario.id, d.recurso_id, d.cantidad]
      );
    }

    await cliente.query(`UPDATE reservas SET estado = 'Cancelada' WHERE id = $1`, [reservaId]);

    await cliente.query('COMMIT');
    return { id: reservaId, estado: 'Cancelada' };
  } catch (err) {
    await cliente.query('ROLLBACK');
    throw err;
  } finally {
    cliente.release();
  }
}

module.exports = { crearReserva, listarReservas, cancelarReserva };
