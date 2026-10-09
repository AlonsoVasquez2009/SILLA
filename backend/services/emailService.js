// Envío de correos. Si no hay credenciales SMTP configuradas en .env,
// no revienta: muestra el enlace en la consola para poder probar en local.
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

function urlFrontend() {
  return process.env.FRONTEND_URL || 'http://localhost:3000';
}

async function enviarCorreoVerificacion(destino, nombre, token) {
  const enlace = `${urlFrontend()}/verificar.html?token=${token}`;
  const asunto = 'Verifica tu correo — Mesas y Sillas';
  const textoPlano = `Hola ${nombre},\n\nConfirma tu cuenta para poder iniciar sesión:\n${enlace}\n\nEste enlace vence en 24 horas. Si no creaste esta cuenta, ignora este correo.`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #7a4a2a;">Mesas y Sillas</h2>
      <p>Hola ${nombre},</p>
      <p>Gracias por registrarte. Confirma tu correo para activar tu cuenta:</p>
      <p style="text-align: center; margin: 24px 0;">
        <a href="${enlace}" style="background: #7a4a2a; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none;">Verificar mi cuenta</a>
      </p>
      <p style="font-size: 13px; color: #666;">O copia y pega este enlace en tu navegador:<br>${enlace}</p>
      <p style="font-size: 13px; color: #666;">Este enlace vence en 24 horas.</p>
    </div>`;

  const transporte = obtenerTransportador();

  if (!transporte) {
    // Modo desarrollo: no hay SMTP configurado, solo mostramos el enlace.
    console.log('--------------------------------------------------');
    console.log('[EMAIL] No hay SMTP configurado (ver backend/.env).');
    console.log(`[EMAIL] Enlace de verificación para ${destino}:`);
    console.log(enlace);
    console.log('--------------------------------------------------');
    return { simulado: true, enlace };
  }

  await transporte.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to: destino,
    subject: asunto,
    text: textoPlano,
    html,
  });
  return { simulado: false };
}

module.exports = { enviarCorreoVerificacion };
