// Datos del EMISOR que la ley exige mostrar en toda factura o comprobante
// de crédito fiscal (Art. 114 Código Tributario): nombre/razón social,
// NIT, NRC, giro o actividad económica y dirección del establecimiento.
//
// Se leen de variables de entorno para que cada quien configure los datos
// reales de su negocio sin tocar código. Agrega estas variables en tu
// backend/.env (y en Render → Environment si está en producción):
//
//   EMPRESA_NOMBRE="RENTSERES, S.A. DE C.V."
//   EMPRESA_NOMBRE_COMERCIAL="RENTSERES"
//   EMPRESA_NIT="0614-010190-101-2"
//   EMPRESA_NRC="123456-7"
//   EMPRESA_GIRO="Alquiler de mesas, sillas y mobiliario para eventos"
//   EMPRESA_DIRECCION="Calle Principal, Local 5"
//   EMPRESA_MUNICIPIO="San Salvador"
//   EMPRESA_DEPARTAMENTO="San Salvador"
//   EMPRESA_TELEFONO="2200-0000"

const empresa = {
  nombre: process.env.EMPRESA_NOMBRE || 'RENTSERES (Razón social pendiente de configurar)',
  nombreComercial: process.env.EMPRESA_NOMBRE_COMERCIAL || 'RENTSERES',
  nit: process.env.EMPRESA_NIT || 'PENDIENTE',
  nrc: process.env.EMPRESA_NRC || 'PENDIENTE',
  giro: process.env.EMPRESA_GIRO || 'Alquiler de mobiliario para eventos',
  direccion: process.env.EMPRESA_DIRECCION || 'Dirección pendiente de configurar',
  municipio: process.env.EMPRESA_MUNICIPIO || 'San Salvador',
  departamento: process.env.EMPRESA_DEPARTAMENTO || 'San Salvador',
  telefono: process.env.EMPRESA_TELEFONO || '',
};

function datosCompletos() {
  return empresa.nit !== 'PENDIENTE' && empresa.nrc !== 'PENDIENTE';
}

module.exports = { empresa, datosCompletos };
