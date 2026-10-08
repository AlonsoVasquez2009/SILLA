(async () => {
  const usuario = await protegerPagina('admin');
  if (!usuario) return;
  configurarLogout();

  const mensajeForm = document.getElementById('mensaje-form');
  const mensajeLista = document.getElementById('mensaje-lista');
  const cuerpoTabla = document.getElementById('cuerpo-tabla');

  async function cargarUsuarios() {
    mensajeLista.innerHTML = '';
    try {
      const { usuarios } = await api.listarUsuarios();
      pintarUsuarios(usuarios);
    } catch (error) {
      mensajeLista.innerHTML = `<div class="mensaje mensaje--error">${error.message}</div>`;
    }
  }

  function pintarUsuarios(usuarios) {
    cuerpoTabla.innerHTML = usuarios
      .map(
        (u) => `
      <tr>
        <td>${u.nombre}</td>
        <td>${u.email}</td>
        <td>${u.rol}</td>
        <td><span class="estado ${u.activo ? 'estado--devuelto' : 'estado--cancelada'}">${u.activo ? 'Activo' : 'Inactivo'}</span></td>
        <td>
          ${
            u.id === usuario.id
              ? ''
              : `<button class="boton boton--secundario" data-id="${u.id}" data-activo="${u.activo}">
                   ${u.activo ? 'Desactivar' : 'Activar'}
                 </button>`
          }
        </td>
      </tr>`
      )
      .join('');

    cuerpoTabla.querySelectorAll('button[data-id]').forEach((boton) => {
      boton.addEventListener('click', async () => {
        const activo = boton.dataset.activo !== 'true';
        try {
          await api.modificarUsuario(boton.dataset.id, { activo });
          await cargarUsuarios();
        } catch (error) {
          mensajeLista.innerHTML = `<div class="mensaje mensaje--error">${error.message}</div>`;
        }
      });
    });
  }

  document.getElementById('form-usuario').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    mensajeForm.innerHTML = '';

    const nombre = document.getElementById('nombre').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const rol = document.getElementById('rol').value;

    try {
      await api.crearUsuario({ nombre, email, password, rol });
      document.getElementById('form-usuario').reset();
      await cargarUsuarios();
      mensajeForm.innerHTML = '<div class="mensaje mensaje--exito">Usuario creado.</div>';
    } catch (error) {
      mensajeForm.innerHTML = `<div class="mensaje mensaje--error">${error.message}</div>`;
    }
  });

  await cargarUsuarios();
})();
