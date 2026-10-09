// Pasarela de pago SIMULADA: no se conecta a ningún banco real.
// Sirve para completar el flujo de cobro de una reserva en el sistema.
const crypto = require('crypto');
const { pool } = require('../db');

// Precios simulados por recurso (unidad), usados solo para calcular el monto.
const PRECIO_POR_TIPO = { mesa: 5, silla: 1 };

function validarTarjeta({ numero_tarjeta, vencimiento, cvv }) {
  const numero = (numero_tarjeta || '').replace(/\s+/g, '');
  if (!/^\d{13,19}$/.test(numero)) {
    const error = new Error('Número de tarjeta inválido');
    error.status = 400;
    throw error;
  }
  if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(vencimiento || '')) {
    const error = new Error('Vencimiento inválido (formato MM/AA)');
    error.status = 400;
    throw error;
  }
  if (!/^\d{3,4}$/.test(cvv || '')) {
    const error = new Error('CVV inválido');
    error.status = 400;
    throw error;
  }
  return numero;
}

// Decide si el pago simulado se aprueba o se rechaza.
// Regla de prueba: una tarjeta que termina en "0000" simula un rechazo
// del banco, para poder probar ambos caminos sin un banco real.
function simularAprobacion(metodo, numeroTarjeta) {
  if (metodo === 'tarjeta' && numeroTarjeta.endsWith('0000')) {
    return false;
  }
  return true;
}

async function calcularMonto(reservaId) {
  const { rows } = await pool.query(
    `SELECT rec.tipo, dr.cantidad
     FROM detalle_reservas dr
     JOIN recursos rec ON rec.id = dr.recurso_id
     WHERE dr.reserva_id = $1`,
    [reservaId]
  );
  return rows.reduce((total, fila) => total + fila.cantidad * (PRECIO_POR_TIPO[fila.tipo] || 0), 0);
}

// datos: { reserva_id, metodo: 'tarjeta' | 'transferencia', numero_tarjeta?, vencimiento?, cvv? }
async function simularPago(usuario, datos) {
  const { reserva_id, metodo } = datos;

  if (!reserva_id) {
    const error = new Error('Debes indicar la reserva a pagar');
    error.status = 400;
    throw error;
  }
  if (!['tarjeta', 'transferencia'].includes(metodo)) {
    const error = new Error('Método de pago inválido');
    error.status = 400;
    throw error;
  }

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

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
    if (usuario.rol !== 'admin' && reserva.usuario_id !== usuario.id) {
      const error = new Error('No puedes pagar la reserva de otro usuario');
      error.status = 403;
      throw error;
    }
    if (reserva.estado !== 'Confirmada') {
      const error = new Error(`La reserva está en estado "${reserva.estado}", no se puede pagar`);
      error.status = 409;
      throw error;
    }
    if (reserva.pagado) {
      const error = new Error('Esta reserva ya fue pagada');
      error.status = 409;
      throw error;
    }

    let numeroTarjeta = null;
    if (metodo === 'tarjeta') {
      numeroTarjeta = validarTarjeta(datos);
    }

    const monto = await calcularMonto(reserva_id);
    const aprobado = simularAprobacion(metodo, numeroTarjeta || '');
    const estado = aprobado ? 'aprobado' : 'rechazado';
    const referencia = `SIM-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

    const { rows: pagoRows } = await cliente.query(
      `INSERT INTO pagos (reserva_id, usuario_id, monto, metodo, estado, referencia)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, reserva_id, usuario_id, monto, metodo, estado, referencia, creado_en`,
      [reserva_id, usuario.id, monto, metodo, estado, referencia]
    );
    const pago = pagoRows[0];

    if (aprobado) {
      await cliente.query(`UPDATE reservas SET pagado = true WHERE id = $1`, [reserva_id]);
    }

    await cliente.query('COMMIT');
    return pago;
  } catch (err) {
    await cliente.query('ROLLBACK');
    throw err;
  } finally {
    cliente.release();
  }
}

// Envoltorio: deja el pago registrado (aprobado o rechazado) y, si fue
// rechazado, lo informa como error para que el frontend lo muestre así.
async function procesarPago(usuario, datos) {
  const pago = await simularPago(usuario, datos);
  if (pago.estado === 'rechazado') {
    const error = new Error('El pago fue rechazado (simulado). Intenta con otro método o tarjeta.');
    error.status = 402;
    error.pago = pago;
    throw error;
  }
  return pago;
}

async function listarPagos(usuario) {
  const esAdmin = usuario.rol === 'admin';
  const condicion = esAdmin ? '' : 'WHERE p.usuario_id = $1';
  const parametros = esAdmin ? [] : [usuario.id];

  const { rows } = await pool.query(
    `SELECT p.id, p.reserva_id, p.usuario_id, u.nombre AS usuario_nombre, p.monto,
            p.metodo, p.estado, p.referencia, p.creado_en
     FROM pagos p
     JOIN usuarios u ON u.id = p.usuario_id
     ${condicion}
     ORDER BY p.creado_en DESC`,
    parametros
  );
  return rows;
}

module.exports = { procesarPago, listarPagos };
