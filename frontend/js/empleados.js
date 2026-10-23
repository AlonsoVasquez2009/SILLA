(async () => {
  const usuario = await protegerPagina('admin');
  if (!usuario) return;
  configurarLogout();

  const mensajeForm = document.getElementById('mensaje-form');
  const mensajeLista = document.getElementById('mensaje-lista');
  const cuerpoTabla = document.getElementById('cuerpo-tabla');

  const mensajeSalarioForm = document.getElementById('mensaje-salario-form');
  const mensajeSalarios = document.getElementById('mensaje-salarios');
  const cuerpoTablaSalarios = document.getElementById('cuerpo-tabla-salarios');
  const selectTrabajador = document.getElementById('salario-trabajador');

  let trabajadoresCache = [];

  function formatoMoneda(valor) {
    return `$${Number(valor).toFixed(2)}`;
  }

  async function cargarTrabajadores() {
    mensajeLista.innerHTML = '';
    try {
      const { trabajadores } = await api.listarTrabajadores();
      trabajadoresCache = trabajadores;
      pintarTrabajadores(trabajadores);
      pintarSelectTrabajadores(trabajadores);
    } catch (error) {
      mensajeLista.innerHTML = `<div class="mensaje mensaje--error">${error.message}</div>`;
    }
  }

  function pintarTrabajadores(trabajadores) {
    cuerpoTabla.innerHTML = trabajadores
      .map(
        (t) => `
      <tr>
        <td>${t.nombre}</td>
        <td>${t.documento || '—'}</td>
        <td>${t.cargo || '—'}</td>
        <td>${new Date(t.fecha_contratacion).toLocaleDateString('es-SV')}</td>
        <td>${formatoMoneda(t.salario_base_mensual)}</td>
        <td>${t.jornada}</td>
        <td><span class="estado ${t.activo ? 'estado--devuelto' : 'estado--cancelada'}">${t.activo ? 'Activo' : 'Inactivo'}</span></td>
        <td>
          <button class="boton boton--secundario" data-id="${t.id}" data-activo="${t.activo}">
            ${t.activo ? 'Desactivar' : 'Activar'}
          </button>
        </td>
      </tr>`
      )
      .join('');

    cuerpoTabla.querySelectorAll('button[data-id]').forEach((boton) => {
      boton.addEventListener('click', async () => {
        const activo = boton.dataset.activo !== 'true';
        try {
          await api.modificarTrabajador(boton.dataset.id, { activo });
          await cargarTrabajadores();
        } catch (error) {
          mensajeLista.innerHTML = `<div class="mensaje mensaje--error">${error.message}</div>`;
        }
      });
    });
  }

  function pintarSelectTrabajadores(trabajadores) {
    const activos = trabajadores.filter((t) => t.activo);
    selectTrabajador.innerHTML = activos
      .map((t) => `<option value="${t.id}">${t.nombre}</option>`)
      .join('');
  }

  document.getElementById('form-trabajador').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    mensajeForm.innerHTML = '';

    const nombre = document.getElementById('nombre').value.trim();
    const documento = document.getElementById('documento').value.trim();
    const cargo = document.getElementById('cargo').value.trim();
    const fecha_contratacion = document.getElementById('fecha_contratacion').value;
    const salario_base_mensual = document.getElementById('salario_base_mensual').value;
    const jornada = document.getElementById('jornada').value;

    try {
      await api.crearTrabajador({ nombre, documento, cargo, fecha_contratacion, salario_base_mensual, jornada });
      document.getElementById('form-trabajador').reset();
      await cargarTrabajadores();
      mensajeForm.innerHTML = '<div class="mensaje mensaje--exito">Empleado creado.</div>';
    } catch (error) {
      mensajeForm.innerHTML = `<div class="mensaje mensaje--error">${error.message}</div>`;
    }
  });

  async function cargarSalarios() {
    mensajeSalarios.innerHTML = '';
    try {
      const { salarios } = await api.listarSalarios();
      pintarSalarios(salarios);
    } catch (error) {
      mensajeSalarios.innerHTML = `<div class="mensaje mensaje--error">${error.message}</div>`;
    }
  }

  function pintarSalarios(salarios) {
    cuerpoTablaSalarios.innerHTML = salarios
      .map(
        (s) => `
      <tr>
        <td>${s.trabajador_nombre}</td>
        <td>${new Date(s.periodo_inicio).toLocaleDateString('es-SV')} — ${new Date(s.periodo_fin).toLocaleDateString('es-SV')}</td>
        <td>${formatoMoneda(s.salario_base)}</td>
        <td>${formatoMoneda(s.monto_horas_extra)}</td>
        <td>${formatoMoneda(s.monto_recargo_descanso)}</td>
        <td>${s.incluye_aguinaldo ? formatoMoneda(s.monto_aguinaldo) : '—'}</td>
        <td>${s.incluye_vacaciones ? formatoMoneda(s.monto_vacaciones) : '—'}</td>
        <td><strong>${formatoMoneda(s.total_pagar)}</strong></td>
        <td>${s.fecha_pago ? new Date(s.fecha_pago).toLocaleDateString('es-SV') : '—'}</td>
      </tr>`
      )
      .join('');
  }

  document.getElementById('form-salario').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    mensajeSalarioForm.innerHTML = '';

    const datos = {
      trabajador_id: Number(selectTrabajador.value),
      periodo_inicio: document.getElementById('periodo_inicio').value,
      periodo_fin: document.getElementById('periodo_fin').value,
      horas_extra_diurnas: Number(document.getElementById('horas_extra_diurnas').value || 0),
      horas_extra_nocturnas: Number(document.getElementById('horas_extra_nocturnas').value || 0),
      horas_trabajadas_descanso: Number(document.getElementById('horas_trabajadas_descanso').value || 0),
      incluye_aguinaldo: document.getElementById('incluye_aguinaldo').checked,
      incluye_vacaciones: document.getElementById('incluye_vacaciones').checked,
      fecha_pago: document.getElementById('fecha_pago').value || null,
    };

    try {
      await api.registrarSalario(datos);
      document.getElementById('form-salario').reset();
      await cargarSalarios();
      mensajeSalarioForm.innerHTML = '<div class="mensaje mensaje--exito">Planilla registrada.</div>';
    } catch (error) {
      mensajeSalarioForm.innerHTML = `<div class="mensaje mensaje--error">${error.message}</div>`;
    }
  });

  await cargarTrabajadores();
  await cargarSalarios();
})();
