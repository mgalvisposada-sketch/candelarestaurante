-- Horario Candela: entrada/salida distintas por día de la semana.
-- Si day_hours[día] está vacío, se usan ordinary_entry_time / ordinary_exit_time.

ALTER TABLE public.payroll_schedules
  ADD COLUMN IF NOT EXISTS day_hours jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.payroll_schedules.day_hours IS
  'Overrides por día: {"monday":{"entry":"15:00","exit":"22:30"},...}. Vacío = usa ordinary_*.';
