(async () => {
  const usuario = await protegerPagina('admin');
  if (!usuario) return;
  configurarLogout();

  const mensaje = document.getElementById('mensaje');
  const cuerpoTabla = document.getElementById('cuerpo-tabla');
  const filtroEstado = document.getElementById('filtro-estado');
  const filtroTipo = document.getElementById('filtro-tipo');
  const filtroRecurso = document.getElementById('filtro-recurso');

  const botonReportar = document.getElementById('boton-reportar');
  const modalFondo = document.getElementById('modal-fondo');
  const modalRecurso = document.getElementById('modal-recurso');
  const modalOrigen = document.getElementById('modal-origen');
  const campoPrestamo = document.getElementById('campo-prestamo');
  const modalPrestamo = document.getElementById('modal-prestamo');
  const modalTipo = document.getElementById('modal-tipo');
  const modalCantidad = document.getElementById('modal-cantidad');
  const modalDescripcion = document.getElementById('modal-descripcion');
  const modalMensaje = document.getElementById('modal-mensaje');

  let recursos = [];
  let prestamosActivos = [];

  const ETIQUETAS_ESTADO = {
    reportado: 'Reportado',
    en_reparacion: 'En reparación',
    reparado: 'Reparado',
    dado_de_baja: 'Dado de baja',
  };

  function formatearOrigen(fila) {
    return fila.origen === 'prestamo' ? `Préstamo #${fila.prestamo_id}` : 'Bodega';
  }

  async function cargarListasBase() {
    const { recursos: listaRecursos } = await api.obtenerInventario();
    recursos = listaRecursos;

    modalRecurso.innerHTML = recursos
      .map((r) => `<option value="${r.id}">${r.nombre} (${r.tipo})</option>`)
      .join('');

    filtroRecurso.innerHTML =
      '<option value="">Todos los recursos</option>' +
      recursos.map((r) => `<option value="${r.id}">${r.nombre}</option>`).join('');

    const { prestamos } = await api.listarPrestamos();
    prestamosActivos = prestamos.filter((p) =>
      ['Activo', 'Parcialmente devuelto', 'Vencido'].includes(p.estado)
    );
  }

  function poblarModalPrestamo() {
    const recursoId = Number(modalRecurso.value);
    const opciones = prestamosActivos
      .map((p) => {
        const item = p.items.find((i) => i.recurso_id === recursoId);
        if (!item) return null;
        const pendiente = item.cantidad - item.devuelto;
        if (pendiente <= 0) return null;
        return { id: p.id, texto: `#${p.id} — ${p.usuario_nombre} (${pendiente} pendientes)` };
      })
      .filter(Boolean);

    if (opciones.length === 0) {
      modalPrestamo.innerHTML = '<option value="">No hay préstamos activos con este recurso</option>';
    } else {
      modalPrestamo.innerHTML = opciones
        .map((o) => `<option value="${o.id}">${o.texto}</option>`)
        .join('');
    }
  }

  modalOrigen.addEventListener('change', () => {
    const esPrestamo = modalOrigen.value === 'prestamo';
    campoPrestamo.style.display = esPrestamo ? '' : 'none';
    if (esPrestamo) poblarModalPrestamo();
  });

  modalRecurso.addEventListener('change', () => {
    if (modalOrigen.value === 'prestamo') poblarModalPrestamo();
  });

  botonReportar.addEventListener('click', async () => {
    modalMensaje.innerHTML = '';
    modalCantidad.value = 1;
    modalDescripcion.value = '';
    modalOrigen.value = 'disponible';
    campoPrestamo.style.display = 'none';
    modalFondo.classList.add('visible');
  });

  document.getElementById('modal-cancelar').addEventListener('click', () => {
    modalFondo.classList.remove('visible');
  });

  document.getElementById('modal-guardar').addEventListener('click', async () => {
    modalMensaje.innerHTML = '';
    try {
      const payload = {
        recurso_id: Number(modalRecurso.value),
        origen: modalOrigen.value,
        tipo_incidencia: modalTipo.value,
        cantidad: Number(modalCantidad.value),
        descripcion: modalDescripcion.value.trim() || null,
      };
      if (payload.origen === 'prestamo') {
        if (!modalPrestamo.value) {
          throw new Error('No hay un préstamo válido para este recurso');
        }
        payload.prestamo_id = Number(modalPrestamo.value);
      }

      await api.reportarIncidencia(payload);
      modalFondo.classList.remove('visible');
      mensaje.innerHTML = '<div class="mensaje mensaje--exito">Incidencia registrada correctamente.</div>';
      await cargarListasBase();
      await cargarIncidencias();
    } catch (error) {
      modalMensaje.innerHTML = `<div class="mensaje mensaje--error">${error.message}</div>`;
    }
  });

  async function accionIncidencia(boton) {
    const { id, accion } = boton.dataset;
    mensaje.innerHTML = '';
    try {
      if (accion === 'en-reparacion') await api.marcarIncidenciaEnReparacion(id);
      if (accion === 'reparar') await api.repararIncidencia(id);
      if (accion === 'baja') await api.darDeBajaIncidencia(id);
      await cargarListasBase();
      await cargarIncidencias();
    } catch (error) {
      mensaje.innerHTML = `<div class="mensaje mensaje--error">${error.message}</div>`;
    }
  }

  function botonesAccion(fila) {
    if (fila.estado === 'reportado') {
      return `
        <button class="boton boton--secundario" data-id="${fila.id}" data-accion="en-reparacion">En reparación</button>
        <button class="boton boton--secundario" data-id="${fila.id}" data-accion="reparar">Reparado</button>
        <button class="boton boton--secundario" data-id="${fila.id}" data-accion="baja">Dar de baja</button>`;
    }
    if (fila.estado === 'en_reparacion') {
      return `
        <button class="boton boton--secundario" data-id="${fila.id}" data-accion="reparar">Reparado</button>
        <button class="boton boton--secundario" data-id="${fila.id}" data-accion="baja">Dar de baja</button>`;
    }
    return '—';
  }

  async function cargarIncidencias() {
    try {
      const filtros = {};
      if (filtroEstado.value) filtros.estado = filtroEstado.value;
      if (filtroTipo.value) filtros.tipo_incidencia = filtroTipo.value;
      if (filtroRecurso.value) filtros.recurso_id = filtroRecurso.value;

      const { incidencias } = await api.listarIncidencias(filtros);
      if (incidencias.length === 0) {
        cuerpoTabla.innerHTML = '<tr><td colspan="9">Sin incidencias registradas.</td></tr>';
        return;
      }
      cuerpoTabla.innerHTML = incidencias
        .map(
          (fila) => `
        <tr>
          <td>${new Date(fila.fecha_reporte).toLocaleString('es')}</td>
          <td>${fila.recurso_nombre}</td>
          <td>${fila.tipo_incidencia === 'dano' ? 'Dañado' : 'Perdido'}</td>
          <td>${fila.cantidad}</td>
          <td>${formatearOrigen(fila)}</td>
          <td>${fila.descripcion || '—'}</td>
          <td>${fila.reportado_por_nombre}</td>
          <td>${ETIQUETAS_ESTADO[fila.estado] || fila.estado}</td>
          <td>${botonesAccion(fila)}</td>
        </tr>`
        )
        .join('');

      cuerpoTabla.querySelectorAll('button[data-accion]').forEach((boton) => {
        boton.addEventListener('click', () => accionIncidencia(boton));
      });
    } catch (error) {
      mensaje.innerHTML = `<div class="mensaje mensaje--error">${error.message}</div>`;
    }
  }

  filtroEstado.addEventListener('change', cargarIncidencias);
  filtroTipo.addEventListener('change', cargarIncidencias);
  filtroRecurso.addEventListener('change', cargarIncidencias);

  await cargarListasBase();
  await cargarIncidencias();
})();
