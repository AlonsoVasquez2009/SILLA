(async () => {
  const usuario = await protegerPagina();
  if (!usuario) return;
  configurarLogout();

  if (usuario.rol !== 'admin') {
    document.getElementById('enlace-historial').remove();
    document.getElementById('enlace-usuarios').remove();
  }

  const mensajeForm = document.getElementById('mensaje-form');
  const mensajeLista = document.getElementById('mensaje-lista');
  const cuerpoTabla = document.getElementById('cuerpo-tabla');

  // El sistema solo tiene dos recursos (mesa y silla); se obtienen sus ids reales
  // del inventario en lugar de asumirlos fijos.
  let idMesa = null;
  let idSilla = null;

  async function cargarIdsRecursos() {
    const { recursos } = await api.obtenerInventario();
    idMesa = recursos.find((r) => r.tipo === 'mesa')?.id;
    idSilla = recursos.find((r) => r.tipo === 'silla')?.id;
  }

  function claseEstado(estado) {
    const mapa = {
      Confirmada: 'estado--confirmada',
      Cancelada: 'estado--cancelada',
      Finalizada: 'estado--finalizada',
    };
    return mapa[estado] || '';
  }

  async function cargarReservas() {
    mensajeLista.innerHTML = '';
    try {
      const { reservas } = await api.listarReservas();
      cuerpoTabla.innerHTML = reservas
        .map((r) => {
          const recursosTexto = r.items.map((i) => `${i.cantidad} ${i.nombre}`).join(', ');
          const puedeCancelar = r.estado === 'Confirmada';
          return `
          <tr>
            <td>${r.fecha.slice(0, 10)}</td>
            <td>${r.hora_inicio} – ${r.hora_fin}</td>
            <td>${recursosTexto || '—'}</td>
            <td><span class="estado ${claseEstado(r.estado)}">${r.estado}</span></td>
            <td>${puedeCancelar ? `<button class="boton boton--secundario" data-id="${r.id}">Cancelar</button>` : ''}</td>
          </tr>`;
        })
        .join('');

      cuerpoTabla.querySelectorAll('button[data-id]').forEach((boton) => {
        boton.addEventListener('click', async () => {
          if (!confirm('¿Cancelar esta reserva?')) return;
          try {
            await api.cancelarReserva(boton.dataset.id);
            await cargarReservas();
          } catch (error) {
            mensajeLista.innerHTML = `<div class="mensaje mensaje--error">${error.message}</div>`;
          }
        });
      });
    } catch (error) {
      mensajeLista.innerHTML = `<div class="mensaje mensaje--error">${error.message}</div>`;
    }
  }

  document.getElementById('form-reserva').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    mensajeForm.innerHTML = '';

    const fecha = document.getElementById('fecha').value;
    const hora_inicio = document.getElementById('hora_inicio').value;
    const hora_fin = document.getElementById('hora_fin').value;
    const cantidadMesas = Number(document.getElementById('recurso_mesa').value) || 0;
    const cantidadSillas = Number(document.getElementById('recurso_silla').value) || 0;

    const items = [];
    if (cantidadMesas > 0) items.push({ recurso_id: idMesa, cantidad: cantidadMesas });
    if (cantidadSillas > 0) items.push({ recurso_id: idSilla, cantidad: cantidadSillas });

    if (items.length === 0) {
      mensajeForm.innerHTML = '<div class="mensaje mensaje--error">Indica al menos una mesa o silla.</div>';
      return;
    }

    try {
      await api.crearReserva({ fecha, hora_inicio, hora_fin, items });
      document.getElementById('form-reserva').reset();
      await cargarReservas();
      mensajeForm.innerHTML = '<div class="mensaje mensaje--exito">Reserva confirmada.</div>';
    } catch (error) {
      mensajeForm.innerHTML = `<div class="mensaje mensaje--error">${error.message}</div>`;
    }
  });

  await cargarIdsRecursos();
  await cargarReservas();
})();
