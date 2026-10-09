(async () => {
  const usuario = await protegerPagina('admin');
  if (!usuario) return;
  configurarLogout();

  const mensajeVencidos = document.getElementById('mensaje-vencidos');
  const cuerpoVencidos = document.getElementById('cuerpo-vencidos');
  const mensajeHistorial = document.getElementById('mensaje-historial');
  const cuerpoHistorial = document.getElementById('cuerpo-historial');
  const filtroTipo = document.getElementById('filtro-tipo');
  const filtroUsuario = document.getElementById('filtro-usuario');
  const filtroRecurso = document.getElementById('filtro-recurso');
  const filtroDesde = document.getElementById('filtro-desde');
  const filtroHasta = document.getElementById('filtro-hasta');
  const botonLimpiarFiltros = document.getElementById('boton-limpiar-filtros');

  async function cargarOpcionesDeFiltro() {
    try {
      const { usuarios } = await api.listarUsuarios();
      usuarios.forEach((u) => {
        const opcion = document.createElement('option');
        opcion.value = u.id;
        opcion.textContent = u.nombre;
        filtroUsuario.appendChild(opcion);
      });
    } catch {
      // Si falla, el filtro de usuario simplemente queda solo con "Todos".
    }

    try {
      const { recursos } = await api.obtenerInventario();
      recursos.forEach((r) => {
        const opcion = document.createElement('option');
        opcion.value = r.id;
        opcion.textContent = r.nombre;
        filtroRecurso.appendChild(opcion);
      });
    } catch {
      // Si falla, el filtro de recurso simplemente queda solo con "Todos".
    }
  }

  async function cargarVencidos() {
    mensajeVencidos.innerHTML = '';
    try {
      const { datos } = await api.obtenerReporte('prestamos-vencidos');
      if (datos.length === 0) {
        cuerpoVencidos.innerHTML = '<tr><td colspan="4">No hay préstamos vencidos.</td></tr>';
        return;
      }
      cuerpoVencidos.innerHTML = datos
        .map((p) => {
          const recursosTexto = p.items
            .map((i) => `${i.pendiente} ${i.nombre}`)
            .join(', ');
          return `
          <tr>
            <td>${p.usuario_nombre}</td>
            <td>${p.fecha_prevista.slice(0, 10)}</td>
            <td>${p.dias_de_atraso}</td>
            <td>${recursosTexto}</td>
          </tr>`;
        })
        .join('');
    } catch (error) {
      mensajeVencidos.innerHTML = `<div class="mensaje mensaje--error">${error.message}</div>`;
    }
  }

  async function cargarHistorial() {
    mensajeHistorial.innerHTML = '';
    try {
      const filtros = {};
      if (filtroTipo.value) filtros.tipo_operacion = filtroTipo.value;
      if (filtroUsuario.value) filtros.usuario_id = filtroUsuario.value;
      if (filtroRecurso.value) filtros.recurso_id = filtroRecurso.value;
      if (filtroDesde.value) filtros.desde = filtroDesde.value;
      if (filtroHasta.value) filtros.hasta = filtroHasta.value;

      const { historial } = await api.obtenerHistorial(filtros);
      if (historial.length === 0) {
        cuerpoHistorial.innerHTML = '<tr><td colspan="5">Sin registros.</td></tr>';
        return;
      }
      cuerpoHistorial.innerHTML = historial
        .map(
          (h) => `
        <tr>
          <td>${new Date(h.fecha).toLocaleString('es')}</td>
          <td>${h.usuario_nombre || '—'}</td>
          <td>${h.tipo_operacion}</td>
          <td>${h.recurso_nombre || '—'}</td>
          <td>${h.cantidad ?? '—'}</td>
        </tr>`
        )
        .join('');
    } catch (error) {
      mensajeHistorial.innerHTML = `<div class="mensaje mensaje--error">${error.message}</div>`;
    }
  }

  filtroTipo.addEventListener('change', cargarHistorial);
  filtroUsuario.addEventListener('change', cargarHistorial);
  filtroRecurso.addEventListener('change', cargarHistorial);
  filtroDesde.addEventListener('change', cargarHistorial);
  filtroHasta.addEventListener('change', cargarHistorial);
  botonLimpiarFiltros.addEventListener('click', () => {
    filtroTipo.value = '';
    filtroUsuario.value = '';
    filtroRecurso.value = '';
    filtroDesde.value = '';
    filtroHasta.value = '';
    cargarHistorial();
  });

  await cargarOpcionesDeFiltro();
  await cargarVencidos();
  await cargarHistorial();
})();
