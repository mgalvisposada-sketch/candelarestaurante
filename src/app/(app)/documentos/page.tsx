import { AppHeader } from "@/components/layout/app-header";
import { Card, EmptyState, PageIntro, StatCard } from "@/components/ui/primitives";
import { getOrgContext } from "@/lib/org-context";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  DocumentList,
  UploadDocumentForm,
  type DocumentRow,
} from "./documents-client";

export default async function DocumentosPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  if (!ctx.organization) {
    return (
      <>
        <AppHeader title="Documentos" subtitle="Document Center" />
        <main className="p-8">
          <Card>
            <p className="font-medium">Primero configura la empresa</p>
            <Link href="/empresa" className="mt-4 inline-flex rounded-lg bg-[var(--ink)] px-4 py-2 text-sm text-white">
              Ir a Empresa
            </Link>
          </Card>
        </main>
      </>
    );
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("documents")
    .select(
      "id, name, document_type, file_size, mime_type, entity_type, entity_id, created_at",
    )
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const documents = (data ?? []) as DocumentRow[];

  return (
    <>
      <AppHeader
        title="Documentos"
        subtitle="Document Center — Storage privado con URLs firmadas"
      />
      <main className="space-y-6 p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <PageIntro
            title="Evidencia centralizada"
            description="Cada documento se asocia a una entidad. Bucket privado; acceso solo con URL firmada."
          />
          <UploadDocumentForm />
        </div>

        <StatCard label="Documentos" value={String(documents.length)} />

        {documents.length === 0 ? (
          <EmptyState
            title="Sin documentos"
            description="Suba PDF o imágenes con metadata y trazabilidad en audit_logs."
          />
        ) : (
          <DocumentList documents={documents} />
        )}
      </main>
    </>
  );
}
