// Generación de comprobante de pago con formato basado en la normativa
// salvadoreña (Factura de Consumidor Final / Comprobante de Crédito Fiscal).
//
// IMPORTANTE: este comprobante NO es un DTE transmitido al Ministerio de
// Hacienda. Para que tenga plena validez fiscal como Documento Tributario
// Electrónico se debe firmar con el certificado digital del contribuyente
// y transmitirlo a la API de recepción de DTE del MH. Esta función deja
// la estructura y el cálculo listos para ese paso.
const { pool } = require('../db');
const { enviarCorreoFactura } = require('./emailService');

const IVA_TASA = 0.13; // 13% IVA, Art. 54 Ley de IVA

async function obtenerItemsReserva(reservaId) {
  // La tabla detalle_reservas no guarda precio por ítem (nunca se agregó esa
  // columna), así que aquí solo traemos nombre y cantidad; el precio unitario
  // se calcula después, repartiendo el total pagado entre las unidades.
  const { rows } = await pool.query(
    `SELECT rec.id AS recurso_id, rec.nombre, dr.cantidad
     FROM detalle_reservas dr
     JOIN recursos rec ON rec.id = dr.recurso_id
     WHERE dr.reserva_id = $1`,
    [reservaId]
  );
  return rows;
}

function calcularMontos(montoConIva) {
  // Si pago.monto ya incluye IVA (precio final al cliente):
  const total = Number(montoConIva);
  const subtotal = Number((total / (1 + IVA_TASA)).toFixed(2));
  const iva = Number((total - subtotal).toFixed(2));
  return { subtotal, iva, total };
}

async function generarYEnviarFactura(pago, datosReceptor = {}) {
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

  const itemsBase = await obtenerItemsReserva(pago.reserva_id);
  const { subtotal, iva, total } = calcularMontos(pago.monto);

  // No hay precio por ítem guardado en la base de datos, así que repartimos
  // el subtotal entre el total de unidades para obtener un precio unitario
  // uniforme (el total de la factura siempre cuadra con lo realmente pagado).
  const totalUnidades = itemsBase.reduce((acc, i) => acc + i.cantidad, 0) || 1;
  const precioUnitarioPromedio = Number((subtotal / totalUnidades).toFixed(2));
  const items = itemsBase.map((i) => ({
    ...i,
    precio_unitario: precioUnitarioPromedio,
  }));

  // El tipo de comprobante lo elige el usuario en el formulario de pago:
  // '03' Crédito Fiscal (requiere NIT/NRC) o '01' Consumidor Final (por defecto).
  const tipoDte = datosReceptor.tipo_dte === '03' ? '03' : '01';
  const nombreReceptor = datosReceptor.nombre_receptor || usuario.nombre;

  const { rows: facturaRows } = await pool.query(
    `INSERT INTO facturas
       (pago_id, usuario_id, reserva_id, monto, tipo_dte,
        nombre_receptor, nit_receptor, nrc_receptor, giro_receptor,
        direccion_receptor, subtotal, iva, total)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING id`,
    [
      pago.id, pago.usuario_id, pago.reserva_id, pago.monto, tipoDte,
      nombreReceptor, datosReceptor.nit_receptor || null,
      datosReceptor.nrc_receptor || null, datosReceptor.giro_receptor || null,
      datosReceptor.direccion_receptor || null, subtotal, iva, total,
    ]
  );
  const facturaId = facturaRows[0].id;

  const prefijo = tipoDte === '03' ? 'CCF' : 'FCF';
  const numero = `${prefijo}-${process.env.EMISOR_COD_ESTABLE || '0001'}-${String(facturaId).padStart(8, '0')}`;
  await pool.query(`UPDATE facturas SET numero = $1 WHERE id = $2`, [numero, facturaId]);

  let enviada = false;
  try {
    await enviarCorreoFactura(usuario.email, usuario.nombre, {
      numero,
      tipoDte,
      nombreReceptor,
      nitReceptor: datosReceptor.nit_receptor,
      nrcReceptor: datosReceptor.nrc_receptor,
      giroReceptor: datosReceptor.giro_receptor,
      direccionReceptor: datosReceptor.direccion_receptor,
      subtotal, iva, total,
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

  return { numero, tipoDte, enviada };
}

module.exports = { generarYEnviarFactura };
