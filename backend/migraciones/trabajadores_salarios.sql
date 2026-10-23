-- Tablas de trabajadores y salarios, basadas en el Código de Trabajo de
-- El Salvador: jornada (Art. 161), recargo nocturno (Art. 168), horas
-- extra (Art. 169), vacaciones con 30% de recargo (Art. 177) y aguinaldo
-- proporcional a la antigüedad (Art. 196-200).

CREATE TABLE IF NOT EXISTS trabajadores (
  id                    SERIAL PRIMARY KEY,
  nombre                VARCHAR(100) NOT NULL,
  documento             VARCHAR(20) UNIQUE,              -- DUI
  cargo                 VARCHAR(50),
  fecha_contratacion    DATE NOT NULL,
  salario_base_mensual  NUMERIC(10,2) NOT NULL CHECK (salario_base_mensual > 0),
  jornada               VARCHAR(10) NOT NULL DEFAULT 'diurna'
                         CHECK (jornada IN ('diurna', 'nocturna')),
  activo                BOOLEAN NOT NULL DEFAULT true,
  creado_en             TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS salarios (
  id                          SERIAL PRIMARY KEY,
  trabajador_id               INTEGER NOT NULL REFERENCES trabajadores(id),
  periodo_inicio               DATE NOT NULL,
  periodo_fin                  DATE NOT NULL,
  salario_base                 NUMERIC(10,2) NOT NULL,   -- snapshot del salario al momento de pagar
  horas_extra_diurnas          NUMERIC(6,2) NOT NULL DEFAULT 0,
  horas_extra_nocturnas        NUMERIC(6,2) NOT NULL DEFAULT 0,
  horas_trabajadas_descanso    NUMERIC(6,2) NOT NULL DEFAULT 0, -- Art. 172: trabajo en día de descanso semanal
  monto_horas_extra            NUMERIC(10,2) NOT NULL DEFAULT 0,
  monto_recargo_descanso       NUMERIC(10,2) NOT NULL DEFAULT 0,
  incluye_aguinaldo            BOOLEAN NOT NULL DEFAULT false,
  monto_aguinaldo               NUMERIC(10,2) NOT NULL DEFAULT 0,
  incluye_vacaciones           BOOLEAN NOT NULL DEFAULT false,
  monto_vacaciones             NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_pagar                  NUMERIC(10,2) NOT NULL,
  fecha_pago                   DATE,
  creado_en                    TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT salarios_periodo_check CHECK (periodo_fin >= periodo_inicio)
);

CREATE INDEX IF NOT EXISTS idx_salarios_trabajador ON salarios(trabajador_id);
