// Controla el acceso a las páginas protegidas y pinta el nombre de usuario
// en la barra de navegación. Cada página protegida debe llamar a
// protegerPagina() al cargar.

// Comprueba que haya sesión; si no, redirige al login.
// Si se indica un rol, exige además que el usuario tenga ese rol.
async function protegerPagina(rolRequerido) {
  try {
    const { usuario } = await api.me();
    if (rolRequerido && usuario.rol !== rolRequerido) {
      document.body.innerHTML =
        '<div class="contenedor"><p class="mensaje mensaje--error">No tienes permiso para ver esta página.</p></div>';
      return null;
    }
    pintarUsuario(usuario);
    ocultarDashboardSiNoAdmin(usuario);
    return usuario;
  } catch {
    window.location.href = 'index.html';
    return null;
  }
}

function ocultarDashboardSiNoAdmin(usuario) {
  if (usuario.rol === 'admin') return;
  const enlace = document.getElementById('enlace-dashboard');
  if (enlace) enlace.remove();
}

function pintarUsuario(usuario) {
  const nodo = document.getElementById('usuario-actual');
  if (nodo) {
    nodo.textContent = `${usuario.nombre} (${usuario.rol})`;
  }
}

function configurarLogout() {
  const boton = document.getElementById('boton-logout');
  if (!boton) return;
  boton.addEventListener('click', async () => {
    await api.logout();
    window.location.href = 'index.html';
  });
}
