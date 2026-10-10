-- Elimina la columna "reservados", que dejó de usarse cuando la
-- disponibilidad pasó a calcularse por ventana de fecha (margen de 3 dias).
-- CASCADE porque el CHECK (disponibles + reservados + prestados = total)
-- depende de la columna y se elimina junto con ella.
ALTER TABLE recursos DROP COLUMN IF EXISTS reservados CASCADE;

-- Reponemos el CHECK ya sin esa columna.
ALTER TABLE recursos DROP CONSTRAINT IF EXISTS recursos_disponibles_prestados_check;
ALTER TABLE recursos ADD CONSTRAINT recursos_disponibles_prestados_check
  CHECK (disponibles + prestados = total);
