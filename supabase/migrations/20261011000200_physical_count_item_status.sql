-- Conteo físico por categoría: estado y revisión a nivel de ítem.
-- El encabezado sigue siendo la sesión general; se puede seguir contando
-- otras categorías mientras Gestión revisa las ya enviadas.

ALTER TABLE public.physical_inventory_count_items
  ADD COLUMN IF NOT EXISTS status public.physical_inventory_status NOT NULL DEFAULT 'BORRADOR',
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

CREATE INDEX IF NOT EXISTS physical_inventory_count_items_status_idx
  ON public.physical_inventory_count_items (count_id, status)
  WHERE deleted_at IS NULL;

-- Backfill: ítems heredan el estado del conteo padre (conteos ya cerrados/enviados).
UPDATE public.physical_inventory_count_items AS i
SET
  status = c.status,
  submitted_at = COALESCE(i.submitted_at, c.submitted_at),
  reviewed_at = COALESCE(i.reviewed_at, c.reviewed_at),
  rejection_reason = CASE
    WHEN c.status = 'RECHAZADO' THEN COALESCE(i.rejection_reason, c.rejection_reason)
    ELSE i.rejection_reason
  END
FROM public.physical_inventory_counts AS c
WHERE i.count_id = c.id
  AND c.status <> 'BORRADOR'
  AND i.status = 'BORRADOR';
