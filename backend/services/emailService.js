// Envío de correos vía API HTTP (Resend) en lugar de SMTP.
// Render bloquea los puertos SMTP salientes (25/465/587), así que usar
// nodemailer con un host SMTP tradicional falla en producción aunque
// funcione en local. Resend expone una API REST sobre HTTPS (puerto 443),
// el mismo puerto que ya usa toda la app para salir a internet, por lo
// que nunca choca con ese bloqueo.
//
// Variables de entorno necesarias (.env / Render → Environment):
//   RESEND_API_KEY   -> API key de https://resend.com (gratis hasta 3,000 correos/mes)
//   EMAIL_FROM       -> remitente verificado en Resend, ej: "RENTSERES <facturas@tudominio.com>"
//                        (mientras no verifiques un dominio propio, Resend solo permite
//                         enviar con onboarding@resend.dev como remitente)

const RESEND_URL = 'https://api.resend.com/emails';

function hayConfiguracionAPI() {
  return Boolean(process.env.RESEND_API_KEY);
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

  if (!hayConfiguracionAPI()) {
    console.log('--------------------------------------------------');
    console.log('[EMAIL] No hay RESEND_API_KEY configurada (ver backend/.env).');
    console.log(`[EMAIL] Factura simulada ${factura.numero} para ${destino} por $${factura.monto}`);
    console.log('--------------------------------------------------');
    return { simulado: true };
  }

  const remitente = process.env.EMAIL_FROM || 'onboarding@resend.dev';

  const respuesta = await fetch(RESEND_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: remitente,
      to: [destino],
      subject: asunto,
      text: textoPlano,
      html,
    }),
  });

  if (!respuesta.ok) {
    const detalle = await respuesta.text().catch(() => '');
    throw new Error(`Resend respondió ${respuesta.status}: ${detalle}`);
  }

  const data = await respuesta.json();
  console.log(`[EMAIL] Factura ${factura.numero} enviada correctamente a ${destino} (id: ${data.id})`);
  return { simulado: false, id: data.id };
}

module.exports = { enviarCorreoFactura };
