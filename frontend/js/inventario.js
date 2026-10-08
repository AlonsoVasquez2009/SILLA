(async () => {
  const usuario = await protegerPagina();
  if (!usuario) return;
  configurarLogout();

  const esAdmin = usuario.rol === 'admin';
  if (!esAdmin) {
    document.getElementById('enlace-historial').remove();
    document.getElementById('enlace-usuarios').remove();
  }

  const mensaje = document.getElementById('mensaje');
  const cuerpoTabla = document.getElementById('cuerpo-tabla');
  const modalFondo = document.getElementById('modal-fondo');
  const modalNombre = document.getElementById('modal-nombre-recurso');
  const modalTotal = document.getElementById('modal-total');
  const modalMensaje = document.getElementById('modal-mensaje');

  let recursoEnEdicion = null;

  async function cargar() {
    mensaje.innerHTML = '';
    try {
      const { recursos } = await api.obtenerInventario();
      cuerpoTabla.innerHTML = recursos
        .map(
          (r) => `
        <tr>
          <td>${r.nombre}</td>
          <td>${r.total}</td>
          <td>${r.disponibles}</td>
          <td>${r.reservados}</td>
          <td>${r.prestados}</td>
          <td>${esAdmin ? `<button class="boton boton--secundario" data-id="${r.id}" data-nombre="${r.nombre}" data-total="${r.total}">Editar</button>` : ''}</td>
        </tr>`
        )
        .join('');

      if (esAdmin) {
        cuerpoTabla.querySelectorAll('button[data-id]').forEach((boton) => {
          boton.addEventListener('click', () => abrirModal(boton.dataset));
        });
      }
    } catch (error) {
      mensaje.innerHTML = `<div class="mensaje mensaje--error">${error.message}</div>`;
    }
  }

  function abrirModal(datos) {
    recursoEnEdicion = datos.id;
    modalNombre.textContent = datos.nombre;
    modalTotal.value = datos.total;
    modalMensaje.innerHTML = '';
    modalFondo.classList.add('visible');
  }

  document.getElementById('modal-cancelar').addEventListener('click', () => {
    modalFondo.classList.remove('visible');
  });

  document.getElementById('modal-guardar').addEventListener('click', async () => {
    modalMensaje.innerHTML = '';
    try {
      await api.actualizarRecurso(recursoEnEdicion, Number(modalTotal.value));
      modalFondo.classList.remove('visible');
      await cargar();
    } catch (error) {
      modalMensaje.innerHTML = `<div class="mensaje mensaje--error">${error.message}</div>`;
    }
  });

  await cargar();
})();
