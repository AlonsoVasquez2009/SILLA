// Generación de facturas con el formato legal salvadoreño.
//
// Soporta los dos tipos de documento de un negocio minorista:
//   01 = Factura de Consumidor Final
//   03 = Comprobante de Crédito Fiscal
//
// IMPORTANTE sobre las columnas: esta tabla "facturas" ya traía datos reales
// en producción (nombre_receptor, nit_receptor, nrc_receptor, giro_receptor,
// direccion_receptor, subtotal, iva, total, tipo_dte) de una versión anterior
// del sistema. Este archivo usa esos MISMOS nombres de columna a propósito,
// para no pisar ni romper las facturas que ya se generaron. No se agregan
// columnas nuevas ni se requiere ninguna migración adicional.
//
// AVISO LEGAL: este documento sigue el formato/campos que exige el Código
// Tributario (emisor, receptor, desglose de IVA, monto en letras), pero no
// es un DTE firmado y transmitido al Ministerio de Hacienda, así que no
// reemplaza a un Documento Tributario Electrónico con validez fiscal.
const { pool } = require('../db');
const { enviarCorreoFactura } = require('./emailService');
const { empresa } = require('../config/empresa');
const { montoALetras, formatearNIT } = require('../utils/facturaUtils');

const IVA_TASA = 0.13;

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

// En Consumidor Final el precio ya incluye el 13% de IVA (Ley de IVA Art. 55),
// así que se desglosa "hacia adentro": gravado = total / 1.13.
// En Crédito Fiscal el IVA se factura aparte, sobre el mismo valor gravado.
function calcularDesgloseIVA(montoTotal) {
  const total = Number(montoTotal);
  const gravado = Math.round((total / (1 + IVA_TASA)) * 100) / 100;
  const iva = Math.round((total - gravado) * 100) / 100;
  return { gravado, iva, total };
}

// Mismo esquema de numeración ya usado en producción: PREFIJO-0001-ID (8 dígitos).
function formatearNumero(tipoDte, facturaId) {
  const prefijo = tipoDte === '03' ? 'CCF' : 'CF';
  return `${prefijo}-0001-${String(facturaId).padStart(8, '0')}`;
}

// datosDocumento (opcional, viene del formulario de pago):
//   { tipo_dte: '01' | '03', cliente_nombre, cliente_nit, cliente_nrc, cliente_giro, cliente_direccion }
async function generarYEnviarFactura(pago, datosDocumento = {}) {
  const tipoDte = datosDocumento.tipo_dte === '03' ? '03' : '01';

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
  const { gravado, iva, total } = calcularDesgloseIVA(pago.monto);

  const nombreReceptor = datosDocumento.cliente_nombre || usuario.nombre;
  const nitReceptor = datosDocumento.cliente_nit ? formatearNIT(datosDocumento.cliente_nit) : null;
  const nrcReceptor = datosDocumento.cliente_nrc || null;
  const giroReceptor = datosDocumento.cliente_giro || null;
  const direccionReceptor = datosDocumento.cliente_direccion || null;

  const { rows: facturaRows } = await pool.query(
    `INSERT INTO facturas (
       pago_id, usuario_id, reserva_id, monto,
       tipo_dte, nombre_receptor, nit_receptor, nrc_receptor,
       giro_receptor, direccion_receptor, subtotal, iva, total
     )
     VALUES ($1,$2,$3,$4, $5,$6,$7,$8, $9,$10,$11,$12,$13)
     RETURNING id`,
    [
      pago.id, pago.usuario_id, pago.reserva_id, pago.monto,
      tipoDte, nombreReceptor, nitReceptor, nrcReceptor,
      giroReceptor, direccionReceptor, gravado, iva, total,
    ]
  );
  const facturaId = facturaRows[0].id;
  const numero = formatearNumero(tipoDte, facturaId);
  await pool.query(`UPDATE facturas SET numero = $1 WHERE id = $2`, [numero, facturaId]);

  const documento = {
    tipoDte,
    numero,
    metodo: pago.metodo,
    referencia: pago.referencia,
    fecha: reserva.fecha,
    items,
    gravado,
    iva,
    exento: 0,
    total,
    totalEnLetras: montoALetras(total),
    emisor: empresa,
    receptor: {
      nombre: nombreReceptor,
      nit: nitReceptor,
      nrc: nrcReceptor,
      giro: giroReceptor,
      direccion: direccionReceptor,
      email: usuario.email,
    },
  };

  let enviada = false;
  try {
    await enviarCorreoFactura(usuario.email, usuario.nombre, documento);
    enviada = true;
  } catch (err) {
    console.error('No se pudo enviar la factura por correo:', err.message);
  }

  await pool.query(`UPDATE facturas SET enviada = $1 WHERE id = $2`, [enviada, facturaId]);

  return { numero, tipoDte, enviada, total };
}

module.exports = { generarYEnviarFactura, calcularDesgloseIVA };
