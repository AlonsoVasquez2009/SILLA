-- Esquema del sistema de mesas y sillas.
-- Se puede ejecutar varias veces sin error gracias a IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS roles (
  id      SERIAL PRIMARY KEY,
  nombre  VARCHAR(30) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS usuarios (
  id             SERIAL PRIMARY KEY,
  nombre         VARCHAR(100) NOT NULL,
  email          VARCHAR(150) NOT NULL UNIQUE,
  password_hash  VARCHAR(255) NOT NULL,
  rol_id         INTEGER NOT NULL REFERENCES roles(id),
  activo         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Inventario: fuente única de cantidades por recurso.
-- La suma disponibles + reservados + prestados debe igualar total.
CREATE TABLE IF NOT EXISTS recursos (
  id           SERIAL PRIMARY KEY,
  nombre       VARCHAR(50) NOT NULL UNIQUE,
  tipo         VARCHAR(10) NOT NULL CHECK (tipo IN ('mesa', 'silla')),
  total        INTEGER NOT NULL CHECK (total >= 0),
  disponibles  INTEGER NOT NULL CHECK (disponibles >= 0),
  reservados   INTEGER NOT NULL CHECK (reservados >= 0),
  prestados    INTEGER NOT NULL CHECK (prestados >= 0),
  CHECK (disponibles + reservados + prestados = total)
);

CREATE TABLE IF NOT EXISTS reservas (
  id           SERIAL PRIMARY KEY,
  usuario_id   INTEGER NOT NULL REFERENCES usuarios(id),
  fecha        DATE NOT NULL,
  hora_inicio  TIME NOT NULL,
  hora_fin     TIME NOT NULL,
  estado       VARCHAR(20) NOT NULL DEFAULT 'Confirmada'
               CHECK (estado IN ('Confirmada', 'Cancelada', 'Finalizada')),
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  CHECK (hora_fin > hora_inicio)
);

CREATE TABLE IF NOT EXISTS detalle_reservas (
  id          SERIAL PRIMARY KEY,
  reserva_id  INTEGER NOT NULL REFERENCES reservas(id) ON DELETE CASCADE,
  recurso_id  INTEGER NOT NULL REFERENCES recursos(id),
  cantidad    INTEGER NOT NULL CHECK (cantidad > 0),
  UNIQUE (reserva_id, recurso_id)
);

CREATE TABLE IF NOT EXISTS prestamos (
  id                SERIAL PRIMARY KEY,
  usuario_id        INTEGER NOT NULL REFERENCES usuarios(id),
  reserva_id        INTEGER UNIQUE REFERENCES reservas(id),
  fecha_prestamo    DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_prevista    DATE NOT NULL,
  estado            VARCHAR(25) NOT NULL DEFAULT 'Activo'
                    CHECK (estado IN ('Activo', 'Parcialmente devuelto', 'Devuelto', 'Vencido')),
  observaciones     TEXT,
  CHECK (fecha_prevista >= fecha_prestamo)
);

CREATE TABLE IF NOT EXISTS detalle_prestamos (
  id           SERIAL PRIMARY KEY,
  prestamo_id  INTEGER NOT NULL REFERENCES prestamos(id) ON DELETE CASCADE,
  recurso_id   INTEGER NOT NULL REFERENCES recursos(id),
  cantidad     INTEGER NOT NULL CHECK (cantidad > 0),
  devuelto     INTEGER NOT NULL DEFAULT 0 CHECK (devuelto >= 0),
  UNIQUE (prestamo_id, recurso_id),
  CHECK (devuelto <= cantidad)
);

-- Cada evento de devolución (total o parcial) es un registro independiente.
CREATE TABLE IF NOT EXISTS devoluciones (
  id              SERIAL PRIMARY KEY,
  prestamo_id     INTEGER NOT NULL REFERENCES prestamos(id) ON DELETE CASCADE,
  registrado_por  INTEGER NOT NULL REFERENCES usuarios(id),
  fecha_real      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS detalle_devoluciones (
  id              SERIAL PRIMARY KEY,
  devolucion_id   INTEGER NOT NULL REFERENCES devoluciones(id) ON DELETE CASCADE,
  recurso_id      INTEGER NOT NULL REFERENCES recursos(id),
  cantidad        INTEGER NOT NULL CHECK (cantidad > 0),
  UNIQUE (devolucion_id, recurso_id)
);

CREATE TABLE IF NOT EXISTS historial (
  id                 SERIAL PRIMARY KEY,
  usuario_id         INTEGER REFERENCES usuarios(id),
  tipo_operacion     VARCHAR(50) NOT NULL,
  recurso_id         INTEGER REFERENCES recursos(id),
  cantidad           INTEGER,
  estado_anterior    VARCHAR(50),
  estado_posterior   VARCHAR(50),
  fecha              TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Índices para las consultas más frecuentes.
CREATE INDEX IF NOT EXISTS idx_reservas_fecha ON reservas (fecha);
CREATE INDEX IF NOT EXISTS idx_reservas_usuario ON reservas (usuario_id);
CREATE INDEX IF NOT EXISTS idx_prestamos_usuario ON prestamos (usuario_id);
CREATE INDEX IF NOT EXISTS idx_prestamos_estado ON prestamos (estado);
CREATE INDEX IF NOT EXISTS idx_historial_fecha ON historial (fecha);

-- Roles básicos del sistema.
INSERT INTO roles (nombre) VALUES ('admin'), ('usuario')
ON CONFLICT (nombre) DO NOTHING;
