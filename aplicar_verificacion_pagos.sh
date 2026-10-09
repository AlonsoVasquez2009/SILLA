#!/usr/bin/env bash
set -e
echo "Aplicando cambios: verificación de correo + pagos simulados"

mkdir -p "$(dirname "backend/services/emailService.js")"
cat > backend/services/emailService.js << 'EOF_CLAUDE'
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
EOF_CLAUDE
echo "✔ backend/services/emailService.js"

mkdir -p "$(dirname "backend/services/registroService.js")"
cat > backend/services/registroService.js << 'EOF_CLAUDE'
// Registro público: cualquier persona puede crear su propia cuenta,
// siempre con el rol "usuario". Crear administradores sigue siendo
// exclusivo del panel de usuarios (solo accesible para un admin ya logueado).
// La cuenta queda inactiva para iniciar sesión hasta verificar el correo.
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { pool } = require('../db');
const { enviarCorreoVerificacion } = require('./emailService');

async function registrarCliente({ nombre, email, password }) {
  if (!nombre || !email || !password) {
    const error = new Error('Nombre, correo y contraseña son obligatorios');
    error.status = 400;
    throw error;
  }
  if (password.length < 6) {
    const error = new Error('La contraseña debe tener al menos 6 caracteres');
    error.status = 400;
    throw error;
  }

  const correo = email.toLowerCase().trim();

  const { rows: existente } = await pool.query('SELECT id FROM usuarios WHERE email = $1', [correo]);
  if (existente.length > 0) {
    const error = new Error('Ya existe una cuenta con ese correo');
    error.status = 409;
    throw error;
  }

  const { rows: rolRows } = await pool.query("SELECT id FROM roles WHERE nombre = 'usuario'");
  const hash = await bcrypt.hash(password, 10);
  const token = crypto.randomBytes(32).toString('hex');
  const expira = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 horas

  const { rows } = await pool.query(
    `INSERT INTO usuarios (nombre, email, password_hash, rol_id, verificado, token_verificacion, token_expira)
     VALUES ($1, $2, $3, $4, false, $5, $6)
     RETURNING id, nombre, email`,
    [nombre.trim(), correo, hash, rolRows[0].id, token, expira]
  );

  await enviarCorreoVerificacion(rows[0].email, rows[0].nombre, token);

  return { ...rows[0], rol: 'usuario', verificado: false };
}

module.exports = { registrarCliente };
EOF_CLAUDE
echo "✔ backend/services/registroService.js"

mkdir -p "$(dirname "backend/controllers/registroController.js")"
cat > backend/controllers/registroController.js << 'EOF_CLAUDE'
const { registrarCliente } = require('../services/registroService');

// Ya no inicia sesión automáticamente: la cuenta queda pendiente de
// verificación por correo antes de poder usarla.
async function registrar(req, res, next) {
  try {
    const usuario = await registrarCliente(req.body);
    res.status(201).json({
      mensaje: 'Cuenta creada. Revisa tu correo para verificarla antes de iniciar sesión.',
      usuario,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { registrar };
EOF_CLAUDE
echo "✔ backend/controllers/registroController.js"

mkdir -p "$(dirname "backend/services/verificacionService.js")"
cat > backend/services/verificacionService.js << 'EOF_CLAUDE'
// Verificación de correo tras el registro.
const crypto = require('crypto');
const { pool } = require('../db');
const { enviarCorreoVerificacion } = require('./emailService');

async function verificarCuenta(token) {
  if (!token) {
    const error = new Error('Token de verificación faltante');
    error.status = 400;
    throw error;
  }

  const { rows } = await pool.query(
    `SELECT id, nombre, email, verificado, token_expira FROM usuarios WHERE token_verificacion = $1`,
    [token]
  );
  const usuario = rows[0];

  if (!usuario) {
    const error = new Error('El enlace de verificación no es válido');
    error.status = 400;
    throw error;
  }
  if (usuario.verificado) {
    return { mensaje: 'Esta cuenta ya estaba verificada', email: usuario.email };
  }
  if (new Date(usuario.token_expira) < new Date()) {
    const error = new Error('El enlace de verificación venció. Solicita uno nuevo.');
    error.status = 400;
    throw error;
  }

  await pool.query(
    `UPDATE usuarios SET verificado = true, token_verificacion = NULL, token_expira = NULL WHERE id = $1`,
    [usuario.id]
  );

  return { mensaje: 'Cuenta verificada correctamente', email: usuario.email };
}

async function reenviarVerificacion(email) {
  if (!email) {
    const error = new Error('Indica tu correo');
    error.status = 400;
    throw error;
  }
  const correo = email.toLowerCase().trim();

  const { rows } = await pool.query(
    `SELECT id, nombre, email, verificado FROM usuarios WHERE email = $1`,
    [correo]
  );
  const usuario = rows[0];

  // Respuesta genérica aunque la cuenta no exista o ya esté verificada,
  // para no revelar qué correos están registrados.
  if (!usuario || usuario.verificado) {
    return { mensaje: 'Si la cuenta existe y falta verificarla, se envió un nuevo correo.' };
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expira = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await pool.query(
    `UPDATE usuarios SET token_verificacion = $1, token_expira = $2 WHERE id = $3`,
    [token, expira, usuario.id]
  );

  await enviarCorreoVerificacion(usuario.email, usuario.nombre, token);

  return { mensaje: 'Si la cuenta existe y falta verificarla, se envió un nuevo correo.' };
}

module.exports = { verificarCuenta, reenviarVerificacion };
EOF_CLAUDE
echo "✔ backend/services/verificacionService.js"

mkdir -p "$(dirname "backend/controllers/verificacionController.js")"
cat > backend/controllers/verificacionController.js << 'EOF_CLAUDE'
const { verificarCuenta, reenviarVerificacion } = require('../services/verificacionService');

async function verificar(req, res, next) {
  try {
    const resultado = await verificarCuenta(req.query.token);
    res.json(resultado);
  } catch (err) {
    next(err);
  }
}

async function reenviar(req, res, next) {
  try {
    const resultado = await reenviarVerificacion(req.body.email);
    res.json(resultado);
  } catch (err) {
    next(err);
  }
}

module.exports = { verificar, reenviar };
EOF_CLAUDE
echo "✔ backend/controllers/verificacionController.js"

mkdir -p "$(dirname "backend/routes/authRoutes.js")"
cat > backend/routes/authRoutes.js << 'EOF_CLAUDE'
const express = require('express');
const { login, logout, me } = require('../controllers/authController');
const { registrar } = require('../controllers/registroController');
const { verificar, reenviar } = require('../controllers/verificacionController');
const { requerirSesion } = require('../middleware/auth');

const router = express.Router();

router.post('/login', login);
router.post('/registro', registrar);
router.get('/verificar', verificar);
router.post('/reenviar-verificacion', reenviar);
router.post('/logout', requerirSesion, logout);
router.get('/me', requerirSesion, me);

module.exports = router;
EOF_CLAUDE
echo "✔ backend/routes/authRoutes.js"

mkdir -p "$(dirname "backend/services/authService.js")"
cat > backend/services/authService.js << 'EOF_CLAUDE'
// Reglas de negocio de autenticación: buscar usuario y verificar contraseña.
const bcrypt = require('bcryptjs');
const { pool } = require('../db');

// Devuelve los datos públicos del usuario si las credenciales son correctas.
// Si fallan, lanza un error genérico para no revelar si el correo existe.
async function iniciarSesion(email, password) {
  const consulta = `
    SELECT u.id, u.nombre, u.email, u.password_hash, u.activo, u.verificado, r.nombre AS rol
    FROM usuarios u
    JOIN roles r ON r.id = u.rol_id
    WHERE u.email = $1
  `;
  const { rows } = await pool.query(consulta, [email.toLowerCase()]);
  const usuario = rows[0];

  const passwordValida = usuario && (await bcrypt.compare(password, usuario.password_hash));

  if (!passwordValida || !usuario.activo) {
    const error = new Error('Correo o contraseña incorrectos');
    error.status = 401;
    throw error;
  }

  if (!usuario.verificado) {
    const error = new Error('Debes verificar tu correo antes de iniciar sesión');
    error.status = 403;
    error.codigo = 'CUENTA_NO_VERIFICADA';
    throw error;
  }

  return { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol };
}

module.exports = { iniciarSesion };
EOF_CLAUDE
echo "✔ backend/services/authService.js"

mkdir -p "$(dirname "backend/middleware/errores.js")"
cat > backend/middleware/errores.js << 'EOF_CLAUDE'
// Respuesta uniforme para rutas que no existen.
function rutaNoEncontrada(req, res) {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
}

// Captura cualquier error lanzado en controladores o servicios.
// Express lo reconoce por tener cuatro parámetros.
// eslint-disable-next-line no-unused-vars
function manejarErrores(err, req, res, next) {
  const estado = err.status || 500;
  const mensaje =
    estado === 500 && process.env.NODE_ENV === 'production'
      ? 'Error interno del servidor'
      : err.message;

  if (estado === 500) {
    console.error(err);
  }

  const cuerpo = { error: mensaje };
  if (err.codigo) cuerpo.codigo = err.codigo;
  if (err.pago) cuerpo.pago = err.pago;
  res.status(estado).json(cuerpo);
}

module.exports = { rutaNoEncontrada, manejarErrores };
EOF_CLAUDE
echo "✔ backend/middleware/errores.js"

mkdir -p "$(dirname "backend/services/pagoService.js")"
cat > backend/services/pagoService.js << 'EOF_CLAUDE'
// Pasarela de pago SIMULADA: no se conecta a ningún banco real.
// Sirve para completar el flujo de cobro de una reserva en el sistema.
const crypto = require('crypto');
const { pool } = require('../db');

// Precios simulados por recurso (unidad), usados solo para calcular el monto.
const PRECIO_POR_TIPO = { mesa: 5, silla: 1 };

function validarTarjeta({ numero_tarjeta, vencimiento, cvv }) {
  const numero = (numero_tarjeta || '').replace(/\s+/g, '');
  if (!/^\d{13,19}$/.test(numero)) {
    const error = new Error('Número de tarjeta inválido');
    error.status = 400;
    throw error;
  }
  if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(vencimiento || '')) {
    const error = new Error('Vencimiento inválido (formato MM/AA)');
    error.status = 400;
    throw error;
  }
  if (!/^\d{3,4}$/.test(cvv || '')) {
    const error = new Error('CVV inválido');
    error.status = 400;
    throw error;
  }
  return numero;
}

// Decide si el pago simulado se aprueba o se rechaza.
// Regla de prueba: una tarjeta que termina en "0000" simula un rechazo
// del banco, para poder probar ambos caminos sin un banco real.
function simularAprobacion(metodo, numeroTarjeta) {
  if (metodo === 'tarjeta' && numeroTarjeta.endsWith('0000')) {
    return false;
  }
  return true;
}

async function calcularMonto(reservaId) {
  const { rows } = await pool.query(
    `SELECT rec.tipo, dr.cantidad
     FROM detalle_reservas dr
     JOIN recursos rec ON rec.id = dr.recurso_id
     WHERE dr.reserva_id = $1`,
    [reservaId]
  );
  return rows.reduce((total, fila) => total + fila.cantidad * (PRECIO_POR_TIPO[fila.tipo] || 0), 0);
}

// datos: { reserva_id, metodo: 'tarjeta' | 'transferencia', numero_tarjeta?, vencimiento?, cvv? }
async function simularPago(usuario, datos) {
  const { reserva_id, metodo } = datos;

  if (!reserva_id) {
    const error = new Error('Debes indicar la reserva a pagar');
    error.status = 400;
    throw error;
  }
  if (!['tarjeta', 'transferencia'].includes(metodo)) {
    const error = new Error('Método de pago inválido');
    error.status = 400;
    throw error;
  }

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    const { rows: reservaRows } = await cliente.query(
      `SELECT * FROM reservas WHERE id = $1 FOR UPDATE`,
      [reserva_id]
    );
    const reserva = reservaRows[0];

    if (!reserva) {
      const error = new Error('Reserva no encontrada');
      error.status = 404;
      throw error;
    }
    if (usuario.rol !== 'admin' && reserva.usuario_id !== usuario.id) {
      const error = new Error('No puedes pagar la reserva de otro usuario');
      error.status = 403;
      throw error;
    }
    if (reserva.estado !== 'Confirmada') {
      const error = new Error(`La reserva está en estado "${reserva.estado}", no se puede pagar`);
      error.status = 409;
      throw error;
    }
    if (reserva.pagado) {
      const error = new Error('Esta reserva ya fue pagada');
      error.status = 409;
      throw error;
    }

    let numeroTarjeta = null;
    if (metodo === 'tarjeta') {
      numeroTarjeta = validarTarjeta(datos);
    }

    const monto = await calcularMonto(reserva_id);
    const aprobado = simularAprobacion(metodo, numeroTarjeta || '');
    const estado = aprobado ? 'aprobado' : 'rechazado';
    const referencia = `SIM-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

    const { rows: pagoRows } = await cliente.query(
      `INSERT INTO pagos (reserva_id, usuario_id, monto, metodo, estado, referencia)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, reserva_id, usuario_id, monto, metodo, estado, referencia, creado_en`,
      [reserva_id, usuario.id, monto, metodo, estado, referencia]
    );
    const pago = pagoRows[0];

    if (aprobado) {
      await cliente.query(`UPDATE reservas SET pagado = true WHERE id = $1`, [reserva_id]);
    }

    await cliente.query('COMMIT');
    return pago;
  } catch (err) {
    await cliente.query('ROLLBACK');
    throw err;
  } finally {
    cliente.release();
  }
}

// Envoltorio: deja el pago registrado (aprobado o rechazado) y, si fue
// rechazado, lo informa como error para que el frontend lo muestre así.
async function procesarPago(usuario, datos) {
  const pago = await simularPago(usuario, datos);
  if (pago.estado === 'rechazado') {
    const error = new Error('El pago fue rechazado (simulado). Intenta con otro método o tarjeta.');
    error.status = 402;
    error.pago = pago;
    throw error;
  }
  return pago;
}

async function listarPagos(usuario) {
  const esAdmin = usuario.rol === 'admin';
  const condicion = esAdmin ? '' : 'WHERE p.usuario_id = $1';
  const parametros = esAdmin ? [] : [usuario.id];

  const { rows } = await pool.query(
    `SELECT p.id, p.reserva_id, p.usuario_id, u.nombre AS usuario_nombre, p.monto,
            p.metodo, p.estado, p.referencia, p.creado_en
     FROM pagos p
     JOIN usuarios u ON u.id = p.usuario_id
     ${condicion}
     ORDER BY p.creado_en DESC`,
    parametros
  );
  return rows;
}

module.exports = { procesarPago, listarPagos };
EOF_CLAUDE
echo "✔ backend/services/pagoService.js"

mkdir -p "$(dirname "backend/controllers/pagoController.js")"
cat > backend/controllers/pagoController.js << 'EOF_CLAUDE'
const { procesarPago, listarPagos } = require('../services/pagoService');

async function crear(req, res, next) {
  try {
    const pago = await procesarPago(req.session.usuario, req.body);
    res.status(201).json({ mensaje: 'Pago aprobado', pago });
  } catch (err) {
    next(err);
  }
}

async function listar(req, res, next) {
  try {
    const pagos = await listarPagos(req.session.usuario);
    res.json({ pagos });
  } catch (err) {
    next(err);
  }
}

module.exports = { crear, listar };
EOF_CLAUDE
echo "✔ backend/controllers/pagoController.js"

mkdir -p "$(dirname "backend/routes/pagoRoutes.js")"
cat > backend/routes/pagoRoutes.js << 'EOF_CLAUDE'
const express = require('express');
const { crear, listar } = require('../controllers/pagoController');
const { requerirSesion } = require('../middleware/auth');

const router = express.Router();

router.use(requerirSesion);

router.post('/', crear);
router.get('/', listar);

module.exports = router;
EOF_CLAUDE
echo "✔ backend/routes/pagoRoutes.js"

mkdir -p "$(dirname "backend/app.js")"
cat > backend/app.js << 'EOF_CLAUDE'
require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const { rutaNoEncontrada, manejarErrores } = require('./middleware/errores');
const authRoutes = require('./routes/authRoutes');
const inventarioRoutes = require('./routes/inventarioRoutes');
const reservaRoutes = require('./routes/reservaRoutes');
const prestamoRoutes = require('./routes/prestamoRoutes');
const devolucionRoutes = require('./routes/devolucionRoutes');
const historialRoutes = require('./routes/historialRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const reporteRoutes = require('./routes/reporteRoutes');
const usuarioRoutes = require('./routes/usuarioRoutes');
const pagoRoutes = require('./routes/pagoRoutes');

const app = express();

app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'desarrollo-inseguro',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 8,
    },
  })
);

app.get('/api/salud', (req, res) => {
  res.json({ estado: 'ok', fecha: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/inventario', inventarioRoutes);
app.use('/api/reservas', reservaRoutes);
app.use('/api/prestamos', prestamoRoutes);
app.use('/api/devoluciones', devolucionRoutes);
app.use('/api/historial', historialRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reportes', reporteRoutes);
app.use('/api/usuarios', usuarioRoutes);
app.use('/api/pagos', pagoRoutes);

app.use(express.static(path.join(__dirname, '..', 'frontend')));

app.use('/api', rutaNoEncontrada);
app.use(rutaNoEncontrada);

app.use(manejarErrores);

module.exports = app;
EOF_CLAUDE
echo "✔ backend/app.js"

mkdir -p "$(dirname "backend/services/reservaService.js")"
cat > backend/services/reservaService.js << 'EOF_CLAUDE'
// Reglas de negocio de reservas. Las reservas son automáticas:
// si hay disponibilidad, se confirman en el mismo momento de crearlas.
const { pool } = require('../db');

// items: [{ recurso_id, cantidad }, ...]
async function crearReserva(usuarioId, { fecha, hora_inicio, hora_fin, items }) {
  if (!fecha || !hora_inicio || !hora_fin) {
    const error = new Error('Fecha, hora de inicio y hora de fin son obligatorias');
    error.status = 400;
    throw error;
  }
  if (!Array.isArray(items) || items.length === 0) {
    const error = new Error('Debes indicar al menos un recurso');
    error.status = 400;
    throw error;
  }

  // No se permite repetir el mismo recurso dos veces en una misma reserva.
  const recursoIds = items.map((i) => i.recurso_id);
  if (new Set(recursoIds).size !== recursoIds.length) {
    const error = new Error('No se puede repetir el mismo recurso en una reserva');
    error.status = 400;
    throw error;
  }
  for (const item of items) {
    if (!Number.isInteger(item.cantidad) || item.cantidad <= 0) {
      const error = new Error('Las cantidades deben ser enteros mayores que 0');
      error.status = 400;
      throw error;
    }
  }

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    // Ordenamos por recurso_id antes de bloquear: si dos reservas piden
    // los mismos recursos en distinto orden, evita un interbloqueo (deadlock).
    const idsOrdenados = [...recursoIds].sort((a, b) => a - b);
    const { rows: recursos } = await cliente.query(
      `SELECT id, nombre, disponibles FROM recursos WHERE id = ANY($1) FOR UPDATE`,
      [idsOrdenados]
    );

    if (recursos.length !== recursoIds.length) {
      const error = new Error('Alguno de los recursos indicados no existe');
      error.status = 404;
      throw error;
    }

    const disponiblesPorId = new Map(recursos.map((r) => [r.id, r]));

    for (const item of items) {
      const recurso = disponiblesPorId.get(item.recurso_id);
      if (item.cantidad > recurso.disponibles) {
        const error = new Error(
          `No hay suficiente disponibilidad de "${recurso.nombre}": quedan ${recurso.disponibles}`
        );
        error.status = 409;
        throw error;
      }
    }

    const { rows: reservaRows } = await cliente.query(
      `INSERT INTO reservas (usuario_id, fecha, hora_inicio, hora_fin, estado)
       VALUES ($1, $2, $3, $4, 'Confirmada')
       RETURNING id, usuario_id, fecha, hora_inicio, hora_fin, estado, pagado, created_at`,
      [usuarioId, fecha, hora_inicio, hora_fin]
    );
    const reserva = reservaRows[0];

    for (const item of items) {
      await cliente.query(
        `INSERT INTO detalle_reservas (reserva_id, recurso_id, cantidad)
         VALUES ($1, $2, $3)`,
        [reserva.id, item.recurso_id, item.cantidad]
      );

      await cliente.query(
        `UPDATE recursos
         SET disponibles = disponibles - $1, reservados = reservados + $1
         WHERE id = $2`,
        [item.cantidad, item.recurso_id]
      );

      await cliente.query(
        `INSERT INTO historial (usuario_id, tipo_operacion, recurso_id, cantidad, estado_anterior, estado_posterior)
         VALUES ($1, 'Reserva creada', $2, $3, NULL, 'Confirmada')`,
        [usuarioId, item.recurso_id, item.cantidad]
      );
    }

    await cliente.query('COMMIT');
    return { ...reserva, items };
  } catch (err) {
    await cliente.query('ROLLBACK');
    throw err;
  } finally {
    cliente.release();
  }
}

// El admin ve todas las reservas; un usuario normal solo las suyas.
async function listarReservas(usuario) {
  const esAdmin = usuario.rol === 'admin';
  const condicion = esAdmin ? '' : 'WHERE r.usuario_id = $1';
  const parametros = esAdmin ? [] : [usuario.id];

  const { rows } = await pool.query(
    `SELECT r.id, r.usuario_id, u.nombre AS usuario_nombre, r.fecha, r.hora_inicio,
            r.hora_fin, r.estado, r.pagado, r.created_at,
            COALESCE(
              json_agg(
                json_build_object('recurso_id', dr.recurso_id, 'nombre', rec.nombre, 'cantidad', dr.cantidad)
              ) FILTER (WHERE dr.id IS NOT NULL), '[]'
            ) AS items
     FROM reservas r
     JOIN usuarios u ON u.id = r.usuario_id
     LEFT JOIN detalle_reservas dr ON dr.reserva_id = r.id
     LEFT JOIN recursos rec ON rec.id = dr.recurso_id
     ${condicion}
     GROUP BY r.id, u.nombre
     ORDER BY r.fecha DESC, r.hora_inicio DESC`,
    parametros
  );
  return rows;
}

// Cancela una reserva y libera sus recursos. Un usuario normal solo puede
// cancelar sus propias reservas; el admin puede cancelar cualquiera.
async function cancelarReserva(reservaId, usuario) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    const { rows: reservaRows } = await cliente.query(
      `SELECT * FROM reservas WHERE id = $1 FOR UPDATE`,
      [reservaId]
    );
    const reserva = reservaRows[0];

    if (!reserva) {
      const error = new Error('Reserva no encontrada');
      error.status = 404;
      throw error;
    }
    if (usuario.rol !== 'admin' && reserva.usuario_id !== usuario.id) {
      const error = new Error('No puedes cancelar la reserva de otro usuario');
      error.status = 403;
      throw error;
    }
    if (reserva.estado !== 'Confirmada') {
      const error = new Error(`La reserva ya está en estado "${reserva.estado}"`);
      error.status = 409;
      throw error;
    }

    const { rows: detalles } = await cliente.query(
      `SELECT recurso_id, cantidad FROM detalle_reservas WHERE reserva_id = $1`,
      [reservaId]
    );

    for (const d of detalles) {
      await cliente.query(
        `UPDATE recursos
         SET disponibles = disponibles + $1, reservados = reservados - $1
         WHERE id = $2`,
        [d.cantidad, d.recurso_id]
      );

      await cliente.query(
        `INSERT INTO historial (usuario_id, tipo_operacion, recurso_id, cantidad, estado_anterior, estado_posterior)
         VALUES ($1, 'Reserva cancelada', $2, $3, 'Confirmada', 'Cancelada')`,
        [usuario.id, d.recurso_id, d.cantidad]
      );
    }

    await cliente.query(`UPDATE reservas SET estado = 'Cancelada' WHERE id = $1`, [reservaId]);

    await cliente.query('COMMIT');
    return { id: reservaId, estado: 'Cancelada' };
  } catch (err) {
    await cliente.query('ROLLBACK');
    throw err;
  } finally {
    cliente.release();
  }
}

module.exports = { crearReserva, listarReservas, cancelarReserva };
EOF_CLAUDE
echo "✔ backend/services/reservaService.js"

mkdir -p "$(dirname "backend/schema.sql")"
cat > backend/schema.sql << 'EOF_CLAUDE'
-- Esquema del sistema de mesas y sillas.
-- Se puede ejecutar varias veces sin error gracias a IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS roles (
  id      SERIAL PRIMARY KEY,
  nombre  VARCHAR(30) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS usuarios (
  id                  SERIAL PRIMARY KEY,
  nombre              VARCHAR(100) NOT NULL,
  email               VARCHAR(150) NOT NULL UNIQUE,
  password_hash       VARCHAR(255) NOT NULL,
  rol_id              INTEGER NOT NULL REFERENCES roles(id),
  activo              BOOLEAN NOT NULL DEFAULT TRUE,
  verificado          BOOLEAN NOT NULL DEFAULT FALSE,
  token_verificacion  VARCHAR(255),
  token_expira        TIMESTAMP,
  created_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Inventario: fuente única de cantidades por recurso.
-- La suma disponibles + reservados + prestados debe igualar total.
CREATE TABLE IF NOT EXISTS recursos (
  id           SERIAL PRIMARY KEY,
  nombre       VARCHAR(50) NOT NULL UNIQUE,
  tipo         VARCHAR(10) NOT NULL CHECK (tipo IN ('mesa', 'silla')),
  total        INTEGER NOT NULL CHECK (total >= 0),
  disponibles  INTEGER NOT NULL CHECK (disponibles >= 0),
  reservados   INTEGER NOT NULL CHECK (reservados >= 0),
  prestados    INTEGER NOT NULL CHECK (prestados >= 0),
  CHECK (disponibles + reservados + prestados = total)
);

CREATE TABLE IF NOT EXISTS reservas (
  id           SERIAL PRIMARY KEY,
  usuario_id   INTEGER NOT NULL REFERENCES usuarios(id),
  fecha        DATE NOT NULL,
  hora_inicio  TIME NOT NULL,
  hora_fin     TIME NOT NULL,
  estado       VARCHAR(20) NOT NULL DEFAULT 'Confirmada'
               CHECK (estado IN ('Confirmada', 'Cancelada', 'Finalizada')),
  pagado       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  CHECK (hora_fin > hora_inicio)
);

CREATE TABLE IF NOT EXISTS detalle_reservas (
  id          SERIAL PRIMARY KEY,
  reserva_id  INTEGER NOT NULL REFERENCES reservas(id) ON DELETE CASCADE,
  recurso_id  INTEGER NOT NULL REFERENCES recursos(id),
  cantidad    INTEGER NOT NULL CHECK (cantidad > 0),
  UNIQUE (reserva_id, recurso_id)
);

CREATE TABLE IF NOT EXISTS prestamos (
  id                SERIAL PRIMARY KEY,
  usuario_id        INTEGER NOT NULL REFERENCES usuarios(id),
  reserva_id        INTEGER UNIQUE REFERENCES reservas(id),
  fecha_prestamo    DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_prevista    DATE NOT NULL,
  estado            VARCHAR(25) NOT NULL DEFAULT 'Activo'
                    CHECK (estado IN ('Activo', 'Parcialmente devuelto', 'Devuelto', 'Vencido')),
  observaciones     TEXT,
  CHECK (fecha_prevista >= fecha_prestamo)
);

CREATE TABLE IF NOT EXISTS detalle_prestamos (
  id           SERIAL PRIMARY KEY,
  prestamo_id  INTEGER NOT NULL REFERENCES prestamos(id) ON DELETE CASCADE,
  recurso_id   INTEGER NOT NULL REFERENCES recursos(id),
  cantidad     INTEGER NOT NULL CHECK (cantidad > 0),
  devuelto     INTEGER NOT NULL DEFAULT 0 CHECK (devuelto >= 0),
  UNIQUE (prestamo_id, recurso_id),
  CHECK (devuelto <= cantidad)
);

-- Cada evento de devolución (total o parcial) es un registro independiente.
CREATE TABLE IF NOT EXISTS devoluciones (
  id              SERIAL PRIMARY KEY,
  prestamo_id     INTEGER NOT NULL REFERENCES prestamos(id) ON DELETE CASCADE,
  registrado_por  INTEGER NOT NULL REFERENCES usuarios(id),
  fecha_real      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS detalle_devoluciones (
  id              SERIAL PRIMARY KEY,
  devolucion_id   INTEGER NOT NULL REFERENCES devoluciones(id) ON DELETE CASCADE,
  recurso_id      INTEGER NOT NULL REFERENCES recursos(id),
  cantidad        INTEGER NOT NULL CHECK (cantidad > 0),
  UNIQUE (devolucion_id, recurso_id)
);

CREATE TABLE IF NOT EXISTS historial (
  id                 SERIAL PRIMARY KEY,
  usuario_id         INTEGER REFERENCES usuarios(id),
  tipo_operacion     VARCHAR(50) NOT NULL,
  recurso_id         INTEGER REFERENCES recursos(id),
  cantidad           INTEGER,
  estado_anterior    VARCHAR(50),
  estado_posterior   VARCHAR(50),
  fecha              TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Pagos SIMULADOS asociados a una reserva (sin pasarela real).
CREATE TABLE IF NOT EXISTS pagos (
  id          SERIAL PRIMARY KEY,
  reserva_id  INTEGER REFERENCES reservas(id),
  usuario_id  INTEGER REFERENCES usuarios(id),
  monto       NUMERIC(10,2) NOT NULL,
  metodo      VARCHAR(50) NOT NULL,
  estado      VARCHAR(20) NOT NULL DEFAULT 'pendiente',
  referencia  VARCHAR(100),
  creado_en   TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Índices para las consultas más frecuentes.
CREATE INDEX IF NOT EXISTS idx_reservas_fecha ON reservas (fecha);
CREATE INDEX IF NOT EXISTS idx_reservas_usuario ON reservas (usuario_id);
CREATE INDEX IF NOT EXISTS idx_prestamos_usuario ON prestamos (usuario_id);
CREATE INDEX IF NOT EXISTS idx_prestamos_estado ON prestamos (estado);
CREATE INDEX IF NOT EXISTS idx_historial_fecha ON historial (fecha);

-- Roles básicos del sistema.
INSERT INTO roles (nombre) VALUES ('admin'), ('usuario')
ON CONFLICT (nombre) DO NOTHING;
EOF_CLAUDE
echo "✔ backend/schema.sql"

mkdir -p "$(dirname "backend/package.json")"
cat > backend/package.json << 'EOF_CLAUDE'
{
  "name": "mesas-sillas-backend",
  "version": "1.0.0",
  "description": "API REST para gestión de mesas y sillas",
  "main": "server.js",
  "private": true,
  "license": "ISC",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js"
  },
  "dependencies": {
    "nodemailer": "^10.0.16"
  }
}
EOF_CLAUDE
echo "✔ backend/package.json"

mkdir -p "$(dirname "frontend/js/api.js")"
cat > frontend/js/api.js << 'EOF_CLAUDE'
// Punto único de comunicación con el backend.
// Nadie más en el frontend llama a fetch() directamente.

const BASE_URL = '/api';

async function solicitar(ruta, opciones = {}) {
  const respuesta = await fetch(BASE_URL + ruta, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...opciones,
  });

  let cuerpo = null;
  try {
    cuerpo = await respuesta.json();
  } catch {
    // Puede no haber cuerpo JSON.
  }

  if (!respuesta.ok) {
    const mensaje = (cuerpo && cuerpo.error) || `Error ${respuesta.status}`;
    const error = new Error(mensaje);
    error.status = respuesta.status;
    error.codigo = cuerpo && cuerpo.codigo;
    error.pago = cuerpo && cuerpo.pago;
    throw error;
  }

  return cuerpo;
}

const api = {
  // Autenticación
  login: (email, password) =>
    solicitar('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => solicitar('/auth/logout', { method: 'POST' }),
  registrarCliente: (datos) => solicitar('/auth/registro', { method: 'POST', body: JSON.stringify(datos) }),
  me: () => solicitar('/auth/me'),
  verificarCuenta: (token) => solicitar(`/auth/verificar?token=${encodeURIComponent(token)}`),
  reenviarVerificacion: (email) =>
    solicitar('/auth/reenviar-verificacion', { method: 'POST', body: JSON.stringify({ email }) }),

  // Inventario
  obtenerInventario: () => solicitar('/inventario'),
  actualizarRecurso: (id, total) =>
    solicitar(`/inventario/${id}`, { method: 'PUT', body: JSON.stringify({ total }) }),

  // Reservas
  listarReservas: () => solicitar('/reservas'),
  crearReserva: (datos) => solicitar('/reservas', { method: 'POST', body: JSON.stringify(datos) }),
  cancelarReserva: (id) => solicitar(`/reservas/${id}/cancelar`, { method: 'PUT' }),

  // Préstamos
  listarPrestamos: () => solicitar('/prestamos'),
  crearPrestamo: (datos) => solicitar('/prestamos', { method: 'POST', body: JSON.stringify(datos) }),

  // Devoluciones
  registrarDevolucion: (datos) =>
    solicitar('/devoluciones', { method: 'POST', body: JSON.stringify(datos) }),

  // Historial
  obtenerHistorial: (filtros = {}) => {
    const params = new URLSearchParams(filtros).toString();
    return solicitar(`/historial${params ? '?' + params : ''}`);
  },

  // Dashboard y reportes
  obtenerDashboard: () => solicitar('/dashboard'),
  obtenerReporte: (tipo) => solicitar(`/reportes/${tipo}`),

  // Pagos (simulados)
  crearPago: (datos) => solicitar('/pagos', { method: 'POST', body: JSON.stringify(datos) }),
  listarPagos: () => solicitar('/pagos'),

  // Usuarios
  listarUsuarios: () => solicitar('/usuarios'),
  crearUsuario: (datos) => solicitar('/usuarios', { method: 'POST', body: JSON.stringify(datos) }),
  modificarUsuario: (id, datos) =>
    solicitar(`/usuarios/${id}`, { method: 'PUT', body: JSON.stringify(datos) }),
};
EOF_CLAUDE
echo "✔ frontend/js/api.js"

mkdir -p "$(dirname "frontend/js/reservas.js")"
cat > frontend/js/reservas.js << 'EOF_CLAUDE'
(async () => {
  const usuario = await protegerPagina();
  if (!usuario) return;
  configurarLogout();

  if (usuario.rol !== 'admin') {
    document.getElementById('enlace-historial').remove();
    document.getElementById('enlace-usuarios').remove();
  }

  const mensajeForm = document.getElementById('mensaje-form');
  const mensajeLista = document.getElementById('mensaje-lista');
  const cuerpoTabla = document.getElementById('cuerpo-tabla');

  const modalPagoFondo = document.getElementById('modal-pago-fondo');
  const modalPagoMonto = document.getElementById('modal-pago-monto');
  const modalPagoMensaje = document.getElementById('modal-pago-mensaje');
  const formPago = document.getElementById('form-pago');
  const campoMetodo = document.getElementById('pago-metodo');
  const camposTarjeta = document.getElementById('campos-tarjeta');
  const PRECIO_POR_TIPO = { mesa: 5, silla: 1 };
  let reservaEnPago = null;
  let recursosPorId = {};

  // El sistema solo tiene dos recursos (mesa y silla); se obtienen sus ids reales
  // del inventario en lugar de asumirlos fijos.
  let idMesa = null;
  let idSilla = null;

  async function cargarIdsRecursos() {
    const { recursos } = await api.obtenerInventario();
    idMesa = recursos.find((r) => r.tipo === 'mesa')?.id;
    idSilla = recursos.find((r) => r.tipo === 'silla')?.id;
    recursosPorId = Object.fromEntries(recursos.map((r) => [r.id, r.tipo]));
  }

  function calcularMonto(items) {
    return items.reduce(
      (total, i) => total + i.cantidad * (PRECIO_POR_TIPO[recursosPorId[i.recurso_id]] || 0),
      0
    );
  }

  function claseEstado(estado) {
    const mapa = {
      Confirmada: 'estado--confirmada',
      Cancelada: 'estado--cancelada',
      Finalizada: 'estado--finalizada',
    };
    return mapa[estado] || '';
  }

  async function cargarReservas() {
    mensajeLista.innerHTML = '';
    try {
      const { reservas } = await api.listarReservas();
      cuerpoTabla.innerHTML = reservas
        .map((r) => {
          const recursosTexto = r.items.map((i) => `${i.cantidad} ${i.nombre}`).join(', ');
          const puedeCancelar = r.estado === 'Confirmada';
          const puedePagar = r.estado === 'Confirmada' && !r.pagado;
          const pagoTexto = r.pagado
            ? '<span class="estado estado--confirmada">Pagado</span>'
            : '<span class="estado estado--cancelada">Pendiente</span>';
          return `
          <tr>
            <td>${r.fecha.slice(0, 10)}</td>
            <td>${r.hora_inicio} – ${r.hora_fin}</td>
            <td>${recursosTexto || '—'}</td>
            <td><span class="estado ${claseEstado(r.estado)}">${r.estado}</span></td>
            <td>${pagoTexto}</td>
            <td>
              ${puedePagar ? `<button class="boton" data-pagar="${r.id}">Pagar</button>` : ''}
              ${puedeCancelar ? `<button class="boton boton--secundario" data-id="${r.id}">Cancelar</button>` : ''}
            </td>
          </tr>`;
        })
        .join('');

      cuerpoTabla.querySelectorAll('button[data-id]').forEach((boton) => {
        boton.addEventListener('click', async () => {
          if (!confirm('¿Cancelar esta reserva?')) return;
          try {
            await api.cancelarReserva(boton.dataset.id);
            await cargarReservas();
          } catch (error) {
            mensajeLista.innerHTML = `<div class="mensaje mensaje--error">${error.message}</div>`;
          }
        });
      });

      cuerpoTabla.querySelectorAll('button[data-pagar]').forEach((boton) => {
        boton.addEventListener('click', () => {
          const reserva = reservas.find((r) => r.id === Number(boton.dataset.pagar));
          abrirModalPago(reserva);
        });
      });
    } catch (error) {
      mensajeLista.innerHTML = `<div class="mensaje mensaje--error">${error.message}</div>`;
    }
  }

  document.getElementById('form-reserva').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    mensajeForm.innerHTML = '';

    const fecha = document.getElementById('fecha').value;
    const hora_inicio = document.getElementById('hora_inicio').value;
    const hora_fin = document.getElementById('hora_fin').value;
    const cantidadMesas = Number(document.getElementById('recurso_mesa').value) || 0;
    const cantidadSillas = Number(document.getElementById('recurso_silla').value) || 0;

    const items = [];
    if (cantidadMesas > 0) items.push({ recurso_id: idMesa, cantidad: cantidadMesas });
    if (cantidadSillas > 0) items.push({ recurso_id: idSilla, cantidad: cantidadSillas });

    if (items.length === 0) {
      mensajeForm.innerHTML = '<div class="mensaje mensaje--error">Indica al menos una mesa o silla.</div>';
      return;
    }

    try {
      await api.crearReserva({ fecha, hora_inicio, hora_fin, items });
      document.getElementById('form-reserva').reset();
      await cargarReservas();
      mensajeForm.innerHTML = '<div class="mensaje mensaje--exito">Reserva confirmada.</div>';
    } catch (error) {
      mensajeForm.innerHTML = `<div class="mensaje mensaje--error">${error.message}</div>`;
    }
  });

  function abrirModalPago(reserva) {
    reservaEnPago = reserva;
    modalPagoMensaje.innerHTML = '';
    formPago.reset();
    camposTarjeta.style.display = 'block';
    const monto = calcularMonto(reserva.items);
    modalPagoMonto.textContent = `Total a pagar: $${monto.toFixed(2)} (precio simulado)`;
    modalPagoFondo.classList.add('visible');
  }

  campoMetodo.addEventListener('change', () => {
    camposTarjeta.style.display = campoMetodo.value === 'tarjeta' ? 'block' : 'none';
  });

  document.getElementById('modal-pago-cancelar').addEventListener('click', () => {
    modalPagoFondo.classList.remove('visible');
  });

  formPago.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    modalPagoMensaje.innerHTML = '';

    const datos = { reserva_id: reservaEnPago.id, metodo: campoMetodo.value };
    if (datos.metodo === 'tarjeta') {
      datos.numero_tarjeta = document.getElementById('pago-numero').value.trim();
      datos.vencimiento = document.getElementById('pago-vencimiento').value.trim();
      datos.cvv = document.getElementById('pago-cvv').value.trim();
    }

    const botonPagar = document.getElementById('modal-pago-pagar');
    botonPagar.disabled = true;
    botonPagar.textContent = 'Procesando…';

    try {
      await api.crearPago(datos);
      modalPagoFondo.classList.remove('visible');
      await cargarReservas();
      mensajeLista.innerHTML = '<div class="mensaje mensaje--exito">Pago aprobado (simulado).</div>';
    } catch (error) {
      modalPagoMensaje.innerHTML = `<div class="mensaje mensaje--error">${error.message}</div>`;
    } finally {
      botonPagar.disabled = false;
      botonPagar.textContent = 'Pagar';
    }
  });

  await cargarIdsRecursos();
  await cargarReservas();
})();
EOF_CLAUDE
echo "✔ frontend/js/reservas.js"

mkdir -p "$(dirname "frontend/registro.html")"
cat > frontend/registro.html << 'EOF_CLAUDE'
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Crear cuenta — Mesas y Sillas</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@500;600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="css/estilos.css" />
  <link rel="stylesheet" href="css/componentes.css" />
</head>
<body>
  <div class="pantalla-centrada">
    <div class="contenedor contenedor--angosto">
      <div class="tarjeta">
        <h1>Crear cuenta</h1>
        <p style="color: var(--texto-suave); margin-top: -8px;">Regístrate para reservar mesas y sillas.</p>

        <div id="mensaje-registro"></div>

        <form id="form-registro">
          <div class="campo">
            <label for="nombre">Nombre</label>
            <input type="text" id="nombre" required />
          </div>
          <div class="campo">
            <label for="email">Correo</label>
            <input type="email" id="email" required autocomplete="username" />
          </div>
          <div class="campo">
            <label for="password">Contraseña</label>
            <input type="password" id="password" minlength="6" required autocomplete="new-password" />
          </div>
          <button type="submit" class="boton boton--ancho" id="boton-registro">Crear cuenta</button>
        </form>

        <p style="color: var(--texto-suave); font-size: 0.85rem; margin-top: var(--espacio-md); margin-bottom: 0;">
          ¿Ya tienes cuenta? <a href="index.html">Inicia sesión</a>
        </p>
      </div>
      <p style="text-align: center; margin-top: var(--espacio-md);">
        <a href="inicio.html" style="color: var(--texto-suave); font-size: 0.85rem; text-decoration: none;">← Volver al inicio</a>
      </p>
    </div>
  </div>

  <script src="js/api.js"></script>
  <script>
    const form = document.getElementById('form-registro');
    const mensaje = document.getElementById('mensaje-registro');
    const boton = document.getElementById('boton-registro');

    form.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      mensaje.innerHTML = '';
      boton.disabled = true;
      boton.textContent = 'Creando cuenta…';

      const nombre = document.getElementById('nombre').value.trim();
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;

      try {
        const { mensaje: texto } = await api.registrarCliente({ nombre, email, password });
        form.reset();
        form.style.display = 'none';
        mensaje.innerHTML = `<div class="mensaje mensaje--exito">${texto}</div>`;
      } catch (error) {
        mensaje.innerHTML = `<div class="mensaje mensaje--error">${error.message}</div>`;
        boton.disabled = false;
        boton.textContent = 'Crear cuenta';
      }
    });
  </script>
</body>
</html>
EOF_CLAUDE
echo "✔ frontend/registro.html"

mkdir -p "$(dirname "frontend/index.html")"
cat > frontend/index.html << 'EOF_CLAUDE'
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Iniciar sesión — Mesas y Sillas</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@500;600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="css/estilos.css" />
  <link rel="stylesheet" href="css/componentes.css" />
</head>
<body>
  <div class="pantalla-centrada">
    <div class="contenedor contenedor--angosto">
      <div class="tarjeta">
        <h1>Mesas y Sillas</h1>
        <p style="color: var(--texto-suave); margin-top: -8px;">Inicia sesión para continuar.</p>

        <div id="mensaje-login"></div>

        <form id="form-login">
          <div class="campo">
            <label for="email">Correo</label>
            <input type="email" id="email" required autocomplete="username" />
          </div>
          <div class="campo">
            <label for="password">Contraseña</label>
            <input type="password" id="password" required autocomplete="current-password" />
          </div>
          <button type="submit" class="boton boton--ancho" id="boton-login">Iniciar sesión</button>
        </form>

        <p style="color: var(--texto-suave); font-size: 0.85rem; margin-top: var(--espacio-md); margin-bottom: 0;">
          ¿No tienes una cuenta? <a href="registro.html">Crea una aquí</a>.
        </p>
      </div>
    </div>
  </div>

  <script src="js/api.js"></script>
  <script>
    const form = document.getElementById('form-login');
    const mensaje = document.getElementById('mensaje-login');
    const boton = document.getElementById('boton-login');

    // Si ya hay sesión activa, no mostrar el login.
    api.me().then(() => {
      window.location.href = 'inicio.html';
    }).catch(() => {});

    form.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      mensaje.innerHTML = '';
      boton.disabled = true;
      boton.textContent = 'Ingresando…';

      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;

      try {
        await api.login(email, password);
        window.location.href = 'inicio.html';
      } catch (error) {
        if (error.codigo === 'CUENTA_NO_VERIFICADA') {
          mensaje.innerHTML = `<div class="mensaje mensaje--error">${error.message}</div>
            <p style="font-size: 0.85rem; margin-top: 4px;">
              <a href="verificar.html">Reenviar correo de verificación</a>
            </p>`;
        } else {
          mensaje.innerHTML = `<div class="mensaje mensaje--error">${error.message}</div>`;
        }
        boton.disabled = false;
        boton.textContent = 'Iniciar sesión';
      }
    });
  </script>
</body>
</html>
EOF_CLAUDE
echo "✔ frontend/index.html"

mkdir -p "$(dirname "frontend/reservas.html")"
cat > frontend/reservas.html << 'EOF_CLAUDE'
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reservas — Mesas y Sillas</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@500;600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="css/estilos.css" />
  <link rel="stylesheet" href="css/componentes.css" />
</head>
<body>
  <nav class="barra-nav">
    <a href="inicio.html" class="barra-nav__marca">Mesas y Sillas</a>
    <div class="barra-nav__enlaces">
      <a href="dashboard.html" id="enlace-dashboard">Dashboard</a>
      <a href="inventario.html">Inventario</a>
      <a href="reservas.html" class="activo">Reservas</a>
      <a href="prestamos.html">Préstamos</a>
      <a href="historial.html" id="enlace-historial">Historial</a>
      <a href="usuarios.html" id="enlace-usuarios">Usuarios</a>
    </div>
    <div class="barra-nav__usuario">
      <span id="usuario-actual"></span>
      <button class="boton boton--secundario" id="boton-logout">Salir</button>
    </div>
  </nav>

  <main class="contenedor">
    <h1>Reservas</h1>

    <div class="tarjeta">
      <h2>Nueva reserva</h2>
      <div id="mensaje-form"></div>
      <form id="form-reserva">
        <div class="form-fila">
          <div class="campo">
            <label for="fecha">Fecha</label>
            <input type="date" id="fecha" required />
          </div>
          <div class="campo"></div>
          <div class="campo">
            <label for="hora_inicio">Hora de inicio</label>
            <input type="time" id="hora_inicio" required />
          </div>
          <div class="campo">
            <label for="hora_fin">Hora de fin</label>
            <input type="time" id="hora_fin" required />
          </div>
        </div>
        <div class="form-fila">
          <div class="campo">
            <label for="recurso_mesa">Mesas a reservar</label>
            <input type="number" id="recurso_mesa" min="0" value="0" />
          </div>
          <div class="campo">
            <label for="recurso_silla">Sillas a reservar</label>
            <input type="number" id="recurso_silla" min="0" value="0" />
          </div>
        </div>
        <button type="submit" class="boton">Confirmar reserva</button>
      </form>
    </div>

    <div class="tarjeta">
      <div class="barra-acciones">
        <h2 style="margin: 0;">Mis reservas</h2>
      </div>
      <div id="mensaje-lista"></div>
      <div class="tabla-scroll">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Horario</th>
              <th>Recursos</th>
              <th>Estado</th>
              <th>Pago</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="cuerpo-tabla"></tbody>
        </table>
      </div>
    </div>
  </main>

  <div class="modal-fondo" id="modal-pago-fondo">
    <div class="modal">
      <h3>Pagar reserva (simulado)</h3>
      <p id="modal-pago-monto" style="color: var(--texto-suave); margin-top: -8px;"></p>
      <div id="modal-pago-mensaje"></div>
      <form id="form-pago">
        <div class="campo">
          <label for="pago-metodo">Método de pago</label>
          <select id="pago-metodo">
            <option value="tarjeta">Tarjeta</option>
            <option value="transferencia">Transferencia</option>
          </select>
        </div>
        <div id="campos-tarjeta">
          <div class="campo">
            <label for="pago-numero">Número de tarjeta</label>
            <input type="text" id="pago-numero" placeholder="4111 1111 1111 1111" maxlength="19" />
          </div>
          <div class="form-fila">
            <div class="campo">
              <label for="pago-vencimiento">Vencimiento</label>
              <input type="text" id="pago-vencimiento" placeholder="MM/AA" maxlength="5" />
            </div>
            <div class="campo">
              <label for="pago-cvv">CVV</label>
              <input type="text" id="pago-cvv" placeholder="123" maxlength="4" />
            </div>
          </div>
          <p style="color: var(--texto-suave); font-size: 0.8rem;">
            Pasarela simulada: cualquier tarjeta funciona, excepto una que termine en "0000" (simula un rechazo).
          </p>
        </div>
        <div class="modal__acciones">
          <button type="button" class="boton boton--secundario" id="modal-pago-cancelar">Cancelar</button>
          <button type="submit" class="boton" id="modal-pago-pagar">Pagar</button>
        </div>
      </form>
    </div>
  </div>

  <script src="js/api.js"></script>
  <script src="js/auth.js"></script>
  <script src="js/reservas.js"></script>
</body>
</html>
EOF_CLAUDE
echo "✔ frontend/reservas.html"

mkdir -p "$(dirname "frontend/verificar.html")"
cat > frontend/verificar.html << 'EOF_CLAUDE'
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Verificar cuenta — Mesas y Sillas</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@500;600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="css/estilos.css" />
  <link rel="stylesheet" href="css/componentes.css" />
</head>
<body>
  <div class="pantalla-centrada">
    <div class="contenedor contenedor--angosto">
      <div class="tarjeta">
        <h1>Verificación de cuenta</h1>
        <div id="resultado">
          <p style="color: var(--texto-suave);">Verificando tu correo…</p>
        </div>

        <div id="bloque-reenviar" style="display: none; margin-top: var(--espacio-md);">
          <p style="color: var(--texto-suave); font-size: 0.9rem;">¿El enlace venció? Escribe tu correo y te enviamos uno nuevo.</p>
          <div class="campo">
            <label for="email-reenviar">Correo</label>
            <input type="email" id="email-reenviar" required />
          </div>
          <button class="boton boton--ancho" id="boton-reenviar">Reenviar verificación</button>
          <div id="mensaje-reenviar"></div>
        </div>

        <p style="color: var(--texto-suave); font-size: 0.85rem; margin-top: var(--espacio-md); margin-bottom: 0;">
          <a href="index.html">Ir a iniciar sesión</a>
        </p>
      </div>
    </div>
  </div>

  <script src="js/api.js"></script>
  <script>
    const resultado = document.getElementById('resultado');
    const bloqueReenviar = document.getElementById('bloque-reenviar');
    const mensajeReenviar = document.getElementById('mensaje-reenviar');

    (async () => {
      const token = new URLSearchParams(window.location.search).get('token');

      if (!token) {
        resultado.innerHTML = '<div class="mensaje mensaje--error">Falta el token de verificación en el enlace.</div>';
        bloqueReenviar.style.display = 'block';
        return;
      }

      try {
        const { mensaje } = await api.verificarCuenta(token);
        resultado.innerHTML = `<div class="mensaje mensaje--exito">${mensaje}</div>`;
      } catch (error) {
        resultado.innerHTML = `<div class="mensaje mensaje--error">${error.message}</div>`;
        bloqueReenviar.style.display = 'block';
      }
    })();

    document.getElementById('boton-reenviar').addEventListener('click', async () => {
      mensajeReenviar.innerHTML = '';
      const email = document.getElementById('email-reenviar').value.trim();
      if (!email) return;

      try {
        const { mensaje } = await api.reenviarVerificacion(email);
        mensajeReenviar.innerHTML = `<div class="mensaje mensaje--exito">${mensaje}</div>`;
      } catch (error) {
        mensajeReenviar.innerHTML = `<div class="mensaje mensaje--error">${error.message}</div>`;
      }
    });
  </script>
</body>
</html>
EOF_CLAUDE
echo "✔ frontend/verificar.html"

# --- Variables de entorno nuevas (solo las agrega si no existen ya) ---
touch backend/.env
grep -q '^EMAIL_HOST=' backend/.env || echo 'EMAIL_HOST=' >> backend/.env
grep -q '^EMAIL_PORT=' backend/.env || echo 'EMAIL_PORT=587' >> backend/.env
grep -q '^EMAIL_USER=' backend/.env || echo 'EMAIL_USER=' >> backend/.env
grep -q '^EMAIL_PASS=' backend/.env || echo 'EMAIL_PASS=' >> backend/.env
grep -q '^EMAIL_FROM=' backend/.env || echo 'EMAIL_FROM=' >> backend/.env
grep -q '^FRONTEND_URL=' backend/.env || echo 'FRONTEND_URL=http://localhost:3000' >> backend/.env
echo "✔ backend/.env actualizado (completa EMAIL_HOST, EMAIL_USER, EMAIL_PASS con tus datos SMTP)"

# --- Instala nodemailer en backend/ ---
(cd backend && npm install)

# --- Aplica la migración de verificación y pagos en la base de datos ---
node backend/migrar.js

echo ""
echo "Listo. Antes de seguir:"
echo "1) Edita backend/.env y completa EMAIL_HOST/EMAIL_USER/EMAIL_PASS (o déjalo vacío para que el enlace de verificación salga en la consola del servidor, útil en local)."
echo "2) Reinicia el servidor: cd backend && npm run dev"
echo "3) Prueba registrando una cuenta nueva y mira el enlace de verificación en la consola (si no configuraste SMTP) o en tu correo."
