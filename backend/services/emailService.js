// Envío de correos vía API HTTP (SendGrid).
const SENDGRID_URL = 'https://api.sendgrid.com/v3/mail/send';

function hayConfiguracionAPI() {
  return Boolean(process.env.SENDGRID_API_KEY);
}

function filaOpcional(etiqueta, valor) {
  return valor ? `<tr><td><strong>${etiqueta}</strong></td><td>${valor}</td></tr>` : '';
}

async function enviarCorreoFactura(destino, nombre, f) {
  const esCreditoFiscal = f.tipoDte === '03';
  const tituloDoc = esCreditoFiscal ? 'COMPROBANTE DE CRÉDITO FISCAL' : 'FACTURA DE CONSUMIDOR FINAL';

  const filasItems = f.items
    .map((i) => {
      const precio = Number(i.precio_unitario || 0);
      const totalLinea = (precio * i.cantidad).toFixed(2);
      return `<tr>
        <td>${i.nombre}</td>
        <td style="text-align:center;">${i.cantidad}</td>
        <td style="text-align:right;">$${precio.toFixed(2)}</td>
        <td style="text-align:right;">$${totalLinea}</td>
      </tr>`;
    })
    .join('');

  const asunto = `${tituloDoc} ${f.numero} — ${process.env.EMISOR_NOMBRE || 'RENTSERES'}`;

  const textoPlano = `Hola ${nombre},

${tituloDoc}
No: ${f.numero}
Emisor: ${process.env.EMISOR_NOMBRE} | NIT: ${process.env.EMISOR_NIT} | NRC: ${process.env.EMISOR_NRC}
Receptor: ${f.nombreReceptor}${f.nitReceptor ? ` | NIT: ${f.nitReceptor} | NRC: ${f.nrcReceptor || '-'}` : ''}

Subtotal: $${f.subtotal.toFixed(2)}
IVA (13%): $${f.iva.toFixed(2)}
TOTAL: $${f.total.toFixed(2)}

Método de pago: ${f.metodo} | Referencia: ${f.referencia}

Este comprobante refleja el cálculo de IVA conforme a la Ley de IVA de
El Salvador, pero para constituir un DTE con validez fiscal plena debe
estar firmado y transmitido al Ministerio de Hacienda.`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #ccc; padding: 16px;">
      <table style="width:100%;">
        <tr>
          <td>
            <h2 style="margin:0; color:#7a4a2a;">${process.env.EMISOR_NOMBRE || 'RENTSERES'}</h2>
            <p style="margin:2px 0; font-size:13px;">NIT: ${process.env.EMISOR_NIT || ''}</p>
            <p style="margin:2px 0; font-size:13px;">NRC: ${process.env.EMISOR_NRC || ''}</p>
            <p style="margin:2px 0; font-size:13px;">Giro: ${process.env.EMISOR_GIRO || ''}</p>
            <p style="margin:2px 0; font-size:13px;">${process.env.EMISOR_DIRECCION || ''}</p>
          </td>
          <td style="text-align:right; vertical-align:top;">
            <div style="border:2px solid #7a4a2a; padding:8px; display:inline-block;">
              <strong>${tituloDoc}</strong><br>
              No. ${f.numero}<br>
              Fecha: ${f.fecha}
            </div>
          </td>
        </tr>
      </table>

      <h4 style="margin-bottom:4px;">Datos del receptor</h4>
      <table style="width:100%; font-size:14px; border-collapse:collapse;">
        <tr><td><strong>Nombre</strong></td><td>${f.nombreReceptor}</td></tr>
        ${filaOpcional('NIT', f.nitReceptor)}
        ${filaOpcional('NRC', f.nrcReceptor)}
        ${filaOpcional('Giro', f.giroReceptor)}
        ${filaOpcional('Dirección', f.direccionReceptor)}
      </table>

      <h4 style="margin-bottom:4px; margin-top:16px;">Detalle</h4>
      <table style="width:100%; border-collapse:collapse; font-size:14px;">
        <thead>
          <tr style="border-bottom:1px solid #999;">
            <th style="text-align:left;">Descripción</th>
            <th>Cant.</th>
            <th style="text-align:right;">P. Unit.</th>
            <th style="text-align:right;">Total</th>
          </tr>
        </thead>
        <tbody>${filasItems}</tbody>
      </table>

      <table style="width:100%; margin-top:8px; font-size:14px;">
        <tr><td></td><td style="text-align:right;"><strong>Subtotal:</strong></td><td style="text-align:right; width:100px;">$${f.subtotal.toFixed(2)}</td></tr>
        <tr><td></td><td style="text-align:right;"><strong>IVA (13%):</strong></td><td style="text-align:right;">$${f.iva.toFixed(2)}</td></tr>
        <tr><td></td><td style="text-align:right; font-size:16px;"><strong>TOTAL:</strong></td><td style="text-align:right; font-size:16px;"><strong>$${f.total.toFixed(2)}</strong></td></tr>
      </table>

      <p style="font-size:13px; margin-top:16px;">
        Método de pago: ${f.metodo} &nbsp;|&nbsp; Referencia: ${f.referencia}
      </p>

      <p style="font-size:11px; color:#999; margin-top:20px; border-top:1px solid #eee; padding-top:8px;">
        Comprobante generado conforme al formato de ${esCreditoFiscal ? 'Comprobante de Crédito Fiscal' : 'Factura de Consumidor Final'}
        y a la tasa de IVA vigente en El Salvador (13%). Para tener plena validez
        como Documento Tributario Electrónico (DTE) ante el Ministerio de Hacienda,
        este documento debe ser firmado digitalmente y transmitido a través de su
        API de recepción de DTE.
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
  // Si EMAIL_FROM viene como "Nombre <correo@dominio.com>" lo separamos,
  // porque SendGrid pide el nombre y el correo en campos distintos.
  const match = remitente.match(/^(.*)<(.+)>$/);
  const fromEmail = match ? match[2].trim() : remitente.trim();
  const fromName = match ? match[1].trim().replace(/^"|"$/g, '') : (process.env.EMISOR_NOMBRE || 'RENTSERES');

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

  // SendGrid no regresa un cuerpo JSON en éxito (202 Accepted, sin contenido),
  // pero sí regresa un header con un id de mensaje útil para rastrear envíos.
  const messageId = respuesta.headers.get('x-message-id');
  console.log(`[EMAIL] ${f.numero} enviado correctamente a ${destino} (id: ${messageId || 'n/a'})`);
  return { simulado: false, id: messageId };
}

module.exports = { enviarCorreoFactura };
