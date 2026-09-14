-- Candela Admin — RLS for MVP 1 domain tables + private documents bucket

-- Helper macro pattern: member read, writers write

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'shareholders',
    'shareholder_accounts',
    'shareholder_transactions',
    'handover_sessions',
    'handover_items',
    'handover_snapshots',
    'bank_accounts',
    'bank_balance_snapshots',
    'bank_transactions',
    'suppliers',
    'accounts_payable',
    'accounts_payable_documents',
    'accounts_payable_payments',
    'loans',
    'loan_disbursements',
    'loan_payment_schedule',
    'loan_payments',
    'funding_allocations',
    'documents',
    'integration_sources',
    'integration_imports'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT USING (public.is_org_member(organization_id))',
      t || '_select_member',
      t
    );

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (public.can_write_org(organization_id))',
      t || '_insert_writers',
      t
    );

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE USING (public.can_write_org(organization_id)) WITH CHECK (public.can_write_org(organization_id))',
      t || '_update_writers',
      t
    );
  END LOOP;
END $$;

-- Audit logs: members can read; inserts via authenticated members (app layer)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_logs_select_member
  ON public.audit_logs FOR SELECT
  USING (
    organization_id IS NULL
    OR public.is_org_member(organization_id)
  );

CREATE POLICY audit_logs_insert_member
  ON public.audit_logs FOR INSERT
  WITH CHECK (
    organization_id IS NULL
    OR public.is_org_member(organization_id)
  );

-- No UPDATE/DELETE policies on audit_logs or handover_snapshots (immutable)

-- Snapshots: writers can insert (on close); no update/delete policies
DROP POLICY IF EXISTS handover_snapshots_update_writers ON public.handover_snapshots;

-- ---------------------------------------------------------------------------
-- Storage: private documents bucket
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  false,
  26214400,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Path convention: {organization_id}/...
CREATE POLICY documents_storage_select
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documents'
    AND public.is_org_member((storage.foldername(name))[1]::uuid)
  );

CREATE POLICY documents_storage_insert
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'documents'
    AND public.can_write_org((storage.foldername(name))[1]::uuid)
  );

CREATE POLICY documents_storage_update
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'documents'
    AND public.can_write_org((storage.foldername(name))[1]::uuid)
  )
  WITH CHECK (
    bucket_id = 'documents'
    AND public.can_write_org((storage.foldername(name))[1]::uuid)
  );

CREATE POLICY documents_storage_delete
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'documents'
    AND public.can_write_org((storage.foldername(name))[1]::uuid)
  );
