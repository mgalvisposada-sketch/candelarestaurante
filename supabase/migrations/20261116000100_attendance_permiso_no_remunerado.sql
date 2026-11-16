-- Permiso no remunerado de día completo en planilla de asistencia.
-- Descuenta la jornada ordinaria en la liquidación (sin ingreso/salida).

ALTER TYPE public.payroll_attendance_day_kind
  ADD VALUE IF NOT EXISTS 'PERMISO_NO_REMUNERADO';
