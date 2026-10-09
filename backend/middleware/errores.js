// Respuesta uniforme para rutas que no existen.
function rutaNoEncontrada(req, res) {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
}

// Captura cualquier error lanzado en controladores o servicios.
// Express lo reconoce por tener cuatro parámetros.
// eslint-disable-next-line no-unused-vars
function manejarErrores(err, req, res, next) {
  const estado = err.status || 500;
  const mensaje =
    estado === 500 && process.env.NODE_ENV === 'production'
      ? 'Error interno del servidor'
      : err.message;

  if (estado === 500) {
    console.error(err);
  }

  const cuerpo = { error: mensaje };
  if (err.codigo) cuerpo.codigo = err.codigo;
  if (err.pago) cuerpo.pago = err.pago;
  res.status(estado).json(cuerpo);
}

module.exports = { rutaNoEncontrada, manejarErrores };
