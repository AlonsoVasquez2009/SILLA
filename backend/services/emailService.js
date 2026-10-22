// Envío de correos vía API HTTP (SendGrid).
const SENDGRID_URL = 'https://api.sendgrid.com/v3/mail/send';

function hayConfiguracionAPI() {
  return Boolean(process.env.SENDGRID_API_KEY);
}

// Ícono propio simple (silueta de mesa + silla) en SVG, embebido como data URI
// para que se vea en el correo sin depender de un archivo externo.
const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <rect width="48" height="48" rx="10" fill="#7a4a2a"/>
  <rect x="9" y="14" width="22" height="4" rx="1" fill="#fff"/>
  <rect x="11" y="18" width="3" height="11" fill="#fff"/>
  <rect x="27" y="18" width="3" height="11" fill="#fff"/>
  <path d="M34 20 h7 v3 h-2 v9 h-3 v-9 h-2 z" fill="#fff"/>
  <rect x="35" y="14" width="5" height="6" rx="1" fill="#fff"/>
</svg>`;
const LOGO_DATA_URI = `data:image/svg+xml;base64,${Buffer.from(LOGO_SVG).toString('base64')}`;

function filaOpcional(etiqueta, valor) {
  return valor ? `<tr><td style="padding:1px 0;"><strong>${etiqueta}:</strong> ${valor}</td></tr>` : '';
}

async function enviarCorreoFactura(destino, nombre, f) {
  const esCreditoFiscal = f.tipoDte === '03';
  const tituloDoc = esCreditoFiscal ? 'COMPROBANTE DE CRÉDITO FISCAL' : 'FACTURA DE CONSUMIDOR FINAL';

  const emisor = {
    nombre: process.env.EMISOR_NOMBRE || 'RENTSERES',
    nit: process.env.EMISOR_NIT || '',
    nrc: process.env.EMISOR_NRC || '',
    giro: process.env.EMISOR_GIRO || '',
    direccion: process.env.EMISOR_DIRECCION || '',
    correo: process.env.EMISOR_CORREO || process.env.EMAIL_FROM || '',
  };

  const fechaGeneracion = new Date();
  const fechaGeneracionTexto = fechaGeneracion.toISOString().slice(0, 19).replace('T', ' ');

  const filasItems = f.items
    .map((i) => {
      const precio = Number(i.precio_unitario || 0);
      const totalLinea = (precio * i.cantidad).toFixed(2);
      const codigo = `REC-${String(i.recurso_id ?? '').padStart(4, '0')}`;
      return `<tr>
        <td style="padding:4px; border:1px dashed #bbb;">${codigo}</td>
        <td style="padding:4px; border:1px dashed #bbb; text-align:center;">${i.cantidad}</td>
        <td style="padding:4px; border:1px dashed #bbb; text-align:center;">Unidad</td>
        <td style="padding:4px; border:1px dashed #bbb;">${i.nombre}</td>
        <td style="padding:4px; border:1px dashed #bbb; text-align:right;">$${precio.toFixed(2)}</td>
        <td style="padding:4px; border:1px dashed #bbb; text-align:right;">$0.00</td>
        <td style="padding:4px; border:1px dashed #bbb; text-align:right;">$${totalLinea}</td>
      </tr>`;
    })
    .join('');

  const asunto = `[SIMULADO] ${tituloDoc} ${f.numero} — ${emisor.nombre}`;

  const textoPlano = `*** DOCUMENTO SIMULADO — NO ES UN DTE VÁLIDO ANTE EL MINISTERIO DE HACIENDA ***

Hola ${nombre},

${tituloDoc} (simulado)
No: ${f.numero}
Emisor: ${emisor.nombre} | NIT: ${emisor.nit} | NRC: ${emisor.nrc}
Receptor: ${f.nombreReceptor}${f.nitReceptor ? ` | NIT: ${f.nitReceptor} | NRC: ${f.nrcReceptor || '-'}` : ''}

Suma Total de Operaciones: $${f.subtotal.toFixed(2)}
IVA (13%): $${f.iva.toFixed(2)}
TOTAL A PAGAR: $${f.total.toFixed(2)}

Método de pago: ${f.metodo} | Referencia: ${f.referencia}

Código de Generación: No aplica (documento no transmitido al MH)
Sello de Recepción: No aplica (documento no transmitido al MH)

Este comprobante es una SIMULACIÓN generada solo por este sistema interno.
No ha sido firmado ni transmitido al Ministerio de Hacienda y no tiene
validez como Documento Tributario Electrónico (DTE).`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 680px; margin: 0 auto; border: 1px solid #ccc; padding: 16px;">

      <div style="background:#fff3cd; border:1px solid #ffe08a; color:#7a5b00; padding:10px 14px; border-radius:6px; font-size:13px; text-align:center; margin-bottom:16px;">
        ⚠️ <strong>DOCUMENTO SIMULADO</strong> — No es un DTE válido ante el Ministerio de Hacienda. Generado únicamente por el sistema interno de ${emisor.nombre}.
      </div>

      <table style="width:100%;">
        <tr>
          <td style="vertical-align:top; width:70px;">
            <img src="${LOGO_DATA_URI}" width="48" height="48" alt="${emisor.nombre}" style="display:block;" />
          </td>
          <td style="vertical-align:top;">
            <h2 style="margin:0; color:#7a4a2a;">${emisor.nombre}</h2>
            <p style="margin:2px 0; font-size:12px; color:#555;">Documento Tributario Electrónico (simulado)</p>
          </td>
          <td style="text-align:right; vertical-align:top;">
            <div style="border:2px solid #7a4a2a; padding:8px; display:inline-block; font-size:13px;">
              <strong>${tituloDoc}</strong><br>
              No. ${f.numero}<br>
              Fecha de generación: ${fechaGeneracionTexto}
            </div>
          </td>
        </tr>
      </table>

      <table style="width:100%; font-size:12px; margin-top:14px; border-collapse:collapse;">
        <tr>
          <td style="width:50%; vertical-align:top; border:1px dashed #7a4a2a; padding:8px;">
            <strong style="display:block; margin-bottom:4px;">EMISOR</strong>
            <table>
              <tr><td><strong>Nombre o Razón Social:</strong> ${emisor.nombre}</td></tr>
              <tr><td><strong>NIT:</strong> ${emisor.nit}</td></tr>
              <tr><td><strong>NRC:</strong> ${emisor.nrc}</td></tr>
              <tr><td><strong>Actividad Económica:</strong> ${emisor.giro}</td></tr>
              <tr><td><strong>Dirección:</strong> ${emisor.direccion}</td></tr>
              <tr><td><strong>Correo Electrónico:</strong> ${emisor.correo}</td></tr>
            </table>
          </td>
          <td style="width:50%; vertical-align:top; border:1px dashed #7a4a2a; padding:8px;">
            <strong style="display:block; margin-bottom:4px;">RECEPTOR</strong>
            <table>
              <tr><td><strong>Nombre o Razón Social:</strong> ${f.nombreReceptor}</td></tr>
              ${filaOpcional('NIT', f.nitReceptor)}
              ${filaOpcional('NRC', f.nrcReceptor)}
              ${filaOpcional('Actividad Económica', f.giroReceptor)}
              ${filaOpcional('Dirección', f.direccionReceptor)}
            </table>
          </td>
        </tr>
      </table>

      <table style="width:100%; font-size:12px; margin-top:10px; border-collapse:collapse;">
        <tr>
          <td style="border:1px dashed #7a4a2a; padding:8px;"><strong>Código de Generación:</strong> No aplica — documento no transmitido al MH</td>
        </tr>
        <tr>
          <td style="border:1px dashed #7a4a2a; padding:8px;"><strong>Sello de Recepción:</strong> No aplica — documento no transmitido al MH</td>
        </tr>
        <tr>
          <td style="border:1px dashed #7a4a2a; padding:8px;"><strong>Modelo de Facturación:</strong> Simulado &nbsp;|&nbsp; <strong>Tipo de Transmisión:</strong> No transmitido</td>
        </tr>
      </table>

      <h4 style="margin-bottom:4px; margin-top:16px;">Detalle de ítems</h4>
      <table style="width:100%; border-collapse:collapse; font-size:13px;">
        <thead>
          <tr style="background:#f3efe9;">
            <th style="padding:4px; border:1px dashed #bbb;">Código</th>
            <th style="padding:4px; border:1px dashed #bbb;">Cantidad</th>
            <th style="padding:4px; border:1px dashed #bbb;">Unidad</th>
            <th style="padding:4px; border:1px dashed #bbb; text-align:left;">Descripción</th>
            <th style="padding:4px; border:1px dashed #bbb;">Precio Unitario</th>
            <th style="padding:4px; border:1px dashed #bbb;">Dcto. por Ítem</th>
            <th style="padding:4px; border:1px dashed #bbb;">Ventas Gravadas</th>
          </tr>
        </thead>
        <tbody>${filasItems}</tbody>
      </table>

      <table style="width:100%; margin-top:10px; font-size:13px;">
        <tr><td></td><td style="text-align:right;">Suma Total de Operaciones:</td><td style="text-align:right; width:110px;">$${f.subtotal.toFixed(2)}</td></tr>
        <tr><td></td><td style="text-align:right;">Monto global Desc., Rebajas y otros a ventas gravadas:</td><td style="text-align:right;">$0.00</td></tr>
        <tr><td></td><td style="text-align:right;">Impuesto al Valor Agregado (13%):</td><td style="text-align:right;">$${f.iva.toFixed(2)}</td></tr>
        <tr><td></td><td style="text-align:right;">Sub-Total:</td><td style="text-align:right;">$${f.subtotal.toFixed(2)}</td></tr>
        <tr><td></td><td style="text-align:right;">IVA Percibido:</td><td style="text-align:right;">$0.00</td></tr>
        <tr><td></td><td style="text-align:right;">IVA Retenido:</td><td style="text-align:right;">$0.00</td></tr>
        <tr><td></td><td style="text-align:right;">Retención Renta:</td><td style="text-align:right;">$0.00</td></tr>
        <tr><td></td><td style="text-align:right; font-size:16px;"><strong>Monto Total de la Operación:</strong></td><td style="text-align:right; font-size:16px;"><strong>$${f.total.toFixed(2)}</strong></td></tr>
        <tr><td></td><td style="text-align:right; font-size:16px;"><strong>Total a Pagar:</strong></td><td style="text-align:right; font-size:16px;"><strong>$${f.total.toFixed(2)}</strong></td></tr>
      </table>

      <p style="font-size:13px; margin-top:16px;">
        Condición de la operación: Contado &nbsp;|&nbsp; Método de pago: ${f.metodo} &nbsp;|&nbsp; Referencia: ${f.referencia}
      </p>

      <p style="font-size:11px; color:#999; margin-top:16px; border-top:1px solid #eee; padding-top:8px;">
        Este comprobante refleja el cálculo de IVA conforme a la Ley de IVA de El Salvador (13%),
        pero es un documento <strong>SIMULADO</strong> generado por el sistema interno de ${emisor.nombre}.
        No ha sido firmado digitalmente ni transmitido a la API de recepción de DTE del Ministerio de
        Hacienda, por lo que no constituye un Documento Tributario Electrónico válido.
      </p>
    </div>`;

  if (!hayConfiguracionAPI()) {
    console.log('--------------------------------------------------');
    console.log('[EMAIL] No hay SENDGRID_API_KEY configurada (ver backend/.env).');
    console.log(`[EMAIL] ${tituloDoc} ${f.numero} para ${destino} por $${f.total.toFixed(2)}`);
    console.log('--------------------------------------------------');
    return { simulado: true };
  }

  // Debe ser EXACTAMENTE el correo verificado como "Single Sender" en SendGrid.
  const remitente = process.env.EMAIL_FROM || 'mesassillas585@gmail.com';
  const match = remitente.match(/^(.*)<(.+)>$/);
  const fromEmail = match ? match[2].trim() : remitente.trim();
  const fromName = match ? match[1].trim().replace(/^"|"$/g, '') : emisor.nombre;

  const respuesta = await fetch(SENDGRID_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: destino }], subject: asunto }],
      from: { email: fromEmail, name: fromName },
      content: [
        { type: 'text/plain', value: textoPlano },
        { type: 'text/html', value: html },
      ],
    }),
  });

  if (!respuesta.ok) {
    const detalle = await respuesta.text().catch(() => '');
    throw new Error(`SendGrid respondió ${respuesta.status}: ${detalle}`);
  }

  const messageId = respuesta.headers.get('x-message-id');
  console.log(`[EMAIL] ${f.numero} enviado correctamente a ${destino} (id: ${messageId || 'n/a'})`);
  return { simulado: false, id: messageId };
}

module.exports = { enviarCorreoFactura };
