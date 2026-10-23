const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

pool.query(
  `SELECT column_name, data_type
   FROM information_schema.columns
   WHERE table_name = 'facturas'
   ORDER BY ordinal_position`
)
  .then((res) => {
    console.table(res.rows);
    return pool.end();
  })
  .catch((err) => {
    console.error('Error consultando columnas:', err.message);
    pool.end();
    process.exit(1);
  });
