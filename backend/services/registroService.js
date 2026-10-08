// Registro público: cualquier persona puede crear su propia cuenta,
// siempre con el rol "usuario". Crear administradores sigue siendo
// exclusivo del panel de usuarios (solo accesible para un admin ya logueado).
const bcrypt = require('bcryptjs');
const { pool } = require('../db');

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

  const { rows } = await pool.query(
    `INSERT INTO usuarios (nombre, email, password_hash, rol_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id, nombre, email`,
    [nombre.trim(), correo, hash, rolRows[0].id]
  );

  return { ...rows[0], rol: 'usuario' };
}

module.exports = { registrarCliente };
