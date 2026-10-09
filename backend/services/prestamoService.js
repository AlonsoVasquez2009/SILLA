// Reglas de negocio de préstamos.
// Un préstamo puede crearse directo (items propios) o desde una reserva
// confirmada (usa los items de esa reserva).
const { pool } = require('../db');

function validarFechaPrevista(fecha_prevista) {
  if (!fecha_prevista) {
    const error = new Error('La fecha prevista de devolución es obligatoria');
    error.status = 400;
    throw error;
  }
}

// items: [{ recurso_id, cantidad }, ...] — solo se usa en préstamo directo.
async function crearPrestamo(usuarioId, { reserva_id, items, fecha_prevista, observaciones }) {
  validarFechaPrevista(fecha_prevista);

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    let itemsFinales;

    if (reserva_id) {
      // --- Préstamo a partir de una reserva confirmada ---
      const { rows: reservaRows } = await cliente.query(
        `SELECT * FROM reservas WHERE id = $1 FOR UPDATE`,
        [reserva_id]
      );
      const reserva = reservaRows[0];

      if (!reserva) {
        const error = new Error('Reserva no encontrada');
        error.status = 404;
        throw error;
      }
      if (reserva.estado !== 'Confirmada') {
        const error = new Error(`La reserva está en estado "${reserva.estado}", no se puede prestar`);
        error.status = 409;
        throw error;
      }

      const { rows: yaTienePrestamo } = await cliente.query(
        `SELECT id FROM prestamos WHERE reserva_id = $1`,
        [reserva_id]
      );
      if (yaTienePrestamo.length > 0) {
        const error = new Error('Esta reserva ya tiene un préstamo asociado');
        error.status = 409;
        throw error;
      }

      const { rows: detalles } = await cliente.query(
        `SELECT recurso_id, cantidad FROM detalle_reservas WHERE reserva_id = $1`,
        [reserva_id]
      );
      itemsFinales = detalles;

      // Mueve cada recurso de "reservados" a "prestados".
      for (const d of itemsFinales) {
        await cliente.query(
          `UPDATE recursos SET reservados = reservados - $1, prestados = prestados + $1 WHERE id = $2`,
          [d.cantidad, d.recurso_id]
        );
      }

      await cliente.query(`UPDATE reservas SET estado = 'Finalizada' WHERE id = $1`, [reserva_id]);
    } else {
      // --- Préstamo directo, sin reserva previa ---
      if (!Array.isArray(items) || items.length === 0) {
        const error = new Error('Debes indicar al menos un recurso');
        error.status = 400;
        throw error;
      }
      const recursoIds = items.map((i) => i.recurso_id);
      if (new Set(recursoIds).size !== recursoIds.length) {
        const error = new Error('No se puede repetir el mismo recurso en un préstamo');
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
      const porId = new Map(recursos.map((r) => [r.id, r]));

      for (const item of items) {
        const recurso = porId.get(item.recurso_id);
        if (item.cantidad > recurso.disponibles) {
          const error = new Error(
            `No hay suficiente disponibilidad de "${recurso.nombre}": quedan ${recurso.disponibles}`
          );
          error.status = 409;
          throw error;
        }
      }

      itemsFinales = items;

      for (const item of itemsFinales) {
        await cliente.query(
          `UPDATE recursos SET disponibles = disponibles - $1, prestados = prestados + $1 WHERE id = $2`,
          [item.cantidad, item.recurso_id]
        );
      }
    }

    const { rows: prestamoRows } = await cliente.query(
      `INSERT INTO prestamos (usuario_id, reserva_id, fecha_prevista, estado, observaciones)
       VALUES ($1, $2, $3, 'Activo', $4)
       RETURNING id, usuario_id, reserva_id, fecha_prestamo, fecha_prevista, estado, observaciones`,
      [usuarioId, reserva_id || null, fecha_prevista, observaciones || null]
    );
    const prestamo = prestamoRows[0];

    for (const item of itemsFinales) {
      await cliente.query(
        `INSERT INTO detalle_prestamos (prestamo_id, recurso_id, cantidad, devuelto)
         VALUES ($1, $2, $3, 0)`,
        [prestamo.id, item.recurso_id, item.cantidad]
      );

      await cliente.query(
        `INSERT INTO historial (usuario_id, tipo_operacion, recurso_id, cantidad, estado_anterior, estado_posterior)
         VALUES ($1, 'Préstamo creado', $2, $3, NULL, 'Activo')`,
        [usuarioId, item.recurso_id, item.cantidad]
      );
    }

    await cliente.query('COMMIT');
    return { ...prestamo, items: itemsFinales };
  } catch (err) {
    await cliente.query('ROLLBACK');
    throw err;
  } finally {
    cliente.release();
  }
}

// Pasa a 'Vencido' cualquier préstamo activo o parcialmente devuelto cuya
// fecha prevista ya pasó. Se llama antes de cada lectura relevante en vez
// de depender de un proceso programado aparte.
async function marcarPrestamosVencidos() {
  const { rows } = await pool.query(
    `SELECT id, usuario_id, estado FROM prestamos
     WHERE estado IN ('Activo', 'Parcialmente devuelto') AND fecha_prevista < CURRENT_DATE`
  );

  for (const p of rows) {
    await pool.query(`UPDATE prestamos SET estado = 'Vencido' WHERE id = $1`, [p.id]);
    await pool.query(
      `INSERT INTO historial (usuario_id, tipo_operacion, estado_anterior, estado_posterior)
       VALUES ($1, 'Préstamo marcado vencido', $2, 'Vencido')`,
      [p.usuario_id, p.estado]
    );
  }

  return rows.length;
}

async function listarPrestamos(usuario) {
  await marcarPrestamosVencidos();

  const esAdmin = usuario.rol === 'admin';
  const condicion = esAdmin ? '' : 'WHERE p.usuario_id = $1';
  const parametros = esAdmin ? [] : [usuario.id];

  const { rows } = await pool.query(
    `SELECT p.id, p.usuario_id, u.nombre AS usuario_nombre, p.reserva_id, p.fecha_prestamo,
            p.fecha_prevista, p.estado, p.observaciones,
            COALESCE(
              json_agg(
                json_build_object(
                  'recurso_id', dp.recurso_id, 'nombre', rec.nombre,
                  'cantidad', dp.cantidad, 'devuelto', dp.devuelto
                )
              ) FILTER (WHERE dp.id IS NOT NULL), '[]'
            ) AS items
     FROM prestamos p
     JOIN usuarios u ON u.id = p.usuario_id
     LEFT JOIN detalle_prestamos dp ON dp.prestamo_id = p.id
     LEFT JOIN recursos rec ON rec.id = dp.recurso_id
     ${condicion}
     GROUP BY p.id, u.nombre
     ORDER BY p.fecha_prestamo DESC`,
    parametros
  );
  return rows;
}

module.exports = { crearPrestamo, listarPrestamos, marcarPrestamosVencidos };
