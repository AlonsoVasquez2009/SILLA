// Conexión centralizada a PostgreSQL (Neon).
// El resto del proyecto importa "pool" desde aquí; nadie más crea conexiones.
require('dotenv').config();
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('Falta la variable DATABASE_URL en el archivo .env');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
});

// Comprueba la conexión al arrancar y muestra un mensaje claro si falla.
async function probarConexion() {
  const cliente = await pool.connect();
  try {
    const resultado = await cliente.query('SELECT NOW() AS ahora');
    console.log('Conectado a Neon. Hora del servidor:', resultado.rows[0].ahora);
  } finally {
    cliente.release();
  }
}

module.exports = { pool, probarConexion };
