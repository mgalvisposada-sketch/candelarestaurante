-- Liquidaciones por turno parciales: varios gastos por quincena,
-- sin repetir el mismo día del prestador.

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS shift_dates date[];

-- Antes: una sola liquidación por empleado/quincena.
DROP INDEX IF EXISTS public.expenses_shift_liquidation_uidx;

-- Un día laborado activo por prestador (evita doble pago del mismo día).
CREATE UNIQUE INDEX IF NOT EXISTS shift_novelties_turno_laborado_day_uidx
  ON public.shift_novelties (organization_id, employee_id, novelty_date)
  WHERE novelty_type = 'TURNO_LABORADO'
    AND deleted_at IS NULL
    AND status <> 'ANULADA';

-- Backfill: liquidación pagada de Mauro (10 días) y reparación de novedades
-- anuladas por un reintento fallido que seleccionó solo 14 y 15.
UPDATE public.expenses e
SET shift_dates = ARRAY[
  DATE '2026-10-01',
  DATE '2026-10-02',
  DATE '2026-10-03',
  DATE '2026-10-04',
  DATE '2026-10-06',
  DATE '2026-10-07',
  DATE '2026-10-08',
  DATE '2026-10-09',
  DATE '2026-10-10',
  DATE '2026-10-11'
]::date[]
WHERE e.id = 'd9bf8d40-6682-47cb-afea-c3abdb2080c0'
  AND e.expense_kind = 'LIQUIDACION_TURNO'
  AND e.shift_dates IS NULL;

UPDATE public.shift_novelties sn
SET
  status = 'APROBADA',
  updated_at = timezone('utc', now())
WHERE sn.employee_id = '1ea629a6-422b-426b-9c3d-355243bfba57'
  AND sn.novelty_type = 'TURNO_LABORADO'
  AND sn.deleted_at IS NULL
  AND sn.status = 'ANULADA'
  AND sn.notes = 'Turno registrado en liquidación por gasto'
  AND sn.novelty_date = ANY (
    ARRAY[
      DATE '2026-10-01',
      DATE '2026-10-02',
      DATE '2026-10-03',
      DATE '2026-10-04',
      DATE '2026-10-06',
      DATE '2026-10-07',
      DATE '2026-10-08',
      DATE '2026-10-09',
      DATE '2026-10-10',
      DATE '2026-10-11'
    ]::date[]
  );

ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_shift_dates_check;

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_shift_dates_check CHECK (
    (
      expense_kind = 'OPERATIVO'
      AND shift_dates IS NULL
    )
    OR (
      expense_kind = 'LIQUIDACION_TURNO'
      AND shift_dates IS NOT NULL
      AND cardinality(shift_dates) > 0
    )
  );
