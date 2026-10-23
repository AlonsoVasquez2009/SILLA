// Generación de facturas con el formato legal salvadoreño.
//
// Soporta los dos tipos de documento que necesita un negocio minorista:
//   01 = Factura de Consumidor Final
//   03 = Comprobante de Crédito Fiscal
//
// AVISO IMPORTANTE: este módulo genera el MODELO/FORMATO correcto (los
// campos y el desglose de IVA que exige la ley), pero el documento sigue
// siendo de control interno: no se firma con certificado digital ni se
// transmite a la API del Ministerio de Hacienda, así que no es un DTE
// (Documento Tributario Electrónico) con validez fiscal. Para que lo sea
// de verdad hace falta integrarse con un proveedor autorizado o con la API
// de Hacienda (ambos requieren trámite y certificado propios del negocio).
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

async function siguienteCorrelativo(tipoDte, cliente) {
  const secuencia = tipoDte === '03' ? 'facturas_ccf_correlativo_seq' : 'facturas_cf_correlativo_seq';
  const { rows } = await cliente.query(`SELECT nextval('${secuencia}') AS n`);
  return Number(rows[0].n);
}

function formatearNumero(tipoDte, serie, correlativo) {
  const prefijo = tipoDte === '03' ? 'CCF' : 'CF';
  return `${prefijo}-${serie}-${String(correlativo).padStart(6, '0')}`;
}

// datosDocumento (opcional, viene del formulario de pago):
//   {
//     tipo_dte: '01' | '03',
//     condicion_operacion: 'CONTADO' | 'CREDITO',
//     cliente_nombre, cliente_nit, cliente_dui, cliente_nrc,
//     cliente_giro, cliente_direccion
//   }
async function generarYEnviarFactura(pago, datosDocumento = {}) {
  const tipoDte = datosDocumento.tipo_dte === '03' ? '03' : '01';
  const condicionOperacion = datosDocumento.condicion_operacion === 'CREDITO' ? 'CREDITO' : 'CONTADO';

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
  const totalEnLetras = montoALetras(total);

  const serie = 'A';

  const cliente = await pool.connect();
  let facturaId;
  let correlativo;
  let numero;
  try {
    await cliente.query('BEGIN');

    correlativo = await siguienteCorrelativo(tipoDte, cliente);
    numero = formatearNumero(tipoDte, serie, correlativo);

    const { rows: facturaRows } = await cliente.query(
      `INSERT INTO facturas (
         pago_id, usuario_id, reserva_id, monto,
         tipo_dte, serie, correlativo, condicion_operacion,
         cliente_nombre, cliente_nit, cliente_dui, cliente_nrc,
         cliente_giro, cliente_direccion,
         monto_gravado, monto_iva, monto_exento, monto_total, total_en_letras,
         numero
       )
       VALUES ($1,$2,$3,$4, $5,$6,$7,$8, $9,$10,$11,$12, $13,$14, $15,$16,0,$17,$18, $19)
       RETURNING id`,
      [
        pago.id, pago.usuario_id, pago.reserva_id, pago.monto,
        tipoDte, serie, correlativo, condicionOperacion,
        datosDocumento.cliente_nombre || usuario.nombre,
        datosDocumento.cliente_nit ? formatearNIT(datosDocumento.cliente_nit) : null,
        datosDocumento.cliente_dui || null,
        datosDocumento.cliente_nrc || null,
        datosDocumento.cliente_giro || null,
        datosDocumento.cliente_direccion || null,
        gravado, iva, total, totalEnLetras,
        numero,
      ]
    );
    facturaId = facturaRows[0].id;

    await cliente.query('COMMIT');
  } catch (err) {
    await cliente.query('ROLLBACK');
    throw err;
  } finally {
    cliente.release();
  }

  const documento = {
    tipoDte,
    numero,
    serie,
    correlativo,
    condicionOperacion,
    metodo: pago.metodo,
    referencia: pago.referencia,
    fecha: reserva.fecha,
    items,
    gravado,
    iva,
    exento: 0,
    total,
    totalEnLetras,
    emisor: empresa,
    receptor: {
      nombre: datosDocumento.cliente_nombre || usuario.nombre,
      nit: datosDocumento.cliente_nit ? formatearNIT(datosDocumento.cliente_nit) : null,
      dui: datosDocumento.cliente_dui || null,
      nrc: datosDocumento.cliente_nrc || null,
      giro: datosDocumento.cliente_giro || null,
      direccion: datosDocumento.cliente_direccion || null,
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
