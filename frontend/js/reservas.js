(async () => {
  const usuario = await protegerPagina();
  if (!usuario) return;
  configurarLogout();

  if (usuario.rol !== 'admin') {
    document.getElementById('enlace-incidencias').remove();
    document.getElementById('enlace-historial').remove();
    document.getElementById('enlace-usuarios').remove();
  }

  const mensajeForm = document.getElementById('mensaje-form');
  const mensajeLista = document.getElementById('mensaje-lista');
  const cuerpoTabla = document.getElementById('cuerpo-tabla');

  const modalPagoFondo = document.getElementById('modal-pago-fondo');
  const modalPagoMonto = document.getElementById('modal-pago-monto');
  const modalPagoMensaje = document.getElementById('modal-pago-mensaje');
  const formPago = document.getElementById('form-pago');
  const campoMetodo = document.getElementById('pago-metodo');
  const camposTarjeta = document.getElementById('campos-tarjeta');
  const campoTipoDte = document.getElementById('pago-tipo-dte');
  const camposCreditoFiscal = document.getElementById('campos-credito-fiscal');
  const PRECIO_POR_TIPO = { mesa: 5, silla: 1 };
  let reservaEnPago = null;
  let recursosPorId = {};

  // El sistema solo tiene dos recursos (mesa y silla); se obtienen sus ids reales
  // del inventario en lugar de asumirlos fijos.
  let idMesa = null;
  let idSilla = null;

  async function cargarIdsRecursos() {
    const { recursos } = await api.obtenerInventario();
    idMesa = recursos.find((r) => r.tipo === 'mesa')?.id;
    idSilla = recursos.find((r) => r.tipo === 'silla')?.id;
    recursosPorId = Object.fromEntries(recursos.map((r) => [r.id, r.tipo]));
  }

  function calcularMonto(items) {
    return items.reduce(
      (total, i) => total + i.cantidad * (PRECIO_POR_TIPO[recursosPorId[i.recurso_id]] || 0),
      0
    );
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
          const puedePagar = r.estado === 'Confirmada' && !r.pagado;
          const pagoTexto = r.pagado
            ? '<span class="estado estado--confirmada">Pagado</span>'
            : '<span class="estado estado--cancelada">Pendiente</span>';
          return `
          <tr>
            <td>${r.fecha.slice(0, 10)}</td>
            <td>${r.hora_inicio} – ${r.hora_fin}</td>
            <td>${recursosTexto || '—'}</td>
            <td><span class="estado ${claseEstado(r.estado)}">${r.estado}</span></td>
            <td>${pagoTexto}</td>
            <td>
              ${puedePagar ? `<button class="boton" data-pagar="${r.id}">Pagar</button>` : ''}
              ${puedeCancelar ? `<button class="boton boton--secundario" data-id="${r.id}">Cancelar</button>` : ''}
            </td>
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

      cuerpoTabla.querySelectorAll('button[data-pagar]').forEach((boton) => {
        boton.addEventListener('click', () => {
          const reserva = reservas.find((r) => r.id === Number(boton.dataset.pagar));
          abrirModalPago(reserva);
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

  // Bloquea/desbloquea el scroll de la página de fondo mientras el modal
  // de pago está abierto, para que solo haga scroll el contenido del modal.
  function bloquearScrollPagina() {
    document.body.classList.add('modal-abierto');
  }
  function desbloquearScrollPagina() {
    document.body.classList.remove('modal-abierto');
  }

  function abrirModalPago(reserva) {
    reservaEnPago = reserva;
    modalPagoMensaje.innerHTML = '';
    formPago.reset();
    camposTarjeta.style.display = 'block';
    camposCreditoFiscal.style.display = 'none';
    const monto = calcularMonto(reserva.items);
    modalPagoMonto.textContent = `Total a pagar: $${monto.toFixed(2)} (precio simulado)`;
    modalPagoFondo.classList.add('visible');
    bloquearScrollPagina();
  }

  campoMetodo.addEventListener('change', () => {
    camposTarjeta.style.display = campoMetodo.value === 'tarjeta' ? 'block' : 'none';
  });

  campoTipoDte.addEventListener('change', () => {
    camposCreditoFiscal.style.display = campoTipoDte.value === '03' ? 'block' : 'none';
  });

  document.getElementById('modal-pago-cancelar').addEventListener('click', () => {
    modalPagoFondo.classList.remove('visible');
    desbloquearScrollPagina();
  });

  formPago.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    modalPagoMensaje.innerHTML = '';

    const datos = {
      reserva_id: reservaEnPago.id,
      metodo: campoMetodo.value,
      tipo_dte: campoTipoDte.value,
    };
    if (datos.metodo === 'tarjeta') {
      datos.numero_tarjeta = document.getElementById('pago-numero').value.trim();
      datos.vencimiento = document.getElementById('pago-vencimiento').value.trim();
      datos.cvv = document.getElementById('pago-cvv').value.trim();
    }
    if (datos.tipo_dte === '03') {
      datos.cliente_nombre = document.getElementById('cf-nombre').value.trim();
      datos.cliente_nit = document.getElementById('cf-nit').value.trim();
      datos.cliente_nrc = document.getElementById('cf-nrc').value.trim();
      datos.cliente_giro = document.getElementById('cf-giro').value.trim();
      datos.cliente_direccion = document.getElementById('cf-direccion').value.trim();
    }

    const botonPagar = document.getElementById('modal-pago-pagar');
    botonPagar.disabled = true;
    botonPagar.textContent = 'Procesando…';

    try {
      const resultado = await api.crearPago(datos);
      modalPagoFondo.classList.remove('visible');
      desbloquearScrollPagina();
      await cargarReservas();
      const numeroFactura = resultado?.pago?.factura?.numero ? ` (${resultado.pago.factura.numero})` : '';
      mensajeLista.innerHTML = `<div class="mensaje mensaje--exito">Pago aprobado. Te enviamos la factura${numeroFactura} por correo.</div>`;
    } catch (error) {
      modalPagoMensaje.innerHTML = `<div class="mensaje mensaje--error">${error.message}</div>`;
    } finally {
      botonPagar.disabled = false;
      botonPagar.textContent = 'Pagar';
    }
  });

  await cargarIdsRecursos();
  await cargarReservas();
})();
