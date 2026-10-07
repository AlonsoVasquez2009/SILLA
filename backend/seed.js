// Crea el usuario administrador y el inventario inicial.
// Se puede ejecutar varias veces sin duplicar nada.
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

async function crearInventarioInicial() {
  const recursos = [
    { nombre: 'Mesa estándar', tipo: 'mesa', total: 20 },
    { nombre: 'Silla estándar', tipo: 'silla', total: 100 },
  ];

  for (const r of recursos) {
    await pool.query(
      `INSERT INTO recursos (nombre, tipo, total, disponibles, reservados, prestados)
       VALUES ($1, $2, $3, $3, 0, 0)
       ON CONFLICT (nombre) DO NOTHING`,
      [r.nombre, r.tipo, r.total]
    );
  }

  console.log('Inventario inicial listo: 20 mesas, 100 sillas');
}

async function iniciar() {
  await crearAdmin();
  await crearInventarioInicial();
}

iniciar()
  .catch((err) => console.error('Error al poblar la base de datos:', err.message))
  .finally(() => pool.end());
