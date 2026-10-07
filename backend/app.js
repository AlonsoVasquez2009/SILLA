require('dotenv').config();
const express = require('express');
const session = require('express-session');
const { rutaNoEncontrada, manejarErrores } = require('./middleware/errores');
const authRoutes = require('./routes/authRoutes');
const inventarioRoutes = require('./routes/inventarioRoutes');
const reservaRoutes = require('./routes/reservaRoutes');

const app = express();

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

app.use(rutaNoEncontrada);
app.use(manejarErrores);

module.exports = app;
