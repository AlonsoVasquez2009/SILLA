// Envío de correos. Si no hay credenciales SMTP configuradas en .env,
// no revienta: muestra el detalle en la consola para poder probar en local.
const nodemailer = require('nodemailer');

function hayConfiguracionSMTP() {
  return Boolean(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS);
}

let transportador = null;
function obtenerTransportador() {
  if (!hayConfiguracionSMTP()) return null;
  if (!transportador) {
    transportador = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT) || 587,
      secure: Number(process.env.EMAIL_PORT) === 465,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }
  return transportador;
}

async function enviarCorreoFactura(destino, nombre, factura) {
  const filas = factura.items
    .map((i) => `<tr><td>${i.nombre}</td><td style="text-align:center;">${i.cantidad}</td></tr>`)
    .join('');

  const asunto = `Factura ${factura.numero} — RENTSERES`;
  const textoPlano = `Hola ${nombre},\n\nTu pago fue aprobado. Factura simulada ${factura.numero} por $${Number(factura.monto).toFixed(2)}, método ${factura.metodo}, referencia ${factura.referencia}.\n\nEsta factura es simulada y no constituye un documento tributario válido ante el Ministerio de Hacienda.`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #7a4a2a;">RENTSERES</h2>
      <p>Hola ${nombre},</p>
      <p>Tu pago fue aprobado. Aquí tienes el detalle:</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
        <tr><td><strong>Factura</strong></td><td>${factura.numero}</td></tr>
        <tr><td><strong>Fecha reservada</strong></td><td>${factura.fecha}</td></tr>
        <tr><td><strong>Método de pago</strong></td><td>${factura.metodo}</td></tr>
        <tr><td><strong>Referencia</strong></td><td>${factura.referencia}</td></tr>
        <tr><td><strong>Total</strong></td><td>$${Number(factura.monto).toFixed(2)}</td></tr>
      </table>
      <table style="width: 100%; border-collapse: collapse; border-top: 1px solid #ddd; font-size: 14px;">
        <thead><tr><th style="text-align:left;">Recurso</th><th>Cantidad</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
      <p style="font-size: 12px; color: #999; margin-top: 24px;">
        Esta es una factura simulada generada por el sistema; no es un documento tributario
        válido ante el Ministerio de Hacienda de El Salvador.
      </p>
    </div>`;

  const transporte = obtenerTransportador();

  if (!transporte) {
    console.log('--------------------------------------------------');
    console.log('[EMAIL] No hay SMTP configurado (ver backend/.env).');
    console.log(`[EMAIL] Factura simulada ${factura.numero} para ${destino} por $${factura.monto}`);
    console.log('--------------------------------------------------');
    return { simulado: true };
  }

  await transporte.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to: destino,
    subject: asunto,
    text: textoPlano,
    html,
  });
  console.log(`[EMAIL] Factura ${factura.numero} enviada correctamente a ${destino}`);
  return { simulado: false };
}

module.exports = { enviarCorreoFactura };
