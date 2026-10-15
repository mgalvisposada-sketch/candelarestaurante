-- Planilla de asistencia por quincena (fuente de verdad al liquidar nómina).

CREATE TYPE public.payroll_attendance_day_kind AS ENUM (
  'LABORADO',
  'DESCANSO',
  'FESTIVO',
  'FESTIVO_LABORADO'
);

CREATE TABLE public.payroll_attendance_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  period_id uuid NOT NULL REFERENCES public.payroll_periods (id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees (id),
  work_date date NOT NULL,
  day_kind public.payroll_attendance_day_kind NOT NULL DEFAULT 'LABORADO',
  entry_time time,
  exit_time time,
  break_minutes integer NOT NULL DEFAULT 0 CHECK (break_minutes >= 0 AND break_minutes <= 480),
  notes text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_by uuid REFERENCES public.profiles (id),
  updated_by uuid REFERENCES public.profiles (id),
  deleted_at timestamptz,
  CONSTRAINT payroll_attendance_days_times_when_worked CHECK (
    day_kind IN ('DESCANSO', 'FESTIVO')
    OR (entry_time IS NOT NULL AND exit_time IS NOT NULL)
    OR (entry_time IS NULL AND exit_time IS NULL)
  )
);

CREATE UNIQUE INDEX payroll_attendance_days_period_employee_date_uidx
  ON public.payroll_attendance_days (period_id, employee_id, work_date)
  WHERE deleted_at IS NULL;

CREATE INDEX payroll_attendance_days_period_idx
  ON public.payroll_attendance_days (period_id)
  WHERE deleted_at IS NULL;

CREATE INDEX payroll_attendance_days_org_idx
  ON public.payroll_attendance_days (organization_id, work_date)
  WHERE deleted_at IS NULL;

ALTER TABLE public.payroll_attendance_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY payroll_attendance_days_select_member
  ON public.payroll_attendance_days FOR SELECT
  USING (public.is_org_member(organization_id));

CREATE POLICY payroll_attendance_days_insert_writers
  ON public.payroll_attendance_days FOR INSERT
  WITH CHECK (public.can_write_org(organization_id));

CREATE POLICY payroll_attendance_days_update_writers
  ON public.payroll_attendance_days FOR UPDATE
  USING (public.can_write_org(organization_id))
  WITH CHECK (public.can_write_org(organization_id));
