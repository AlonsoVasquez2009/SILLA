// Reglas de negocio de incidencias: daños y pérdidas de equipo.
// El inventario tiene tres estados físicos: disponibles, prestados y
// dañados. Una incidencia mueve unidades entre esos estados y, cuando se
// resuelve, las regresa a disponibles (reparado) o las saca del total
// para siempre (dado de baja).
const { pool } = require('../db');

const TIPOS_VALIDOS = ['dano', 'perdida'];
const ORIGENES_VALIDOS = ['disponible', 'prestamo'];

function validarDatosBase({ recurso_id, tipo_incidencia, cantidad, origen }) {
  if (!Number.isInteger(recurso_id)) {
    const error = new Error('Debes indicar el recurso afectado');
    error.status = 400;
    throw error;
  }
  if (!TIPOS_VALIDOS.includes(tipo_incidencia)) {
    const error = new Error(`tipo_incidencia debe ser uno de: ${TIPOS_VALIDOS.join(', ')}`);
    error.status = 400;
    throw error;
  }
  if (!ORIGENES_VALIDOS.includes(origen)) {
    const error = new Error(`origen debe ser uno de: ${ORIGENES_VALIDOS.join(', ')}`);
    error.status = 400;
    throw error;
  }
  if (!Number.isInteger(cantidad) || cantidad <= 0) {
    const error = new Error('La cantidad debe ser un entero mayor que 0');
    error.status = 400;
    throw error;
  }
}

// Registra que cierta cantidad de un recurso quedó dañada o perdida.
// origen 'disponible': el equipo estaba en bodega (se detectó al revisarlo).
// origen 'prestamo': el equipo estaba prestado; además de dañarlo, se marca
// esa cantidad como devuelta dentro del préstamo (ya no sigue "afuera",
// pero tampoco vuelve a disponibles: queda en dañados).
async function reportarIncidencia(reportadoPor, datos) {
  const { recurso_id, prestamo_id, tipo_incidencia, cantidad, origen, descripcion } = {
    prestamo_id: null,
    descripcion: null,
    ...datos,
    recurso_id: Number(datos.recurso_id),
    cantidad: Number(datos.cantidad),
    prestamo_id: datos.prestamo_id ? Number(datos.prestamo_id) : null,
  };

  validarDatosBase({ recurso_id, tipo_incidencia, cantidad, origen });

  if (origen === 'prestamo' && !prestamo_id) {
    const error = new Error('Debes indicar el préstamo del que proviene el equipo dañado');
    error.status = 400;
    throw error;
  }

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    const { rows: recursoRows } = await cliente.query(
      'SELECT * FROM recursos WHERE id = $1 FOR UPDATE',
      [recurso_id]
    );
    const recurso = recursoRows[0];
    if (!recurso) {
      const error = new Error('Recurso no encontrado');
      error.status = 404;
      throw error;
    }

    let prestamoActualizado = null;

    if (origen === 'disponible') {
      if (recurso.disponibles < cantidad) {
        const error = new Error(
          `No hay ${cantidad} unidades disponibles de "${recurso.nombre}" para reportar`
        );
        error.status = 409;
        throw error;
      }

      await cliente.query(
        `UPDATE recursos SET disponibles = disponibles - $1, danados = danados + $1 WHERE id = $2`,
        [cantidad, recurso_id]
      );
    } else {
      const { rows: prestamoRows } = await cliente.query(
        'SELECT * FROM prestamos WHERE id = $1 FOR UPDATE',
        [prestamo_id]
      );
      const prestamo = prestamoRows[0];
      if (!prestamo) {
        const error = new Error('Préstamo no encontrado');
        error.status = 404;
        throw error;
      }

      const { rows: detalleRows } = await cliente.query(
        `SELECT * FROM detalle_prestamos WHERE prestamo_id = $1 AND recurso_id = $2 FOR UPDATE`,
        [prestamo_id, recurso_id]
      );
      const detalle = detalleRows[0];
      if (!detalle) {
        const error = new Error('Ese recurso no pertenece a este préstamo');
        error.status = 400;
        throw error;
      }

      const pendiente = detalle.cantidad - detalle.devuelto;
      if (cantidad > pendiente) {
        const error = new Error(
          `No se puede reportar más de lo pendiente en el préstamo: quedan ${pendiente} unidades de "${recurso.nombre}"`
        );
        error.status = 409;
        throw error;
      }

      await cliente.query(
        `UPDATE detalle_prestamos SET devuelto = devuelto + $1
         WHERE prestamo_id = $2 AND recurso_id = $3`,
        [cantidad, prestamo_id, recurso_id]
      );

      await cliente.query(
        `UPDATE recursos SET prestados = prestados - $1, danados = danados + $1 WHERE id = $2`,
        [cantidad, recurso_id]
      );

      const { rows: pendientes } = await cliente.query(
        `SELECT SUM(cantidad - devuelto) AS total_pendiente FROM detalle_prestamos WHERE prestamo_id = $1`,
        [prestamo_id]
      );
      const totalPendiente = Number(pendientes[0].total_pendiente);
      const nuevoEstado = totalPendiente === 0 ? 'Devuelto' : 'Parcialmente devuelto';

      const { rows: prestamoActualizadoRows } = await cliente.query(
        `UPDATE prestamos SET estado = $1 WHERE id = $2 RETURNING *`,
        [nuevoEstado, prestamo_id]
      );
      prestamoActualizado = prestamoActualizadoRows[0];
    }

    const { rows: incidenciaRows } = await cliente.query(
      `INSERT INTO incidencias
         (recurso_id, prestamo_id, tipo_incidencia, origen, cantidad, descripcion, estado, reportado_por)
       VALUES ($1, $2, $3, $4, $5, $6, 'reportado', $7)
       RETURNING *`,
      [recurso_id, prestamo_id, tipo_incidencia, origen, cantidad, descripcion, reportadoPor]
    );
    const incidencia = incidenciaRows[0];

    await cliente.query(
      `INSERT INTO historial (usuario_id, tipo_operacion, recurso_id, cantidad, estado_anterior, estado_posterior)
       VALUES ($1, $2, $3, $4, NULL, 'reportado')`,
      [
        reportadoPor,
        tipo_incidencia === 'dano' ? 'Daño reportado' : 'Pérdida reportada',
        recurso_id,
        cantidad,
      ]
    );

    await cliente.query('COMMIT');
    return { ...incidencia, prestamo: prestamoActualizado };
  } catch (err) {
    await cliente.query('ROLLBACK');
    throw err;
  } finally {
    cliente.release();
  }
}

// Pasa una incidencia recién reportada a "en reparación". Es solo un
// marcador de seguimiento: no mueve cantidades todavía.
async function marcarEnReparacion(id) {
  const { rows } = await pool.query('SELECT * FROM incidencias WHERE id = $1', [id]);
  const incidencia = rows[0];
  if (!incidencia) {
    const error = new Error('Incidencia no encontrada');
    error.status = 404;
    throw error;
  }
  if (incidencia.estado !== 'reportado') {
    const error = new Error('Solo una incidencia recién reportada puede pasar a "en reparación"');
    error.status = 409;
    throw error;
  }

  const actualizado = await pool.query(
    `UPDATE incidencias SET estado = 'en_reparacion' WHERE id = $1 RETURNING *`,
    [id]
  );
  return actualizado.rows[0];
}

// El equipo quedó reparado: regresa esa cantidad a disponibles.
async function marcarReparado(id, resueltoPor) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    const { rows } = await cliente.query('SELECT * FROM incidencias WHERE id = $1 FOR UPDATE', [id]);
    const incidencia = rows[0];
    if (!incidencia) {
      const error = new Error('Incidencia no encontrada');
      error.status = 404;
      throw error;
    }
    if (incidencia.estado === 'reparado' || incidencia.estado === 'dado_de_baja') {
      const error = new Error('Esta incidencia ya fue resuelta');
      error.status = 409;
      throw error;
    }

    await cliente.query(
      `UPDATE recursos SET danados = danados - $1, disponibles = disponibles + $1 WHERE id = $2`,
      [incidencia.cantidad, incidencia.recurso_id]
    );

    const actualizado = await cliente.query(
      `UPDATE incidencias
       SET estado = 'reparado', resuelto_por = $1, fecha_resolucion = NOW()
       WHERE id = $2 RETURNING *`,
      [resueltoPor, id]
    );

    await cliente.query(
      `INSERT INTO historial (usuario_id, tipo_operacion, recurso_id, cantidad, estado_anterior, estado_posterior)
       VALUES ($1, 'Reparación completada', $2, $3, $4, 'reparado')`,
      [resueltoPor, incidencia.recurso_id, incidencia.cantidad, incidencia.estado]
    );

    await cliente.query('COMMIT');
    return actualizado.rows[0];
  } catch (err) {
    await cliente.query('ROLLBACK');
    throw err;
  } finally {
    cliente.release();
  }
}

// El equipo no se puede reparar: sale del inventario para siempre.
// Baja tanto "dañados" como "total", así el total real de la empresa
// refleja lo que de verdad existe y se puede rentar.
async function darDeBaja(id, resueltoPor) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    const { rows } = await cliente.query('SELECT * FROM incidencias WHERE id = $1 FOR UPDATE', [id]);
    const incidencia = rows[0];
    if (!incidencia) {
      const error = new Error('Incidencia no encontrada');
      error.status = 404;
      throw error;
    }
    if (incidencia.estado === 'reparado' || incidencia.estado === 'dado_de_baja') {
      const error = new Error('Esta incidencia ya fue resuelta');
      error.status = 409;
      throw error;
    }

    await cliente.query(
      `UPDATE recursos SET danados = danados - $1, total = total - $1 WHERE id = $2`,
      [incidencia.cantidad, incidencia.recurso_id]
    );

    const actualizado = await cliente.query(
      `UPDATE incidencias
       SET estado = 'dado_de_baja', resuelto_por = $1, fecha_resolucion = NOW()
       WHERE id = $2 RETURNING *`,
      [resueltoPor, id]
    );

    await cliente.query(
      `INSERT INTO historial (usuario_id, tipo_operacion, recurso_id, cantidad, estado_anterior, estado_posterior)
       VALUES ($1, 'Equipo dado de baja', $2, $3, $4, 'dado_de_baja')`,
      [resueltoPor, incidencia.recurso_id, incidencia.cantidad, incidencia.estado]
    );

    await cliente.query('COMMIT');
    return actualizado.rows[0];
  } catch (err) {
    await cliente.query('ROLLBACK');
    throw err;
  } finally {
    cliente.release();
  }
}

async function listarIncidencias(filtros = {}) {
  const condiciones = [];
  const valores = [];

  if (filtros.estado) {
    valores.push(filtros.estado);
    condiciones.push(`i.estado = $${valores.length}`);
  }
  if (filtros.recurso_id) {
    valores.push(Number(filtros.recurso_id));
    condiciones.push(`i.recurso_id = $${valores.length}`);
  }
  if (filtros.tipo_incidencia) {
    valores.push(filtros.tipo_incidencia);
    condiciones.push(`i.tipo_incidencia = $${valores.length}`);
  }
  if (filtros.desde) {
    valores.push(filtros.desde);
    condiciones.push(`i.fecha_reporte >= $${valores.length}`);
  }
  if (filtros.hasta) {
    valores.push(filtros.hasta);
    condiciones.push(`i.fecha_reporte <= $${valores.length}::date + interval '1 day'`);
  }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT i.*, r.nombre AS recurso_nombre, r.tipo AS recurso_tipo,
            ur.nombre AS reportado_por_nombre, us.nombre AS resuelto_por_nombre
     FROM incidencias i
     JOIN recursos r ON r.id = i.recurso_id
     JOIN usuarios ur ON ur.id = i.reportado_por
     LEFT JOIN usuarios us ON us.id = i.resuelto_por
     ${where}
     ORDER BY i.fecha_reporte DESC`,
    valores
  );
  return rows;
}

module.exports = {
  reportarIncidencia,
  marcarEnReparacion,
  marcarReparado,
  darDeBaja,
  listarIncidencias,
};
