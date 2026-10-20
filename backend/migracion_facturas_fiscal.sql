-- Datos fiscales del emisor (tu negocio) y del receptor (cliente)
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS tipo_dte VARCHAR(2) NOT NULL DEFAULT '01';
-- '01' = Factura de Consumidor Final, '03' = Comprobante de Crédito Fiscal
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS nombre_receptor VARCHAR(150);
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS nit_receptor VARCHAR(20);
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS nrc_receptor VARCHAR(20);
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS giro_receptor VARCHAR(150);
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS direccion_receptor VARCHAR(255);
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS subtotal NUMERIC(10,2);
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS iva NUMERIC(10,2);
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS total NUMERIC(10,2);
