// Crea el usuario administrador inicial. Se puede ejecutar varias veces sin duplicarlo.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('./db');

async function crearAdmin() {
  const { ADMIN_NOMBRE, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error('Define ADMIN_EMAIL y ADMIN_PASSWORD en el archivo .env');
  }

  const { rows } = await pool.query("SELECT id FROM roles WHERE nombre = 'admin'");
  const rolAdminId = rows[0].id;
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  await pool.query(
    `INSERT INTO usuarios (nombre, email, password_hash, rol_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO NOTHING`,
    [ADMIN_NOMBRE || 'Administrador', ADMIN_EMAIL.toLowerCase(), hash, rolAdminId]
  );

  console.log('Administrador listo:', ADMIN_EMAIL);
}

crearAdmin()
  .catch((err) => console.error('Error al crear el administrador:', err.message))
  .finally(() => pool.end());
