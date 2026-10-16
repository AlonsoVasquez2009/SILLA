-- Agrega el control de equipo dañado / en reparación / dado de baja.
-- Se puede ejecutar varias veces sin error.

-- "danados" es la tercera pata del inventario: ahora
-- disponibles + prestados + danados = total.
ALTER TABLE recursos ADD COLUMN IF NOT EXISTS danados INTEGER NOT NULL DEFAULT 0 CHECK (danados >= 0);

ALTER TABLE recursos DROP CONSTRAINT IF EXISTS recursos_disponibles_prestados_check;
ALTER TABLE recursos DROP CONSTRAINT IF EXISTS recursos_check;
ALTER TABLE recursos ADD CONSTRAINT recursos_disponibles_prestados_check
  CHECK (disponibles + prestados + danados = total);

-- Cada fila es un reporte de daño o pérdida sobre cierta cantidad de un
-- recurso. "origen" indica si el equipo estaba disponible en bodega o
-- prestado (en cuyo caso también se descuenta del préstamo correspondiente).
CREATE TABLE IF NOT EXISTS incidencias (
  id                SERIAL PRIMARY KEY,
  recurso_id        INTEGER NOT NULL REFERENCES recursos(id),
  prestamo_id       INTEGER REFERENCES prestamos(id),
  tipo_incidencia   VARCHAR(10) NOT NULL CHECK (tipo_incidencia IN ('dano', 'perdida')),
  origen            VARCHAR(12) NOT NULL CHECK (origen IN ('disponible', 'prestamo')),
  cantidad          INTEGER NOT NULL CHECK (cantidad > 0),
  descripcion       TEXT,
  estado            VARCHAR(20) NOT NULL DEFAULT 'reportado'
                    CHECK (estado IN ('reportado', 'en_reparacion', 'reparado', 'dado_de_baja')),
  reportado_por     INTEGER NOT NULL REFERENCES usuarios(id),
  resuelto_por      INTEGER REFERENCES usuarios(id),
  fecha_reporte     TIMESTAMP NOT NULL DEFAULT NOW(),
  fecha_resolucion  TIMESTAMP,
  CHECK (origen = 'disponible' OR prestamo_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_incidencias_fecha ON incidencias (fecha_reporte);
CREATE INDEX IF NOT EXISTS idx_incidencias_estado ON incidencias (estado);
CREATE INDEX IF NOT EXISTS idx_incidencias_recurso ON incidencias (recurso_id);
