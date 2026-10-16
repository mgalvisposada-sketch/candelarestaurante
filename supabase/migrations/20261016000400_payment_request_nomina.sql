-- Solicitudes de pago originadas en nómina quincenal (colilla emitida)

ALTER TYPE public.payment_request_source ADD VALUE IF NOT EXISTS 'NOMINA';

ALTER TABLE public.payment_requests
  ADD COLUMN IF NOT EXISTS payroll_period_line_id uuid
    REFERENCES public.payroll_period_lines (id);

COMMENT ON COLUMN public.payment_requests.payroll_period_line_id IS
  'Línea de liquidación quincenal que originó esta solicitud (neto a pagar).';

CREATE INDEX IF NOT EXISTS payment_requests_payroll_line_idx
  ON public.payment_requests (payroll_period_line_id)
  WHERE deleted_at IS NULL AND payroll_period_line_id IS NOT NULL;

-- Una solicitud activa por colilla (permite reenviar si fue anulada/rechazada)
CREATE UNIQUE INDEX IF NOT EXISTS payment_requests_payroll_line_active_uidx
  ON public.payment_requests (payroll_period_line_id)
  WHERE deleted_at IS NULL
    AND payroll_period_line_id IS NOT NULL
    AND status IN (
      'BORRADOR',
      'EN_REVISION',
      'APROBADA',
      'EN_COLA_PAGO',
      'PAGADA'
    );
