CREATE TABLE IF NOT EXISTS facturas (
  id          SERIAL PRIMARY KEY,
  numero      VARCHAR(20) UNIQUE,
  pago_id     INTEGER NOT NULL REFERENCES pagos(id),
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id),
  reserva_id  INTEGER NOT NULL REFERENCES reservas(id),
  monto       NUMERIC(10,2) NOT NULL,
  enviada     BOOLEAN NOT NULL DEFAULT FALSE,
  creado_en   TIMESTAMP NOT NULL DEFAULT NOW()
);
