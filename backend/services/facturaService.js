// Facturación SIMULADA: genera un número correlativo y envía el detalle
// por correo cuando un pago queda aprobado. No es un DTE ni tiene validez
// fiscal ante el Ministerio de Hacienda de El Salvador.
const { pool } = require('../db');
const { enviarCorreoFactura } = require('./emailService');

async function obtenerItemsReserva(reservaId) {
  const { rows } = await pool.query(
    `SELECT rec.nombre, dr.cantidad
     FROM detalle_reservas dr
     JOIN recursos rec ON rec.id = dr.recurso_id
     WHERE dr.reserva_id = $1`,
    [reservaId]
  );
  return rows;
}

async function generarYEnviarFactura(pago) {
  const { rows: usuarioRows } = await pool.query(
    `SELECT nombre, email FROM usuarios WHERE id = $1`,
    [pago.usuario_id]
  );
  const usuario = usuarioRows[0];

  const { rows: reservaRows } = await pool.query(
    `SELECT fecha, hora_inicio, hora_fin FROM reservas WHERE id = $1`,
    [pago.reserva_id]
  );
  const reserva = reservaRows[0];

  const items = await obtenerItemsReserva(pago.reserva_id);

  const { rows: facturaRows } = await pool.query(
    `INSERT INTO facturas (pago_id, usuario_id, reserva_id, monto)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [pago.id, pago.usuario_id, pago.reserva_id, pago.monto]
  );
  const facturaId = facturaRows[0].id;
  const numero = `FAC-${String(facturaId).padStart(6, '0')}`;
  await pool.query(`UPDATE facturas SET numero = $1 WHERE id = $2`, [numero, facturaId]);

  let enviada = false;
  try {
    await enviarCorreoFactura(usuario.email, usuario.nombre, {
      numero,
      monto: pago.monto,
      metodo: pago.metodo,
      referencia: pago.referencia,
      fecha: reserva.fecha,
      items,
    });
    enviada = true;
  } catch (err) {
    console.error('No se pudo enviar la factura por correo:', err.message);
  }

  await pool.query(`UPDATE facturas SET enviada = $1 WHERE id = $2`, [enviada, facturaId]);

  return { numero, enviada };
}

module.exports = { generarYEnviarFactura };
