// Reglas de negocio de autenticación: buscar usuario y verificar contraseña.
const bcrypt = require('bcryptjs');
const { pool } = require('../db');

// Devuelve los datos públicos del usuario si las credenciales son correctas.
// Si fallan, lanza un error genérico para no revelar si el correo existe.
async function iniciarSesion(email, password) {
  const consulta = `
    SELECT u.id, u.nombre, u.email, u.password_hash, u.activo, r.nombre AS rol
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

  return { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol };
}

module.exports = { iniciarSesion };
