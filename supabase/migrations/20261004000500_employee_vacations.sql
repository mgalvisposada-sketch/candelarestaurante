-- Programación de vacaciones por empleado

CREATE TYPE public.employee_vacation_status AS ENUM (
  'PROGRAMADA',
  'EN_CURSO',
  'DISFRUTADA',
  'CANCELADA'
);

CREATE TABLE public.employee_vacations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  employee_id uuid NOT NULL REFERENCES public.employees (id),
  start_date date NOT NULL,
  end_date date NOT NULL,
  business_days numeric(6, 2) NOT NULL DEFAULT 0,
  status public.employee_vacation_status NOT NULL DEFAULT 'PROGRAMADA',
  notes text,
  document_id uuid REFERENCES public.documents (id),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_by uuid REFERENCES public.profiles (id),
  updated_by uuid REFERENCES public.profiles (id),
  deleted_at timestamptz,
  CONSTRAINT employee_vacations_dates_chk CHECK (end_date >= start_date)
);

CREATE INDEX employee_vacations_employee_idx
  ON public.employee_vacations (employee_id, start_date)
  WHERE deleted_at IS NULL;

ALTER TABLE public.employee_vacations ENABLE ROW LEVEL SECURITY;

CREATE POLICY employee_vacations_select_member
  ON public.employee_vacations FOR SELECT
  USING (public.is_org_member(organization_id));

CREATE POLICY employee_vacations_insert_writers
  ON public.employee_vacations FOR INSERT
  WITH CHECK (public.can_write_org(organization_id));

CREATE POLICY employee_vacations_update_writers
  ON public.employee_vacations FOR UPDATE
  USING (public.can_write_org(organization_id))
  WITH CHECK (public.can_write_org(organization_id));
