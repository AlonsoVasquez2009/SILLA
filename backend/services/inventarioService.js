// Reglas de negocio del inventario: es la única parte del sistema
// que debe modificar las cantidades de recursos.
const { pool } = require('../db');

async function listarInventario() {
  const { rows } = await pool.query(
    `SELECT id, nombre, tipo, total, disponibles, reservados, prestados
     FROM recursos
     ORDER BY tipo, nombre`
  );
  return rows;
}

// Cambia el total de un recurso. El total nuevo no puede ser menor
// que lo que ya está reservado o prestado, porque esos recursos
// existen físicamente y están comprometidos.
async function actualizarTotal(id, nuevoTotal) {
  if (!Number.isInteger(nuevoTotal) || nuevoTotal < 0) {
    const error = new Error('El total debe ser un número entero mayor o igual a 0');
    error.status = 400;
    throw error;
  }

  const { rows } = await pool.query('SELECT * FROM recursos WHERE id = $1', [id]);
  const recurso = rows[0];

  if (!recurso) {
    const error = new Error('Recurso no encontrado');
    error.status = 404;
    throw error;
  }

  // Lo reservado a futuro ya no bloquea el total: solo lo que está
  // físicamente prestado ahora mismo compromete el inventario de verdad.
  const comprometido = recurso.prestados;
  if (nuevoTotal < comprometido) {
    const error = new Error(
      `No se puede bajar el total a ${nuevoTotal}: hay ${comprometido} unidades prestadas`
    );
    error.status = 409;
    throw error;
  }

  const nuevoDisponibles = nuevoTotal - comprometido;

  const actualizado = await pool.query(
    `UPDATE recursos
     SET total = $1, disponibles = $2
     WHERE id = $3
     RETURNING id, nombre, tipo, total, disponibles, reservados, prestados`,
    [nuevoTotal, nuevoDisponibles, id]
  );

  return actualizado.rows[0];
}

module.exports = { listarInventario, actualizarTotal };
