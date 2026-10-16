(async () => {
  const usuario = await protegerPagina('admin');
  if (!usuario) return;
  configurarLogout();

  const mensaje = document.getElementById('mensaje');
  const cuerpoTabla = document.getElementById('cuerpo-tabla');
  const selectorMes = document.getElementById('selector-mes');
  const enlaceCSV = document.getElementById('enlace-csv');

  function mesActual() {
    const hoy = new Date();
    return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
  }

  function actualizarEnlaceCSV() {
    enlaceCSV.href = `/api/reportes/estado-mensual/csv?mes=${selectorMes.value}`;
  }

  async function cargar() {
    mensaje.innerHTML = '';
    actualizarEnlaceCSV();
    try {
      const { datos } = await api.obtenerReporte('estado-mensual', { mes: selectorMes.value });
      if (datos.length === 0) {
        cuerpoTabla.innerHTML = '<tr><td colspan="11">No hay recursos registrados.</td></tr>';
        return;
      }
      cuerpoTabla.innerHTML = datos
        .map(
          (fila) => `
        <tr>
          <td>${fila.recurso}</td>
          <td>${fila.tipo}</td>
          <td>${fila.total}</td>
          <td>${fila.disponibles}</td>
          <td>${fila.prestados}</td>
          <td>${fila.danados_actualmente}</td>
          <td>${fila.porcentaje_en_buen_estado}%</td>
          <td>${fila.danos_reportados_mes}</td>
          <td>${fila.perdidas_reportadas_mes}</td>
          <td>${fila.reparados_mes}</td>
          <td>${fila.dados_de_baja_mes}</td>
        </tr>`
        )
        .join('');
    } catch (error) {
      mensaje.innerHTML = `<div class="mensaje mensaje--error">${error.message}</div>`;
    }
  }

  selectorMes.value = mesActual();
  selectorMes.addEventListener('change', cargar);

  await cargar();
})();
