
-- NOTA: este archivo es un duplicado histórico; la fuente de verdad del
-- esquema es backend/schema.sql. Se actualiza igual para no dejarlo
-- desincronizado.
CREATE TABLE IF NOT EXISTS facturas (
  id                    SERIAL PRIMARY KEY,
  numero                VARCHAR(20) UNIQUE,
  pago_id               INTEGER NOT NULL REFERENCES pagos(id),
  usuario_id            INTEGER NOT NULL REFERENCES usuarios(id),
  reserva_id            INTEGER NOT NULL REFERENCES reservas(id),
  monto                 NUMERIC(10,2) NOT NULL,
  enviada               BOOLEAN NOT NULL DEFAULT FALSE,
  tipo_dte              VARCHAR(2)  NOT NULL DEFAULT '01',
  nombre_receptor       VARCHAR(150),
  nit_receptor          VARCHAR(20),
  nrc_receptor          VARCHAR(20),
  giro_receptor         VARCHAR(150),
  direccion_receptor    VARCHAR(255),
  subtotal              NUMERIC(10,2),
  iva                   NUMERIC(10,2),
  total                 NUMERIC(10,2),
  creado_en             TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_facturas_tipo_dte ON facturas (tipo_dte);
