// Punto de entrada: comprueba la base de datos y arranca el servidor HTTP.
const app = require('./app');
const { probarConexion } = require('./db');

const PORT = process.env.PORT || 3000;

async function iniciar() {
  try {
    await probarConexion();
    app.listen(PORT, () => {
      console.log(`Servidor escuchando en http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('No se pudo conectar a la base de datos:', err.message);
    process.exit(1);
  }
}

iniciar();
