-- Migración: convierte la tabla "facturas" (antes solo un correlativo simple)
-- en un documento con el layout que exige la ley salvadoreña para los dos
-- tipos de documento más comunes de un negocio minorista:
--   01 = Factura de Consumidor Final (Art. 107 Código Tributario)
--   03 = Comprobante de Crédito Fiscal (Art. 114 Código Tributario)
--
-- IMPORTANTE: esto NO convierte el sistema en un emisor de DTE (Documento
-- Tributario Electrónico) ante el Ministerio de Hacienda. Un DTE real exige
-- firmarse con un certificado digital propio y transmitirse a la API de
-- Hacienda (MH) para obtener sello de recepción; aquí no se hace ninguna de
-- las dos cosas. Lo que esta migración agrega es el MODELO/FORMATO correcto
-- (los campos obligatorios) para que el documento que se envía por correo
-- luzca y contenga lo que exige la ley. Se mantiene el aviso de "documento
-- no válido fiscalmente" en el PDF/correo mientras no se integre con la API
-- de Hacienda.

ALTER TABLE facturas
  ADD COLUMN IF NOT EXISTS tipo_dte             VARCHAR(2)  NOT NULL DEFAULT '01'
      CHECK (tipo_dte IN ('01', '03')), -- 01 Consumidor Final, 03 Crédito Fiscal
  ADD COLUMN IF NOT EXISTS serie                VARCHAR(4)  NOT NULL DEFAULT 'A',
  ADD COLUMN IF NOT EXISTS correlativo          INTEGER,
  ADD COLUMN IF NOT EXISTS condicion_operacion  VARCHAR(10) NOT NULL DEFAULT 'CONTADO'
      CHECK (condicion_operacion IN ('CONTADO', 'CREDITO')),
  -- Datos del receptor (obligatorios y detallados solo para Crédito Fiscal;
  -- en Consumidor Final la ley solo exige nombre si el cliente lo solicita)
  ADD COLUMN IF NOT EXISTS cliente_nombre       VARCHAR(150),
  ADD COLUMN IF NOT EXISTS cliente_nit          VARCHAR(17),
  ADD COLUMN IF NOT EXISTS cliente_dui          VARCHAR(10),
  ADD COLUMN IF NOT EXISTS cliente_nrc          VARCHAR(10),
  ADD COLUMN IF NOT EXISTS cliente_giro         VARCHAR(150),
  ADD COLUMN IF NOT EXISTS cliente_direccion    VARCHAR(255),
  -- Desglose de IVA (Ley de IVA, Art. 55: en Consumidor Final el precio ya
  -- incluye el 13%; en Crédito Fiscal se factura el valor gravado + IVA aparte)
  ADD COLUMN IF NOT EXISTS monto_gravado        NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS monto_iva            NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS monto_exento         NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_total          NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS total_en_letras       VARCHAR(255);

-- Correlativo independiente por tipo de documento (exigido por ley: cada
-- tipo de documento lleva su propia numeración correlativa, Art. 115-A C.T.)
CREATE SEQUENCE IF NOT EXISTS facturas_cf_correlativo_seq  START 1; -- 01 Consumidor Final
CREATE SEQUENCE IF NOT EXISTS facturas_ccf_correlativo_seq START 1; -- 03 Crédito Fiscal

-- Respaldo de datos existentes: todo lo que ya estaba se trata como
-- Consumidor Final (tipo_dte = '01') y se le asigna correlativo retroactivo.
UPDATE facturas
SET correlativo = nextval('facturas_cf_correlativo_seq'),
    monto_total = monto,
    monto_gravado = ROUND(monto / 1.13, 2),
    monto_iva = monto - ROUND(monto / 1.13, 2)
WHERE correlativo IS NULL;

CREATE INDEX IF NOT EXISTS idx_facturas_tipo_dte ON facturas (tipo_dte);
