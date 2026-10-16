// Reportes de solo lectura, construidos sobre las tablas ya existentes.
const { pool } = require('../db');
const { marcarPrestamosVencidos } = require('./prestamoService');

async function prestamosVencidos() {
  await marcarPrestamosVencidos();

  const { rows } = await pool.query(
    `SELECT p.id, p.usuario_id, u.nombre AS usuario_nombre, p.fecha_prestamo,
            p.fecha_prevista, p.estado,
            (CURRENT_DATE - p.fecha_prevista) AS dias_de_atraso,
            COALESCE(
              json_agg(
                json_build_object(
                  'recurso_id', dp.recurso_id, 'nombre', rec.nombre,
                  'cantidad', dp.cantidad, 'devuelto', dp.devuelto,
                  'pendiente', dp.cantidad - dp.devuelto
                )
              ) FILTER (WHERE dp.id IS NOT NULL), '[]'
            ) AS items
     FROM prestamos p
     JOIN usuarios u ON u.id = p.usuario_id
     LEFT JOIN detalle_prestamos dp ON dp.prestamo_id = p.id
     LEFT JOIN recursos rec ON rec.id = dp.recurso_id
     WHERE p.estado = 'Vencido'
     GROUP BY p.id, u.nombre
     ORDER BY p.fecha_prevista ASC`
  );
  return rows;
}

async function inventarioActual() {
  const { rows } = await pool.query(
    `SELECT id, nombre, tipo, total, disponibles, prestados, danados
     FROM recursos
     ORDER BY tipo, nombre`
  );
  return rows;
}

// Calcula el primer y último día del mes a partir de "YYYY-MM".
// Si no se indica mes (o es inválido), usa el mes actual.
function calcularRangoMes(mesTexto) {
  let anio;
  let mes;
  if (mesTexto && /^\d{4}-\d{2}$/.test(mesTexto)) {
    [anio, mes] = mesTexto.split('-').map(Number);
  } else {
    const hoy = new Date();
    anio = hoy.getFullYear();
    mes = hoy.getMonth() + 1;
  }
  const inicio = `${anio}-${String(mes).padStart(2, '0')}-01`;
  const finMes =
    mes === 12 ? `${anio + 1}-01-01` : `${anio}-${String(mes + 1).padStart(2, '0')}-01`;
  const periodo = `${anio}-${String(mes).padStart(2, '0')}`;
  return { inicio, finMes, periodo };
}

// Reporte mensual del estado del inmobiliario que se renta: cuántas
// unidades de cada recurso están disponibles, prestadas o dañadas ahora
// mismo, y cuántas incidencias (daños, pérdidas, reparaciones, bajas)
// ocurrieron durante el mes indicado.
async function estadoMensual(opciones = {}) {
  const { inicio, finMes, periodo } = calcularRangoMes(opciones.mes);

  const { rows: recursos } = await pool.query(
    `SELECT id, nombre, tipo, total, disponibles, prestados, danados
     FROM recursos
     ORDER BY tipo, nombre`
  );

  const { rows: incidenciasPorRecurso } = await pool.query(
    `SELECT recurso_id,
            COUNT(*) FILTER (WHERE tipo_incidencia = 'dano') AS danos_reportados,
            COUNT(*) FILTER (WHERE tipo_incidencia = 'perdida') AS perdidas_reportadas,
            COUNT(*) FILTER (WHERE estado = 'reparado') AS reparados,
            COUNT(*) FILTER (WHERE estado = 'dado_de_baja') AS dados_de_baja,
            COALESCE(SUM(cantidad) FILTER (WHERE estado = 'dado_de_baja'), 0) AS unidades_baja
     FROM incidencias
     WHERE fecha_reporte >= $1 AND fecha_reporte < $2
     GROUP BY recurso_id`,
    [inicio, finMes]
  );
  const porRecurso = new Map(incidenciasPorRecurso.map((fila) => [fila.recurso_id, fila]));

  return recursos.map((r) => {
    const inc = porRecurso.get(r.id) || {};
    const enBuenEstado = r.disponibles + r.prestados;
    return {
      periodo,
      recurso: r.nombre,
      tipo: r.tipo,
      total: r.total,
      disponibles: r.disponibles,
      prestados: r.prestados,
      danados_actualmente: r.danados,
      porcentaje_en_buen_estado: r.total
        ? Number(((enBuenEstado / r.total) * 100).toFixed(1))
        : 0,
      danos_reportados_mes: Number(inc.danos_reportados || 0),
      perdidas_reportadas_mes: Number(inc.perdidas_reportadas || 0),
      reparados_mes: Number(inc.reparados || 0),
      dados_de_baja_mes: Number(inc.dados_de_baja || 0),
      unidades_baja_definitiva_mes: Number(inc.unidades_baja || 0),
    };
  });
}

const REPORTES = {
  'prestamos-vencidos': prestamosVencidos,
  inventario: inventarioActual,
  'estado-mensual': estadoMensual,
};

async function generarReporte(tipo, opciones = {}) {
  const funcion = REPORTES[tipo];
  if (!funcion) {
    const error = new Error(
      `Reporte desconocido: "${tipo}". Disponibles: ${Object.keys(REPORTES).join(', ')}`
    );
    error.status = 400;
    throw error;
  }
  return funcion(opciones);
}

// Convierte un arreglo de objetos planos a texto CSV. Los campos que son
// objetos o arreglos (como 'items') se aplanan a texto separado por " | ".
function convertirACSV(filas) {
  if (!filas || filas.length === 0) return '';

  const columnas = Object.keys(filas[0]);

  function celda(valor) {
    let texto;
    if (valor === null || valor === undefined) {
      texto = '';
    } else if (typeof valor === 'object') {
      texto = JSON.stringify(valor).replace(/"/g, "'");
    } else {
      texto = String(valor);
    }
    return `"${texto.replace(/"/g, '""')}"`;
  }

  const encabezado = columnas.map(celda).join(',');
  const lineas = filas.map((fila) => columnas.map((c) => celda(fila[c])).join(','));
  return [encabezado, ...lineas].join('\n');
}

async function generarReporteCSV(tipo, opciones = {}) {
  const filas = await generarReporte(tipo, opciones);
  return convertirACSV(filas);
}

module.exports = { generarReporte, generarReporteCSV };
