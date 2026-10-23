require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const { rutaNoEncontrada, manejarErrores } = require('./middleware/errores');
const authRoutes = require('./routes/authRoutes');
const inventarioRoutes = require('./routes/inventarioRoutes');
const reservaRoutes = require('./routes/reservaRoutes');
const prestamoRoutes = require('./routes/prestamoRoutes');
const devolucionRoutes = require('./routes/devolucionRoutes');
const historialRoutes = require('./routes/historialRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const reporteRoutes = require('./routes/reporteRoutes');
const usuarioRoutes = require('./routes/usuarioRoutes');
const pagoRoutes = require('./routes/pagoRoutes');
const incidenciaRoutes = require('./routes/incidenciaRoutes');
const trabajadorRoutes = require('./routes/trabajadorRoutes');
const salarioRoutes = require('./routes/salarioRoutes');

const app = express();

// Render (y la mayoría de hosts) ponen la app detrás de un proxy/balanceador.
// Sin esto, Express no detecta HTTPS y las cookies 'secure' de la sesión
// nunca se guardan en produccion, rompiendo el login.
app.set('trust proxy', 1);

app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'desarrollo-inseguro',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 8,
    },
  })
);

app.get('/api/salud', (req, res) => {
  res.json({ estado: 'ok', fecha: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/inventario', inventarioRoutes);
app.use('/api/reservas', reservaRoutes);
app.use('/api/prestamos', prestamoRoutes);
app.use('/api/devoluciones', devolucionRoutes);
app.use('/api/historial', historialRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reportes', reporteRoutes);
app.use('/api/usuarios', usuarioRoutes);
app.use('/api/pagos', pagoRoutes);
app.use('/api/incidencias', incidenciaRoutes);
app.use('/api/trabajadores', trabajadorRoutes);
app.use('/api/salarios', salarioRoutes);

app.use(express.static(path.join(__dirname, '..', 'frontend')));

app.use('/api', rutaNoEncontrada);
app.use(rutaNoEncontrada);

app.use(manejarErrores);

module.exports = app;
