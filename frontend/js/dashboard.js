(async () => {
  const usuario = await protegerPagina();
  if (!usuario) return;
  configurarLogout();

  if (usuario.rol !== 'admin') {
    document.getElementById('enlace-historial').remove();
    document.getElementById('enlace-usuarios').remove();
  }

  const mensaje = document.getElementById('mensaje');
  const gridRecursos = document.getElementById('grid-recursos');
  const gridOperaciones = document.getElementById('grid-operaciones');

  function tarjetaResumen(numero, etiqueta) {
    return `<div class="tarjeta"><div class="numero">${numero}</div><div class="etiqueta">${etiqueta}</div></div>`;
  }

  try {
    const datos = await api.obtenerDashboard();

    gridRecursos.innerHTML =
      tarjetaResumen(datos.mesas.total, 'Mesas totales') +
      tarjetaResumen(datos.mesas.disponibles, 'Mesas disponibles') +
      tarjetaResumen(datos.sillas.total, 'Sillas totales') +
      tarjetaResumen(datos.sillas.disponibles, 'Sillas disponibles');

    gridOperaciones.innerHTML =
      tarjetaResumen(datos.operaciones.reservas_confirmadas, 'Reservas confirmadas') +
      tarjetaResumen(datos.operaciones.prestamos_activos, 'Préstamos activos') +
      tarjetaResumen(datos.operaciones.prestamos_vencidos, 'Préstamos vencidos') +
      tarjetaResumen(datos.operaciones.items_pendientes_de_devolucion, 'Pendientes de devolución');
  } catch (error) {
    mensaje.innerHTML = `<div class="mensaje mensaje--error">${error.message}</div>`;
  }
})();
