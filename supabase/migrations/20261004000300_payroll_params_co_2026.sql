-- Actualiza parámetros legales a valores vigentes Colombia (oct 2026)
-- SMMLV / auxilio: Decretos 1469 y 1470 de 2025 (ratificados Dec. 0159/2026)
-- Nocturno 19:00 y recargo dominical 90%: Ley 2466 de 2025 (vigente desde 1 jul 2026)

ALTER TABLE public.payroll_legal_params
  ALTER COLUMN night_start_time SET DEFAULT '19:00',
  ALTER COLUMN surcharge_sunday_holiday SET DEFAULT 90,
  ALTER COLUMN surcharge_extra_day_sunday SET DEFAULT 115,
  ALTER COLUMN surcharge_extra_night_sunday SET DEFAULT 165;

UPDATE public.payroll_legal_params
SET
  smmlv = 1750905,
  transport_aid = 249095,
  night_start_time = '19:00',
  surcharge_sunday_holiday = 90,
  surcharge_extra_day_sunday = 115,
  surcharge_extra_night_sunday = 165,
  notes = COALESCE(
    NULLIF(trim(notes), ''),
    'Parámetros Colombia vigentes 2026'
  ) || ' | Actualizado oct-2026: SMMLV $1.750.905, auxilio $249.095, nocturno 19:00, dominical 90%.',
  updated_at = timezone('utc', now())
WHERE deleted_at IS NULL
  AND effective_to IS NULL;
