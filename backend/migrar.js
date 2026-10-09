require('dotenv').config({ path: __dirname + '/.env' });
const fs = require('fs');
const db = require('./db');

async function migrar() {
  const sql = fs.readFileSync(__dirname + '/migracion_verificacion_pagos.sql', 'utf8');
  await db.query(sql);
  console.log('Migración aplicada correctamente');
  process.exit(0);
}

migrar().catch(err => {
  console.error('Error en la migración:', err);
  process.exit(1);
});
