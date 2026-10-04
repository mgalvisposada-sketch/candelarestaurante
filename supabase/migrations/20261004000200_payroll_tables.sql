-- Nómina parte 2: tablas, columnas, seed y RLS

-- ---------------------------------------------------------------------------
-- Migrar vínculos antiguos → tipología restaurante
-- ---------------------------------------------------------------------------
UPDATE public.employees
SET employment_type = 'INDEFINIDO'
WHERE employment_type = 'LABORAL';

UPDATE public.employees
SET employment_type = 'TERMINO_FIJO'
WHERE employment_type = 'TEMPORAL';

UPDATE public.employees
SET employment_type = 'PRESTACION_SERVICIOS'
WHERE employment_type = 'OTRO';

ALTER TABLE public.employees
  ALTER COLUMN employment_type SET DEFAULT 'INDEFINIDO';

-- ---------------------------------------------------------------------------
-- Extender employees
-- ---------------------------------------------------------------------------
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS contract_end_date date,
  ADD COLUMN IF NOT EXISTS basic_salary numeric(18, 2),
  ADD COLUMN IF NOT EXISTS receives_transport_aid boolean,
  ADD COLUMN IF NOT EXISTS arl_risk_level public.arl_risk_level NOT NULL DEFAULT 'I',
  ADD COLUMN IF NOT EXISTS ordinary_entry_time time,
  ADD COLUMN IF NOT EXISTS ordinary_exit_time time,
  ADD COLUMN IF NOT EXISTS break_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS uses_custom_schedule boolean NOT NULL DEFAULT false;

UPDATE public.employees
SET basic_salary = salary_or_fee
WHERE basic_salary IS NULL AND salary_or_fee IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Bonificaciones
-- ---------------------------------------------------------------------------
CREATE TABLE public.employee_bonuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  employee_id uuid NOT NULL REFERENCES public.employees (id),
  bonus_type public.employee_bonus_type NOT NULL DEFAULT 'FIJA',
  name text NOT NULL,
  amount numeric(18, 2),
  percent_of_salary numeric(7, 4),
  description text,
  is_active boolean NOT NULL DEFAULT true,
  effective_from date,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_by uuid REFERENCES public.profiles (id),
  updated_by uuid REFERENCES public.profiles (id),
  deleted_at timestamptz,
  CONSTRAINT employee_bonuses_amount_or_percent CHECK (
    amount IS NOT NULL OR percent_of_salary IS NOT NULL
  )
);

CREATE INDEX employee_bonuses_employee_idx
  ON public.employee_bonuses (employee_id)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Horario Candela (plantilla org)
-- ---------------------------------------------------------------------------
CREATE TABLE public.payroll_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  name text NOT NULL DEFAULT 'Horario Candela',
  is_active boolean NOT NULL DEFAULT true,
  ordinary_entry_time time NOT NULL DEFAULT '10:00',
  ordinary_exit_time time NOT NULL DEFAULT '22:00',
  break_minutes integer NOT NULL DEFAULT 60,
  works_monday boolean NOT NULL DEFAULT true,
  works_tuesday boolean NOT NULL DEFAULT true,
  works_wednesday boolean NOT NULL DEFAULT true,
  works_thursday boolean NOT NULL DEFAULT true,
  works_friday boolean NOT NULL DEFAULT true,
  works_saturday boolean NOT NULL DEFAULT true,
  works_sunday boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_by uuid REFERENCES public.profiles (id),
  updated_by uuid REFERENCES public.profiles (id),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX payroll_schedules_one_active_per_org
  ON public.payroll_schedules (organization_id)
  WHERE is_active = true AND deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Parámetros legales (vigencias)
-- ---------------------------------------------------------------------------
CREATE TABLE public.payroll_legal_params (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  effective_from date NOT NULL,
  effective_to date,
  notes text,

  max_weekly_hours numeric(6, 2) NOT NULL DEFAULT 42,
  night_start_time time NOT NULL DEFAULT '19:00',
  night_end_time time NOT NULL DEFAULT '06:00',

  surcharge_night_ordinary numeric(7, 4) NOT NULL DEFAULT 35,
  surcharge_sunday_holiday numeric(7, 4) NOT NULL DEFAULT 90,
  surcharge_extra_day numeric(7, 4) NOT NULL DEFAULT 25,
  surcharge_extra_night numeric(7, 4) NOT NULL DEFAULT 75,
  surcharge_extra_day_sunday numeric(7, 4) NOT NULL DEFAULT 115,
  surcharge_extra_night_sunday numeric(7, 4) NOT NULL DEFAULT 165,

  smmlv numeric(18, 2) NOT NULL,
  transport_aid numeric(18, 2) NOT NULL,
  transport_aid_max_salaries numeric(6, 2) NOT NULL DEFAULT 2,

  employee_health_pct numeric(7, 4) NOT NULL DEFAULT 4,
  employee_pension_pct numeric(7, 4) NOT NULL DEFAULT 4,
  solidarity_pension_threshold_smmlv numeric(6, 2) NOT NULL DEFAULT 4,
  solidarity_pension_pct numeric(7, 4) NOT NULL DEFAULT 1,
  apply_solidarity_pension boolean NOT NULL DEFAULT true,

  employer_health_pct numeric(7, 4) NOT NULL DEFAULT 8.5,
  employer_pension_pct numeric(7, 4) NOT NULL DEFAULT 12,
  arl_pct_level_i numeric(7, 4) NOT NULL DEFAULT 0.522,
  arl_pct_level_ii numeric(7, 4) NOT NULL DEFAULT 1.044,
  arl_pct_level_iii numeric(7, 4) NOT NULL DEFAULT 2.436,
  arl_pct_level_iv numeric(7, 4) NOT NULL DEFAULT 4.350,
  arl_pct_level_v numeric(7, 4) NOT NULL DEFAULT 6.960,

  sena_pct numeric(7, 4) NOT NULL DEFAULT 2,
  icbf_pct numeric(7, 4) NOT NULL DEFAULT 3,
  compensation_fund_pct numeric(7, 4) NOT NULL DEFAULT 4,
  parafiscal_exemption_max_smmlv numeric(6, 2) NOT NULL DEFAULT 10,
  apply_parafiscales boolean NOT NULL DEFAULT true,
  apply_parafiscal_exemption boolean NOT NULL DEFAULT true,

  provision_prima_pct numeric(7, 4) NOT NULL DEFAULT 8.33,
  provision_cesantias_pct numeric(7, 4) NOT NULL DEFAULT 8.33,
  provision_interest_cesantias_pct numeric(7, 4) NOT NULL DEFAULT 1,
  provision_vacaciones_pct numeric(7, 4) NOT NULL DEFAULT 4.17,

  round_to_peso boolean NOT NULL DEFAULT true,

  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_by uuid REFERENCES public.profiles (id),
  updated_by uuid REFERENCES public.profiles (id),
  deleted_at timestamptz
);

CREATE INDEX payroll_legal_params_org_from_idx
  ON public.payroll_legal_params (organization_id, effective_from DESC)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Seed por organización existente
-- ---------------------------------------------------------------------------
INSERT INTO public.payroll_schedules (
  organization_id,
  name,
  is_active,
  ordinary_entry_time,
  ordinary_exit_time,
  break_minutes,
  works_monday,
  works_tuesday,
  works_wednesday,
  works_thursday,
  works_friday,
  works_saturday,
  works_sunday
)
SELECT
  o.id,
  'Horario Candela',
  true,
  '10:00'::time,
  '22:00'::time,
  60,
  true, true, true, true, true, true, false
FROM public.organizations o
WHERE o.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.payroll_schedules s
    WHERE s.organization_id = o.id
      AND s.deleted_at IS NULL
  );

INSERT INTO public.payroll_legal_params (
  organization_id,
  effective_from,
  notes,
  smmlv,
  transport_aid
)
SELECT
  o.id,
  DATE '2026-01-01',
  'Colombia 2026: SMMLV $1.750.905 (Dec. 1469/2025), auxilio $249.095 (Dec. 1470/2025), nocturno 19:00, dominical 90% (Ley 2466/2025).',
  1750905,
  249095
FROM public.organizations o
WHERE o.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.payroll_legal_params p
    WHERE p.organization_id = o.id
      AND p.deleted_at IS NULL
  );

-- Heredar horario Candela en empleados sin turno propio
UPDATE public.employees e
SET
  ordinary_entry_time = s.ordinary_entry_time,
  ordinary_exit_time = s.ordinary_exit_time,
  break_minutes = s.break_minutes,
  uses_custom_schedule = false
FROM public.payroll_schedules s
WHERE e.organization_id = s.organization_id
  AND s.is_active = true
  AND s.deleted_at IS NULL
  AND e.ordinary_entry_time IS NULL
  AND e.deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'employee_bonuses',
    'payroll_schedules',
    'payroll_legal_params'
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
