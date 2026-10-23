const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

pool.query(`SELECT * FROM facturas ORDER BY id DESC LIMIT 5`)
  .then((res) => {
    res.rows.forEach((r) => console.log(JSON.stringify(r, null, 2)));
    return pool.end();
  })
  .catch((err) => {
    console.error('Error consultando facturas:', err.message);
    pool.end();
    process.exit(1);
  });
