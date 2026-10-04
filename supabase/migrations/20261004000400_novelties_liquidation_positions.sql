-- Cargos, novedades de turno y liquidación quincenal

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
CREATE TYPE public.shift_novelty_type AS ENUM (
  'LLEGADA_TARDE',
  'SALIDA_TEMPRANA',
  'PERMISO_REMUNERADO',
  'PERMISO_NO_REMUNERADO',
  'AUSENCIA',
  'HORA_EXTRA',
  'ANTICIPO',
  'DESCUENTO_AUTORIZADO',
  'BONO_OCASIONAL'
);

CREATE TYPE public.shift_novelty_status AS ENUM (
  'BORRADOR',
  'PENDIENTE',
  'APROBADA',
  'RECHAZADA',
  'ANULADA'
);

CREATE TYPE public.payroll_period_status AS ENUM (
  'BORRADOR',
  'CALCULADA',
  'EMITIDA',
  'CERRADA'
);

-- ---------------------------------------------------------------------------
-- Maestro de cargos
-- ---------------------------------------------------------------------------
CREATE TABLE public.job_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  code text,
  name text NOT NULL,
  arl_risk_level public.arl_risk_level NOT NULL DEFAULT 'III',
  default_break_minutes integer NOT NULL DEFAULT 60,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_by uuid REFERENCES public.profiles (id),
  updated_by uuid REFERENCES public.profiles (id),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX job_positions_org_name_uidx
  ON public.job_positions (organization_id, lower(name))
  WHERE deleted_at IS NULL;

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS position_id uuid REFERENCES public.job_positions (id);

-- Seed cargos por organización
INSERT INTO public.job_positions (organization_id, code, name, arl_risk_level, notes)
SELECT o.id, v.code, v.name, v.arl::public.arl_risk_level, v.notes
FROM public.organizations o
CROSS JOIN (
  VALUES
    ('GER', 'Gerente / Administrador de local', 'I', 'Riesgo administrativo bajo. ARL oficial empresa suele ser por CIIU.'),
    ('BOF', 'Contador / back-office', 'I', 'Trabajo de oficina / administración.'),
    ('CAJ', 'Cajero / Hostess / Anfitrión', 'I', 'Atención al público con bajo riesgo físico.'),
    ('MES', 'Mesero / Capitán de meseros', 'II', 'Servicio en salón.'),
    ('BAR', 'Bartender / Barista', 'II', 'Barra y bebidas.'),
    ('COC', 'Cocinero / Chef de partida', 'III', 'Cocina: cortes, calor, grasas. Alineado a CIIU 5611 clase III.'),
    ('AUX', 'Auxiliar de cocina / Lavaplatos', 'III', 'Cocina y lavado.'),
    ('DOM_M', 'Domiciliario (moto)', 'IV', 'Exposición vial alta.'),
    ('DOM_B', 'Domiciliario (bici / a pie)', 'III', 'Entrega sin moto.'),
    ('SST', 'SST / mantenimiento operativo', 'III', 'Mantenimiento y riesgos operativos del local.')
) AS v(code, name, arl, notes)
WHERE o.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.job_positions j
    WHERE j.organization_id = o.id AND j.deleted_at IS NULL
  );

-- ---------------------------------------------------------------------------
-- Novedades
-- ---------------------------------------------------------------------------
CREATE TABLE public.shift_novelties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  employee_id uuid NOT NULL REFERENCES public.employees (id),
  novelty_date date NOT NULL,
  novelty_type public.shift_novelty_type NOT NULL,
  status public.shift_novelty_status NOT NULL DEFAULT 'PENDIENTE',
  minutes integer,
  amount numeric(18, 2),
  start_time time,
  end_time time,
  is_paid boolean,
  notes text,
  support_note text,
  reported_by uuid REFERENCES public.profiles (id),
  reviewed_by uuid REFERENCES public.profiles (id),
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_by uuid REFERENCES public.profiles (id),
  updated_by uuid REFERENCES public.profiles (id),
  deleted_at timestamptz,
  CONSTRAINT shift_novelties_time_or_amount CHECK (
    minutes IS NOT NULL OR amount IS NOT NULL OR start_time IS NOT NULL
  )
);

CREATE INDEX shift_novelties_org_date_idx
  ON public.shift_novelties (organization_id, novelty_date)
  WHERE deleted_at IS NULL;

CREATE INDEX shift_novelties_employee_status_idx
  ON public.shift_novelties (employee_id, status)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Liquidación quincenal
-- ---------------------------------------------------------------------------
CREATE TABLE public.payroll_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  period_year integer NOT NULL,
  period_month integer NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_half smallint NOT NULL CHECK (period_half IN (1, 2)),
  period_start date NOT NULL,
  period_end date NOT NULL,
  status public.payroll_period_status NOT NULL DEFAULT 'BORRADOR',
  notes text,
  calculated_at timestamptz,
  emitted_at timestamptz,
  emitted_by uuid REFERENCES public.profiles (id),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_by uuid REFERENCES public.profiles (id),
  updated_by uuid REFERENCES public.profiles (id),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX payroll_periods_org_half_uidx
  ON public.payroll_periods (organization_id, period_year, period_month, period_half)
  WHERE deleted_at IS NULL;

CREATE TABLE public.payroll_period_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  period_id uuid NOT NULL REFERENCES public.payroll_periods (id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees (id),
  employee_name text NOT NULL,
  position_title text,
  novelty_count integer NOT NULL DEFAULT 0,
  net_pay numeric(18, 2) NOT NULL DEFAULT 0,
  employer_cost numeric(18, 2) NOT NULL DEFAULT 0,
  earnings_total numeric(18, 2) NOT NULL DEFAULT 0,
  deductions_total numeric(18, 2) NOT NULL DEFAULT 0,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  deleted_at timestamptz,
  UNIQUE (period_id, employee_id)
);

CREATE INDEX payroll_period_lines_period_idx
  ON public.payroll_period_lines (period_id)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'job_positions',
    'shift_novelties',
    'payroll_periods',
    'payroll_period_lines'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT USING (public.is_org_member(organization_id))',
      t || '_select_member', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (public.can_write_org(organization_id))',
      t || '_insert_writers', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE USING (public.can_write_org(organization_id)) WITH CHECK (public.can_write_org(organization_id))',
      t || '_update_writers', t
    );
  END LOOP;
END $$;
