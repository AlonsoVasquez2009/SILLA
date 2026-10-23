// Utilidades para dar formato legal salvadoreño a las facturas:
// - Validación de NIT / NRC / DUI (formatos oficiales)
// - Conversión de montos en dólares a letras (exigido en el cuerpo del
//   documento, Art. 114 literal f) Código Tributario)

// NIT: 14 dígitos (formato antiguo 0000-000000-000-0) o DUI-NIT unificado
// de 9 dígitos (00000000-0) que la Dirección General de Impuestos Internos
// adoptó a partir de la unificación NIT=DUI. Aceptamos ambos, con o sin guiones.
function normalizar(valor) {
  return String(valor || '').replace(/[\s-]+/g, '');
}

function validarNIT(valor) {
  const limpio = normalizar(valor);
  return /^\d{14}$/.test(limpio) || /^\d{9}$/.test(limpio); // 14 dígitos (NIT clásico) o 9 (DUI-NIT)
}

function validarDUI(valor) {
  const limpio = normalizar(valor);
  return /^\d{9}$/.test(limpio);
}

// NRC: Número de Registro de Contribuyente, entre 2 y 8 dígitos (con o sin
// dígito verificador separado por guion, ej. "123456-7").
function validarNRC(valor) {
  const limpio = normalizar(valor);
  return /^\d{2,9}$/.test(limpio);
}

function formatearNIT(valor) {
  const limpio = normalizar(valor);
  if (/^\d{14}$/.test(limpio)) {
    return `${limpio.slice(0, 4)}-${limpio.slice(4, 10)}-${limpio.slice(10, 13)}-${limpio.slice(13)}`;
  }
  if (/^\d{9}$/.test(limpio)) {
    return `${limpio.slice(0, 8)}-${limpio.slice(8)}`;
  }
  return valor;
}

// --- Montos en letras (dólares con centavos) ---
const UNIDADES = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
const DECENAS_10_19 = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
const DECENAS = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

function menorMil(n) {
  if (n === 0) return '';
  if (n === 100) return 'CIEN';
  let texto = '';
  const c = Math.floor(n / 100);
  const resto = n % 100;
  if (c > 0) texto += CENTENAS[c] + ' ';
  if (resto >= 10 && resto <= 19) {
    texto += DECENAS_10_19[resto - 10];
  } else if (resto >= 20) {
    const d = Math.floor(resto / 10);
    const u = resto % 10;
    texto += DECENAS[d] + (u > 0 ? ' Y ' + UNIDADES[u] : '');
  } else if (resto > 0) {
    texto += UNIDADES[resto];
  }
  return texto.trim();
}

function enteroALetras(n) {
  if (n === 0) return 'CERO';
  let resto = n;
  const partes = [];

  const millones = Math.floor(resto / 1000000);
  resto %= 1000000;
  if (millones > 0) {
    partes.push(millones === 1 ? 'UN MILLÓN' : `${enteroALetras(millones)} MILLONES`);
  }

  const miles = Math.floor(resto / 1000);
  resto %= 1000;
  if (miles > 0) {
    partes.push(miles === 1 ? 'MIL' : `${menorMil(miles)} MIL`);
  }

  if (resto > 0) {
    partes.push(menorMil(resto));
  }

  return partes.join(' ').trim();
}

function montoALetras(monto) {
  const numero = Number(monto);
  const entero = Math.floor(numero);
  const centavos = Math.round((numero - entero) * 100);
  const centavosTexto = String(centavos).padStart(2, '0');
  return `${enteroALetras(entero)} DÓLARES CON ${centavosTexto}/100`;
}

module.exports = {
  validarNIT,
  validarDUI,
  validarNRC,
  formatearNIT,
  normalizarDocumento: normalizar,
  montoALetras,
};
