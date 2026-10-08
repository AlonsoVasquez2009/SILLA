// Punto único de comunicación con el backend.
// Nadie más en el frontend llama a fetch() directamente.

const BASE_URL = '/api';

// Hace la petición y lanza un error legible si el backend responde con un error.
async function solicitar(ruta, opciones = {}) {
  const respuesta = await fetch(BASE_URL + ruta, {
    credentials: 'include', // envía la cookie de sesión
    headers: { 'Content-Type': 'application/json' },
    ...opciones,
  });

  let cuerpo = null;
  try {
    cuerpo = await respuesta.json();
  } catch {
    // Puede no haber cuerpo JSON (por ejemplo, en algunas respuestas vacías).
  }

  if (!respuesta.ok) {
    const mensaje = (cuerpo && cuerpo.error) || `Error ${respuesta.status}`;
    const error = new Error(mensaje);
    error.status = respuesta.status;
    throw error;
  }

  return cuerpo;
}

const api = {
  // Autenticación
  login: (email, password) =>
    solicitar('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => solicitar('/auth/logout', { method: 'POST' }),
  me: () => solicitar('/auth/me'),

  // Inventario
  obtenerInventario: () => solicitar('/inventario'),
  actualizarRecurso: (id, total) =>
    solicitar(`/inventario/${id}`, { method: 'PUT', body: JSON.stringify({ total }) }),

  // Reservas
  listarReservas: () => solicitar('/reservas'),
  crearReserva: (datos) => solicitar('/reservas', { method: 'POST', body: JSON.stringify(datos) }),
  cancelarReserva: (id) => solicitar(`/reservas/${id}/cancelar`, { method: 'PUT' }),

  // Préstamos
  listarPrestamos: () => solicitar('/prestamos'),
  crearPrestamo: (datos) => solicitar('/prestamos', { method: 'POST', body: JSON.stringify(datos) }),

  // Devoluciones
  registrarDevolucion: (datos) =>
    solicitar('/devoluciones', { method: 'POST', body: JSON.stringify(datos) }),

  // Historial
  obtenerHistorial: (filtros = {}) => {
    const params = new URLSearchParams(filtros).toString();
    return solicitar(`/historial${params ? '?' + params : ''}`);
  },

  // Dashboard y reportes
  obtenerDashboard: () => solicitar('/dashboard'),
  obtenerReporte: (tipo) => solicitar(`/reportes/${tipo}`),
};
