// Protege las rutas: exige sesión iniciada y, si se indica, un rol concreto.

// Comprueba que existe una sesión activa.
function requerirSesion(req, res, next) {
  if (!req.session.usuario) {
    return res.status(401).json({ error: 'Debes iniciar sesión' });
  }
  next();
}

// Devuelve un middleware que solo deja pasar a los roles indicados.
// Uso: requerirRol('admin') o requerirRol('admin', 'usuario')
function requerirRol(...rolesPermitidos) {
  return (req, res, next) => {
    const usuario = req.session.usuario;
    if (!usuario) {
      return res.status(401).json({ error: 'Debes iniciar sesión' });
    }
    if (!rolesPermitidos.includes(usuario.rol)) {
      return res.status(403).json({ error: 'No tienes permiso para esta acción' });
    }
    next();
  };
}

module.exports = { requerirSesion, requerirRol };
