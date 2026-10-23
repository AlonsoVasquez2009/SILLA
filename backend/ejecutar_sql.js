const fs = require('fs');
const { Pool } = require('pg');
require('dotenv').config();

const archivo = process.argv[2];
if (!archivo) {
  console.error('Uso: node ejecutar_sql.js ruta/al/archivo.sql');
  process.exit(1);
}

const sql = fs.readFileSync(archivo, 'utf8');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

pool.query(sql)
  .then(() => {
    console.log(`OK: ${archivo} ejecutado correctamente.`);
    return pool.end();
  })
  .catch((err) => {
    console.error('Error ejecutando el SQL:', err.message);
    pool.end();
    process.exit(1);
  });
