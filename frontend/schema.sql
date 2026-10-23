
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
  tipo_dte              VARCHAR(2)  NOT NULL DEFAULT '01' CHECK (tipo_dte IN ('01', '03')),
  serie                 VARCHAR(4)  NOT NULL DEFAULT 'A',
  correlativo           INTEGER,
  condicion_operacion   VARCHAR(10) NOT NULL DEFAULT 'CONTADO' CHECK (condicion_operacion IN ('CONTADO', 'CREDITO')),
  cliente_nombre        VARCHAR(150),
  cliente_nit           VARCHAR(17),
  cliente_dui           VARCHAR(10),
  cliente_nrc           VARCHAR(10),
  cliente_giro          VARCHAR(150),
  cliente_direccion     VARCHAR(255),
  monto_gravado         NUMERIC(10,2),
  monto_iva             NUMERIC(10,2),
  monto_exento          NUMERIC(10,2) NOT NULL DEFAULT 0,
  monto_total           NUMERIC(10,2),
  total_en_letras       VARCHAR(255),
  creado_en             TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE SEQUENCE IF NOT EXISTS facturas_cf_correlativo_seq  START 1;
CREATE SEQUENCE IF NOT EXISTS facturas_ccf_correlativo_seq START 1;
CREATE INDEX IF NOT EXISTS idx_facturas_tipo_dte ON facturas (tipo_dte);
