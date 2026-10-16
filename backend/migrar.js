require('dotenv').config({ path: __dirname + '/.env' });
const fs = require('fs');
const { pool } = require('./db');

// Uso: node migrar.js [nombre-del-archivo.sql]
// Por defecto aplica migracion_incidencias.sql (la última en agregarse).
async function migrar() {
  const archivo = process.argv[2] || 'migracion_incidencias.sql';
  const sql = fs.readFileSync(__dirname + '/' + archivo, 'utf8');
  await pool.query(sql);
  console.log(`Migración "${archivo}" aplicada correctamente`);
  process.exit(0);
}

migrar().catch(err => {
  console.error('Error en la migración:', err);
  process.exit(1);
});
