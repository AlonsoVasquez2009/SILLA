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

  async function cargarIdsRecursos() {
    const { recursos } = await api.obtenerInventario();
    idMesa = recursos.find((r) => r.tipo === 'mesa')?.id;
    idSilla = recursos.find((r) => r.tipo === 'silla')?.id;
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
  if (form) {
    form.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      mensajeForm.innerHTML = '';

      const cantidadMesas = Number(document.getElementById('recurso_mesa').value) || 0;
      const cantidadSillas = Number(document.getElementById('recurso_silla').value) || 0;
      const fecha_prevista = document.getElementById('fecha_prevista').value;
      const observaciones = document.getElementById('observaciones').value.trim();

      const items = [];
      if (cantidadMesas > 0) items.push({ recurso_id: idMesa, cantidad: cantidadMesas });
      if (cantidadSillas > 0) items.push({ recurso_id: idSilla, cantidad: cantidadSillas });

      if (items.length === 0) {
        mensajeForm.innerHTML = '<div class="mensaje mensaje--error">Indica al menos una mesa o silla.</div>';
        return;
      }

      try {
        await api.crearPrestamo({ items, fecha_prevista, observaciones });
        form.reset();
        await cargarPrestamos();
        mensajeForm.innerHTML = '<div class="mensaje mensaje--exito">Préstamo registrado.</div>';
      } catch (error) {
        mensajeForm.innerHTML = `<div class="mensaje mensaje--error">${error.message}</div>`;
      }
    });
  }

  await cargarIdsRecursos();
  await cargarPrestamos();
})();
