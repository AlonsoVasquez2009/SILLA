(async () => {
  const usuario = await protegerPagina('admin');
  if (!usuario) return;
  configurarLogout();

  const mensajeVencidos = document.getElementById('mensaje-vencidos');
  const cuerpoVencidos = document.getElementById('cuerpo-vencidos');
  const mensajeHistorial = document.getElementById('mensaje-historial');
  const cuerpoHistorial = document.getElementById('cuerpo-historial');
  const filtroTipo = document.getElementById('filtro-tipo');

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

  await cargarVencidos();
  await cargarHistorial();
})();
