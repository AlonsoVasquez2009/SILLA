// Cálculo de planillas conforme al Código de Trabajo de El Salvador.
//
// Fuentes principales:
//  - Art. 142: el salario por día se obtiene dividiendo el salario mensual entre 30.
//  - Art. 161: jornada diurna hasta 8h/día (44h/semana); nocturna hasta 7h/día (39h/semana).
//  - Art. 168: trabajo nocturno ordinario lleva un recargo mínimo del 25% sobre el salario diurno.
//  - Art. 169: toda hora extra (fuera de la jornada ordinaria) se paga con un recargo del 100%
//              (es decir, el doble de la hora normal). Si la hora extra es nocturna, se le suma
//              además el 25% de recargo nocturno del Art. 168.
//  - Art. 172: el trabajo en el día de descanso semanal se paga con el salario normal de ese día
//              MÁS un recargo del 50%.
//  - Art. 177: las vacaciones anuales son 15 días, pagados con un recargo del 30% sobre el salario
//              ordinario correspondiente a esos días.
//  - Art. 196-200: el aguinaldo se calcula sobre el salario base (sin horas extra ni bonificaciones)
//              y su monto depende de la antigüedad del trabajador al 12 de diciembre:
//                < 1 año:    proporcional a los días trabajados en el año, sobre la base de 15 días
//                1 a 3 años: 15 días de salario
//                3 a 10 años: 19 días de salario
//                más de 10 años: 21 días de salario
//
// NOTA: esto es un cálculo de referencia para apoyar la administración de la
// planilla; no sustituye una asesoría laboral/contable formal.
const { pool } = require('../db');

function salarioDiario(salarioMensual) {
  return Number(salarioMensual) / 30; // Art. 142
}

function salarioHora(salarioMensual) {
  return salarioDiario(salarioMensual) / 8; // jornada diurna de 8 horas, Art. 161
}

function calcularMontoHorasExtra(salarioMensual, horasDiurnas = 0, horasNocturnas = 0) {
  const hora = salarioHora(salarioMensual);
  const montoDiurno = Number(horasDiurnas) * hora * 2; // Art. 169: 100% de recargo = doble pago
  const montoNocturno = Number(horasNocturnas) * hora * 2.25; // Art. 169 (100%) + Art. 168 (25% nocturno)
  return Number((montoDiurno + montoNocturno).toFixed(2));
}

function calcularRecargoDiaDescanso(salarioMensual, horas = 0) {
  const hora = salarioHora(salarioMensual);
  return Number((Number(horas) * hora * 1.5).toFixed(2)); // Art. 172: pago normal + 50% de recargo
}

function calcularVacaciones(salarioMensual) {
  const diario = salarioDiario(salarioMensual);
  return Number((diario * 15 * 1.3).toFixed(2)); // Art. 177: 15 días + 30% de recargo
}

function diasAguinaldoPorAntiguedad(añosServicio) {
  if (añosServicio >= 10) return 21;
  if (añosServicio >= 3) return 19;
  if (añosServicio >= 1) return 15;
  return null; // menos de 1 año: se calcula proporcional, no por tabla fija
}

// fechaCalculo por defecto es "hoy"; se puede fijar a 12 de diciembre para
// un cálculo exacto al cierre de año.
function calcularAguinaldo(salarioMensual, fechaContratacion, fechaCalculo = new Date()) {
  const inicio = new Date(fechaContratacion);
  const msPorAño = 1000 * 60 * 60 * 24 * 365.25;
  const añosServicio = (fechaCalculo - inicio) / msPorAño;
  const diario = salarioDiario(salarioMensual);

  const dias = diasAguinaldoPorAntiguedad(añosServicio);
  if (dias !== null) {
    return Number((diario * dias).toFixed(2));
  }

  // Menos de 1 año: proporcional a los días trabajados en el año en curso,
  // sobre la base de 15 días de aguinaldo completo.
  const inicioAño = new Date(fechaCalculo.getFullYear(), 0, 1);
  const inicioConteo = inicio > inicioAño ? inicio : inicioAño;
  const diasTrabajados = Math.max(0, Math.floor((fechaCalculo - inicioConteo) / (1000 * 60 * 60 * 24)));
  const proporcional = (diasTrabajados / 365) * 15;
  return Number((diario * proporcional).toFixed(2));
}

async function listarTrabajadores() {
  const { rows } = await pool.query(
    `SELECT * FROM trabajadores ORDER BY activo DESC, nombre`
  );
  return rows;
}

async function crearTrabajador(datos) {
  const { nombre, documento, cargo, fecha_contratacion, salario_base_mensual, jornada } = datos;

  if (!nombre || !fecha_contratacion || !salario_base_mensual) {
    const error = new Error('Nombre, fecha de contratación y salario base son obligatorios');
    error.status = 400;
    throw error;
  }
  if (Number(salario_base_mensual) <= 0) {
    const error = new Error('El salario base debe ser mayor que cero');
    error.status = 400;
    throw error;
  }
  if (jornada && !['diurna', 'nocturna'].includes(jornada)) {
    const error = new Error('Jornada inválida (debe ser "diurna" o "nocturna")');
    error.status = 400;
    throw error;
  }

  const { rows } = await pool.query(
    `INSERT INTO trabajadores (nombre, documento, cargo, fecha_contratacion, salario_base_mensual, jornada)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING *`,
    [nombre, documento || null, cargo || null, fecha_contratacion, salario_base_mensual, jornada || 'diurna']
  );
  return rows[0];
}

async function modificarTrabajador(id, datos) {
  const campos = ['nombre', 'documento', 'cargo', 'fecha_contratacion', 'salario_base_mensual', 'jornada', 'activo'];
  const actualizaciones = [];
  const valores = [];
  let i = 1;

  for (const campo of campos) {
    if (datos[campo] !== undefined) {
      actualizaciones.push(`${campo} = $${i}`);
      valores.push(datos[campo]);
      i += 1;
    }
  }

  if (actualizaciones.length === 0) {
    const error = new Error('No se enviaron campos para actualizar');
    error.status = 400;
    throw error;
  }

  valores.push(id);
  const { rows } = await pool.query(
    `UPDATE trabajadores SET ${actualizaciones.join(', ')} WHERE id = $${i} RETURNING *`,
    valores
  );

  if (rows.length === 0) {
    const error = new Error('Trabajador no encontrado');
    error.status = 404;
    throw error;
  }
  return rows[0];
}

// Registra una planilla de pago para un trabajador en un período dado,
// calculando automáticamente horas extra, recargo por día de descanso,
// aguinaldo y vacaciones según corresponda.
async function registrarSalario(datos) {
  const {
    trabajador_id, periodo_inicio, periodo_fin,
    horas_extra_diurnas = 0, horas_extra_nocturnas = 0, horas_trabajadas_descanso = 0,
    incluye_aguinaldo = false, incluye_vacaciones = false, fecha_pago,
  } = datos;

  if (!trabajador_id || !periodo_inicio || !periodo_fin) {
    const error = new Error('trabajador_id, periodo_inicio y periodo_fin son obligatorios');
    error.status = 400;
    throw error;
  }

  const { rows: trabajadorRows } = await pool.query(
    `SELECT * FROM trabajadores WHERE id = $1`,
    [trabajador_id]
  );
  const trabajador = trabajadorRows[0];
  if (!trabajador) {
    const error = new Error('Trabajador no encontrado');
    error.status = 404;
    throw error;
  }

  const salarioBase = Number(trabajador.salario_base_mensual);
  const montoHorasExtra = calcularMontoHorasExtra(salarioBase, horas_extra_diurnas, horas_extra_nocturnas);
  const montoRecargoDescanso = calcularRecargoDiaDescanso(salarioBase, horas_trabajadas_descanso);
  const montoAguinaldo = incluye_aguinaldo
    ? calcularAguinaldo(salarioBase, trabajador.fecha_contratacion, new Date(periodo_fin))
    : 0;
  const montoVacaciones = incluye_vacaciones ? calcularVacaciones(salarioBase) : 0;

  const totalPagar = Number(
    (salarioBase + montoHorasExtra + montoRecargoDescanso + montoAguinaldo + montoVacaciones).toFixed(2)
  );

  const { rows } = await pool.query(
    `INSERT INTO salarios
       (trabajador_id, periodo_inicio, periodo_fin, salario_base,
        horas_extra_diurnas, horas_extra_nocturnas, horas_trabajadas_descanso,
        monto_horas_extra, monto_recargo_descanso,
        incluye_aguinaldo, monto_aguinaldo, incluye_vacaciones, monto_vacaciones,
        total_pagar, fecha_pago)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING *`,
    [
      trabajador_id, periodo_inicio, periodo_fin, salarioBase,
      horas_extra_diurnas, horas_extra_nocturnas, horas_trabajadas_descanso,
      montoHorasExtra, montoRecargoDescanso,
      incluye_aguinaldo, montoAguinaldo, incluye_vacaciones, montoVacaciones,
      totalPagar, fecha_pago || null,
    ]
  );
  return rows[0];
}

async function listarSalarios(trabajadorId) {
  const condicion = trabajadorId ? 'WHERE s.trabajador_id = $1' : '';
  const parametros = trabajadorId ? [trabajadorId] : [];
  const { rows } = await pool.query(
    `SELECT s.*, t.nombre AS trabajador_nombre
     FROM salarios s
     JOIN trabajadores t ON t.id = s.trabajador_id
     ${condicion}
     ORDER BY s.periodo_inicio DESC`,
    parametros
  );
  return rows;
}

module.exports = {
  listarTrabajadores,
  crearTrabajador,
  modificarTrabajador,
  registrarSalario,
  listarSalarios,
};
