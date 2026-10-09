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
