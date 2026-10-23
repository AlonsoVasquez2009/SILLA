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
//
// Esta versión envía el modelo real de factura salvadoreña:
//   01 Factura de Consumidor Final  -> plantillaConsumidorFinal()
//   03 Comprobante de Crédito Fiscal -> plantillaCreditoFiscal()
// Ver backend/services/facturaService.js para el AVISO sobre validez fiscal.

const RESEND_URL = 'https://api.resend.com/emails';

function hayConfiguracionAPI() {
  return Boolean(process.env.RESEND_API_KEY);
}

function money(n) {
  return `$${Number(n).toFixed(2)}`;
}

function filasItems(items) {
  return items
    .map(
      (i) => `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;">${i.cantidad}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;">${i.nombre}</td>
      </tr>`
    )
    .join('');
}

function bloqueEmisor(emisor) {
  return `
    <table style="width:100%;font-size:12.5px;color:#333;">
      <tr><td><strong>${emisor.nombre}</strong>${emisor.nombreComercial ? ` (${emisor.nombreComercial})` : ''}</td></tr>
      <tr><td>NIT: ${emisor.nit} &nbsp;|&nbsp; NRC: ${emisor.nrc}</td></tr>
      <tr><td>Giro: ${emisor.giro}</td></tr>
      <tr><td>Dirección: ${emisor.direccion}, ${emisor.municipio}, ${emisor.departamento}</td></tr>
      ${emisor.telefono ? `<tr><td>Teléfono: ${emisor.telefono}</td></tr>` : ''}
    </table>`;
}

function bloqueResumenIVA(doc) {
  return `
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:10px;">
      <tr><td style="padding:3px 0;">Ventas exentas</td><td style="text-align:right;">${money(doc.exento)}</td></tr>
      <tr><td style="padding:3px 0;">Ventas gravadas (sub-total)</td><td style="text-align:right;">${money(doc.gravado)}</td></tr>
      <tr><td style="padding:3px 0;">IVA (13%)</td><td style="text-align:right;">${money(doc.iva)}</td></tr>
      <tr style="border-top:1px solid #ccc;"><td style="padding:6px 0;"><strong>TOTAL A PAGAR</strong></td><td style="text-align:right;"><strong>${money(doc.total)}</strong></td></tr>
    </table>
    <p style="font-size:12px;color:#555;margin-top:6px;"><em>Son: ${doc.totalEnLetras}</em></p>`;
}

function piePago(doc) {
  return `
    <table style="width:100%;font-size:12.5px;color:#333;margin-top:10px;">
      <tr><td>Condición de la operación</td><td style="text-align:right;">${doc.condicionOperacion === 'CREDITO' ? 'Crédito' : 'Contado'}</td></tr>
      <tr><td>Forma de pago</td><td style="text-align:right;">${doc.metodo === 'tarjeta' ? 'Tarjeta' : 'Transferencia'}</td></tr>
      <tr><td>Referencia de pago</td><td style="text-align:right;">${doc.referencia}</td></tr>
      <tr><td>Fecha del servicio</td><td style="text-align:right;">${doc.fecha}</td></tr>
    </table>`;
}

function avisoLegal() {
  return `
    <p style="font-size:11px;color:#999;margin-top:20px;border-top:1px solid #eee;padding-top:10px;">
      Este documento refleja el formato exigido por el Código Tributario de El Salvador
      (datos del emisor y del receptor, desglose de IVA y monto en letras), pero es de
      control interno: no ha sido firmado con un certificado digital ni transmitido al
      Ministerio de Hacienda como Documento Tributario Electrónico (DTE), por lo que
      no sustituye a un DTE autorizado.
    </p>`;
}

function plantillaConsumidorFinal(nombre, doc) {
  const asunto = `Factura de Consumidor Final ${doc.numero} — ${doc.emisor.nombreComercial}`;
  const textoPlano = `Hola ${nombre},\n\nFactura de Consumidor Final ${doc.numero} por ${money(doc.total)} (IVA incluido). Referencia de pago: ${doc.referencia}.`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;">
      <div style="text-align:center;border-bottom:2px solid #7a4a2a;padding-bottom:10px;margin-bottom:14px;">
        <h2 style="color:#7a4a2a;margin:0;">FACTURA DE CONSUMIDOR FINAL</h2>
        <p style="margin:2px 0;color:#555;">Documento N°: <strong>${doc.numero}</strong> &nbsp;|&nbsp; Serie: ${doc.serie}</p>
      </div>
      <h4 style="margin-bottom:4px;">Emisor</h4>
      ${bloqueEmisor(doc.emisor)}
      <h4 style="margin:16px 0 4px;">Cliente</h4>
      <p style="font-size:12.5px;margin:0;">${doc.receptor.nombre}${doc.receptor.email ? ` — ${doc.receptor.email}` : ''}</p>
      <h4 style="margin:16px 0 4px;">Detalle</h4>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:#f6f1ec;">
            <th style="text-align:left;padding:6px 8px;">Cant.</th>
            <th style="text-align:left;padding:6px 8px;">Descripción</th>
          </tr>
        </thead>
        <tbody>${filasItems(doc.items)}</tbody>
      </table>
      ${bloqueResumenIVA(doc)}
      ${piePago(doc)}
      ${avisoLegal()}
    </div>`;
  return { asunto, textoPlano, html };
}

function plantillaCreditoFiscal(nombre, doc) {
  const asunto = `Comprobante de Crédito Fiscal ${doc.numero} — ${doc.emisor.nombreComercial}`;
  const textoPlano = `Hola ${nombre},\n\nComprobante de Crédito Fiscal ${doc.numero}. Sub-total gravado: ${money(doc.gravado)}, IVA 13%: ${money(doc.iva)}, Total: ${money(doc.total)}.`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;">
      <div style="text-align:center;border-bottom:2px solid #7a4a2a;padding-bottom:10px;margin-bottom:14px;">
        <h2 style="color:#7a4a2a;margin:0;">COMPROBANTE DE CRÉDITO FISCAL</h2>
        <p style="margin:2px 0;color:#555;">Documento N°: <strong>${doc.numero}</strong> &nbsp;|&nbsp; Serie: ${doc.serie}</p>
      </div>
      <div style="display:flex;gap:16px;">
        <div style="flex:1;">
          <h4 style="margin-bottom:4px;">Emisor</h4>
          ${bloqueEmisor(doc.emisor)}
        </div>
      </div>
      <h4 style="margin:16px 0 4px;">Receptor</h4>
      <table style="width:100%;font-size:12.5px;color:#333;">
        <tr><td><strong>${doc.receptor.nombre}</strong></td></tr>
        <tr><td>NIT: ${doc.receptor.nit || 'N/D'} &nbsp;|&nbsp; NRC: ${doc.receptor.nrc || 'N/D'}</td></tr>
        <tr><td>Giro: ${doc.receptor.giro || 'N/D'}</td></tr>
        <tr><td>Dirección: ${doc.receptor.direccion || 'N/D'}</td></tr>
      </table>
      <h4 style="margin:16px 0 4px;">Detalle</h4>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:#f6f1ec;">
            <th style="text-align:left;padding:6px 8px;">Cant.</th>
            <th style="text-align:left;padding:6px 8px;">Descripción</th>
          </tr>
        </thead>
        <tbody>${filasItems(doc.items)}</tbody>
      </table>
      ${bloqueResumenIVA(doc)}
      ${piePago(doc)}
      ${avisoLegal()}
    </div>`;
  return { asunto, textoPlano, html };
}

async function enviarCorreoFactura(destino, nombre, doc) {
  const { asunto, textoPlano, html } =
    doc.tipoDte === '03' ? plantillaCreditoFiscal(nombre, doc) : plantillaConsumidorFinal(nombre, doc);

  if (!hayConfiguracionAPI()) {
    console.log('--------------------------------------------------');
    console.log('[EMAIL] No hay RESEND_API_KEY configurada (ver backend/.env).');
    console.log(`[EMAIL] ${asunto} para ${destino} por ${money(doc.total)}`);
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
  console.log(`[EMAIL] ${doc.numero} enviada correctamente a ${destino} (id: ${data.id})`);
  return { simulado: false, id: data.id };
}

module.exports = { enviarCorreoFactura };
