-- Agrega el soporte de Factura de Consumidor Final (01) y Comprobante de
-- Crédito Fiscal (03) a la tabla "facturas". Usa IF NOT EXISTS en todo, así
-- que es seguro correrla aunque algunas columnas ya existan (como pasa en
-- la base de producción actual, donde otra sesión ya las había agregado).
ALTER TABLE facturas
  ADD COLUMN IF NOT EXISTS tipo_dte              VARCHAR(2)   NOT NULL DEFAULT '01', -- 01 Consumidor Final, 03 Crédito Fiscal
  ADD COLUMN IF NOT EXISTS nombre_receptor        VARCHAR(150),
  ADD COLUMN IF NOT EXISTS nit_receptor           VARCHAR(20),
  ADD COLUMN IF NOT EXISTS nrc_receptor           VARCHAR(20),
  ADD COLUMN IF NOT EXISTS giro_receptor          VARCHAR(150),
  ADD COLUMN IF NOT EXISTS direccion_receptor     VARCHAR(255),
  -- Desglose de IVA (Ley de IVA, Art. 55): en Consumidor Final el precio ya
  -- incluye el 13%, así que se desglosa "hacia adentro" (subtotal = monto / 1.13).
  ADD COLUMN IF NOT EXISTS subtotal               NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS iva                    NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS total                  NUMERIC(10,2);

-- Respaldo de datos existentes que no tengan el desglose calculado.
UPDATE facturas
SET total = monto,
    subtotal = ROUND(monto / 1.13, 2),
    iva = monto - ROUND(monto / 1.13, 2)
WHERE subtotal IS NULL;

CREATE INDEX IF NOT EXISTS idx_facturas_tipo_dte ON facturas (tipo_dte);
