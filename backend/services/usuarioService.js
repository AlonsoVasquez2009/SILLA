// Reglas de negocio de usuarios. Solo el admin gestiona esto (se exige en las rutas).
const bcrypt = require('bcryptjs');
const { pool } = require('../db');

async function listarUsuarios() {
  const { rows } = await pool.query(
    `SELECT u.id, u.nombre, u.email, u.activo, u.created_at, r.nombre AS rol
     FROM usuarios u
     JOIN roles r ON r.id = u.rol_id
     ORDER BY u.nombre`
  );
  return rows;
}

async function crearUsuario({ nombre, email, password, rol }) {
  if (!nombre || !email || !password || !rol) {
    const error = new Error('Nombre, correo, contraseña y rol son obligatorios');
    error.status = 400;
    throw error;
  }
  if (password.length < 6) {
    const error = new Error('La contraseña debe tener al menos 6 caracteres');
    error.status = 400;
    throw error;
  }

  const { rows: rolRows } = await pool.query('SELECT id FROM roles WHERE nombre = $1', [rol]);
  if (rolRows.length === 0) {
    const error = new Error(`Rol desconocido: "${rol}"`);
    error.status = 400;
    throw error;
  }

  const { rows: existente } = await pool.query('SELECT id FROM usuarios WHERE email = $1', [
    email.toLowerCase(),
  ]);
  if (existente.length > 0) {
    const error = new Error('Ya existe un usuario con ese correo');
    error.status = 409;
    throw error;
  }

  const hash = await bcrypt.hash(password, 10);
  const { rows } = await pool.query(
    `INSERT INTO usuarios (nombre, email, password_hash, rol_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id, nombre, email, activo, created_at`,
    [nombre, email.toLowerCase(), hash, rolRows[0].id]
  );

  return { ...rows[0], rol };
}

// Permite activar/desactivar y cambiar el rol de un usuario.
async function modificarUsuario(id, { activo, rol }) {
  const campos = [];
  const valores = [];

  if (typeof activo === 'boolean') {
    valores.push(activo);
    campos.push(`activo = $${valores.length}`);
  }
  if (rol) {
    const { rows: rolRows } = await pool.query('SELECT id FROM roles WHERE nombre = $1', [rol]);
    if (rolRows.length === 0) {
      const error = new Error(`Rol desconocido: "${rol}"`);
      error.status = 400;
      throw error;
    }
    valores.push(rolRows[0].id);
    campos.push(`rol_id = $${valores.length}`);
  }

  if (campos.length === 0) {
    const error = new Error('No hay cambios para aplicar');
    error.status = 400;
    throw error;
  }

  valores.push(id);
  const { rows } = await pool.query(
    `UPDATE usuarios SET ${campos.join(', ')} WHERE id = $${valores.length}
     RETURNING id, nombre, email, activo`,
    valores
  );

  if (rows.length === 0) {
    const error = new Error('Usuario no encontrado');
    error.status = 404;
    throw error;
  }

  return rows[0];
}

module.exports = { listarUsuarios, crearUsuario, modificarUsuario };
