(async () => {
  const usuario = await protegerPagina();
  if (!usuario) return;
  configurarLogout();

  const esAdmin = usuario.rol === 'admin';
  if (!esAdmin) {
    document.getElementById('enlace-historial').remove();
    document.getElementById('enlace-usuarios').remove();
    document.getElementById('tarjeta-form-prestamo').remove();
  }

  const mensajeForm = document.getElementById('mensaje-form');
  const mensajeLista = document.getElementById('mensaje-lista');
  const cuerpoTabla = document.getElementById('cuerpo-tabla');
  const modalFondo = document.getElementById('modal-fondo');
  const modalCampos = document.getElementById('modal-campos');
  const modalMensaje = document.getElementById('modal-mensaje');

  let idMesa = null;
  let idSilla = null;
  let prestamoEnDevolucion = null;
  let reservasConfirmadas = [];

  async function cargarIdsRecursos() {
    const { recursos } = await api.obtenerInventario();
    idMesa = recursos.find((r) => r.tipo === 'mesa')?.id;
    idSilla = recursos.find((r) => r.tipo === 'silla')?.id;
  }

  async function cargarReservasConfirmadas() {
    const selectReserva = document.getElementById('select_reserva');
    if (!selectReserva) return;

    try {
      const { reservas } = await api.listarReservas();
      reservasConfirmadas = reservas.filter((r) => r.estado === 'Confirmada');

      reservasConfirmadas.forEach((r) => {
        const resumenItems = r.items.map((i) => `${i.cantidad} ${i.nombre}`).join(', ');
        const opcion = document.createElement('option');
        opcion.value = r.id;
        opcion.textContent = `${r.usuario_nombre} — ${r.fecha.slice(0, 10)} ${r.hora_inicio} — ${resumenItems}`;
        selectReserva.appendChild(opcion);
      });
    } catch (error) {
      mensajeForm.innerHTML = `<div class="mensaje mensaje--error">${error.message}</div>`;
    }
  }

  function alCambiarReservaSeleccionada() {
    const selectReserva = document.getElementById('select_reserva');
    const camposDirecto = document.getElementById('campos-directo');
    const resumenReserva = document.getElementById('resumen-reserva');
    if (!selectReserva) return;

    const reservaId = Number(selectReserva.value) || null;
    const reserva = reservasConfirmadas.find((r) => r.id === reservaId);

    if (reserva) {
      camposDirecto.style.display = 'none';
      document.getElementById('recurso_mesa').value = 0;
      document.getElementById('recurso_silla').value = 0;

      const resumenItems = reserva.items.map((i) => `${i.cantidad} ${i.nombre}`).join(', ');
      resumenReserva.style.display = '';
      resumenReserva.innerHTML =
        `<div class="mensaje">Recursos de la reserva: ${resumenItems || '—'} ` +
        `(${reserva.usuario_nombre}, ${reserva.fecha.slice(0, 10)} ${reserva.hora_inicio})</div>`;
    } else {
      camposDirecto.style.display = '';
      resumenReserva.style.display = 'none';
      resumenReserva.innerHTML = '';
    }
  }

  function claseEstado(estado) {
    const mapa = {
      Activo: 'estado--activo',
      'Parcialmente devuelto': 'estado--parcial',
      Devuelto: 'estado--devuelto',
      Vencido: 'estado--vencido',
    };
    return mapa[estado] || '';
  }

  async function cargarPrestamos() {
    mensajeLista.innerHTML = '';
    try {
      const { prestamos } = await api.listarPrestamos();
      cuerpoTabla.innerHTML = prestamos
        .map((p) => {
          const recursosTexto = p.items
            .map((i) => `${i.cantidad - i.devuelto} de ${i.cantidad} ${i.nombre}`)
            .join(', ');
          const pendiente = p.items.some((i) => i.devuelto < i.cantidad);
          const puedeDevolver = esAdmin && pendiente;
          return `
          <tr>
            <td>${p.fecha_prestamo.slice(0, 10)}</td>
            <td>${p.fecha_prevista.slice(0, 10)}</td>
            <td>${recursosTexto || '—'}</td>
            <td><span class="estado ${claseEstado(p.estado)}">${p.estado}</span></td>
            <td>${puedeDevolver ? `<button class="boton boton--secundario" data-id="${p.id}">Devolver</button>` : ''}</td>
          </tr>`;
        })
        .join('');

      cuerpoTabla.querySelectorAll('button[data-id]').forEach((boton) => {
        boton.addEventListener('click', () => {
          const prestamo = prestamos.find((p) => p.id === Number(boton.dataset.id));
          abrirModalDevolucion(prestamo);
        });
      });
    } catch (error) {
      mensajeLista.innerHTML = `<div class="mensaje mensaje--error">${error.message}</div>`;
    }
  }

  function abrirModalDevolucion(prestamo) {
    prestamoEnDevolucion = prestamo;
    modalMensaje.innerHTML = '';
    modalCampos.innerHTML = prestamo.items
      .filter((i) => i.devuelto < i.cantidad)
      .map((i) => {
        const pendiente = i.cantidad - i.devuelto;
        return `
        <div class="campo">
          <label>Devolver ${i.nombre} (pendiente: ${pendiente})</label>
          <input type="number" min="0" max="${pendiente}" value="0" data-recurso="${i.recurso_id}" />
        </div>`;
      })
      .join('');
    modalFondo.classList.add('visible');
  }

  document.getElementById('modal-cancelar').addEventListener('click', () => {
    modalFondo.classList.remove('visible');
  });

  document.getElementById('modal-guardar').addEventListener('click', async () => {
    modalMensaje.innerHTML = '';
    const items = [...modalCampos.querySelectorAll('input[data-recurso]')]
      .map((input) => ({ recurso_id: Number(input.dataset.recurso), cantidad: Number(input.value) }))
      .filter((item) => item.cantidad > 0);

    if (items.length === 0) {
      modalMensaje.innerHTML = '<div class="mensaje mensaje--error">Indica al menos una cantidad a devolver.</div>';
      return;
    }

    try {
      await api.registrarDevolucion({ prestamo_id: prestamoEnDevolucion.id, items });
      modalFondo.classList.remove('visible');
      await cargarPrestamos();
    } catch (error) {
      modalMensaje.innerHTML = `<div class="mensaje mensaje--error">${error.message}</div>`;
    }
  });

  const form = document.getElementById('form-prestamo');
  const selectReserva = document.getElementById('select_reserva');
  if (selectReserva) {
    selectReserva.addEventListener('change', alCambiarReservaSeleccionada);
  }

  if (form) {
    form.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      mensajeForm.innerHTML = '';

      const fecha_prevista = document.getElementById('fecha_prevista').value;
      const observaciones = document.getElementById('observaciones').value.trim();
      const reservaId = selectReserva ? Number(selectReserva.value) || null : null;

      let datosPrestamo;

      if (reservaId) {
        datosPrestamo = { reserva_id: reservaId, fecha_prevista, observaciones };
      } else {
        const cantidadMesas = Number(document.getElementById('recurso_mesa').value) || 0;
        const cantidadSillas = Number(document.getElementById('recurso_silla').value) || 0;

        const items = [];
        if (cantidadMesas > 0) items.push({ recurso_id: idMesa, cantidad: cantidadMesas });
        if (cantidadSillas > 0) items.push({ recurso_id: idSilla, cantidad: cantidadSillas });

        if (items.length === 0) {
          mensajeForm.innerHTML = '<div class="mensaje mensaje--error">Indica al menos una mesa o silla.</div>';
          return;
        }
        datosPrestamo = { items, fecha_prevista, observaciones };
      }

      try {
        await api.crearPrestamo(datosPrestamo);
        form.reset();
        if (selectReserva) alCambiarReservaSeleccionada();
        await cargarReservasConfirmadas();
        await cargarPrestamos();
        mensajeForm.innerHTML = '<div class="mensaje mensaje--exito">Préstamo registrado.</div>';
      } catch (error) {
        mensajeForm.innerHTML = `<div class="mensaje mensaje--error">${error.message}</div>`;
      }
    });
  }

  await cargarIdsRecursos();
  await cargarReservasConfirmadas();
  await cargarPrestamos();
})();
