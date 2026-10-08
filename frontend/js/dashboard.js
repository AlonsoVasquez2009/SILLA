(async () => {
  const usuario = await protegerPagina('admin');
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

  function graficaDona(id, etiquetas, valores, titulo) {
    new Chart(document.getElementById(id), {
      type: 'doughnut',
      data: {
        labels: etiquetas,
        datasets: [{
          data: valores,
          backgroundColor: ['#4caf7d', '#f5a623', '#e05858'],
        }],
      },
      options: {
        responsive: true,
        plugins: {
          title: { display: true, text: titulo },
          legend: { position: 'bottom' },
        },
      },
    });
  }

  function graficaBarras(id, etiquetas, valores, titulo) {
    new Chart(document.getElementById(id), {
      type: 'bar',
      data: {
        labels: etiquetas,
        datasets: [{
          label: titulo,
          data: valores,
          backgroundColor: '#3d7bf5',
        }],
      },
      options: {
        responsive: true,
        plugins: {
          title: { display: true, text: titulo },
          legend: { display: false },
        },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      },
    });
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

    graficaDona(
      'grafica-mesas',
      ['Disponibles', 'Reservadas', 'Prestadas'],
      [datos.mesas.disponibles, datos.mesas.reservados, datos.mesas.prestados],
      'Estado de mesas'
    );

    graficaDona(
      'grafica-sillas',
      ['Disponibles', 'Reservadas', 'Prestadas'],
      [datos.sillas.disponibles, datos.sillas.reservados, datos.sillas.prestados],
      'Estado de sillas'
    );

    graficaBarras(
      'grafica-operaciones',
      ['Reservas confirmadas', 'Préstamos activos', 'Préstamos vencidos', 'Pendientes devolución'],
      [
        datos.operaciones.reservas_confirmadas,
        datos.operaciones.prestamos_activos,
        datos.operaciones.prestamos_vencidos,
        datos.operaciones.items_pendientes_de_devolucion,
      ],
      'Operaciones'
    );
  } catch (error) {
    mensaje.innerHTML = `<div class="mensaje mensaje--error">${error.message}</div>`;
  }
})();
