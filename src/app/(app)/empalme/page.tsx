import { AppHeader } from "@/components/layout/app-header";
import { Card } from "@/components/ui/primitives";
import { getOrgContext } from "@/lib/org-context";
import { requireModuleAccess } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { summarizeHandoverQuality } from "@/lib/handover";
import { formatCOP } from "@/lib/money";
import { domainLabel, isObsoleteHandoverItem } from "@/lib/handover-catalog";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  CreateHandoverForm,
  EmpalmeMeetingView,
  EmpalmeSteps,
  type HandoverItem,
  type HandoverSession,
} from "./handover-client";

export default async function EmpalmePage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requireModuleAccess(ctx, "empalme");

  if (!ctx.organization) {
    return (
      <>
        <AppHeader
          title="Empalme"
          subtitle="Línea base entre administraciones"
        />
        <main className="p-8">
          <Card>
            <p className="font-display text-lg font-bold">
              Primero configura la empresa
            </p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Antes del empalme necesitamos el nombre de la empresa y una fecha
              de corte.
            </p>
            <Link
              href="/empresa"
              className="mt-4 inline-flex rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--accent-hover)]"
            >
              Ir a Empresa
            </Link>
          </Card>
        </main>
      </>
    );
  }

  const supabase = await createClient();
  const { data: sessionData } = await supabase
    .from("handover_sessions")
    .select("*")
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const session = sessionData as HandoverSession | null;

  let items: HandoverItem[] = [];
  if (session) {
    const { data: itemRows } = await supabase
      .from("handover_items")
      .select(
        "id, domain, item_key, label, amount, verification_status, comments, source, metadata",
      )
      .eq("handover_session_id", session.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    items = ((itemRows ?? []) as HandoverItem[]).filter(
      (item) => !isObsoleteHandoverItem(item),
    );
  }

  const quality = summarizeHandoverQuality(
    items.map((i) => ({ status: i.verification_status })),
  );

  const summaryByDomain = new Map<string, number>();
  for (const item of items) {
    if (item.amount == null) continue;
    summaryByDomain.set(
      item.domain,
      (summaryByDomain.get(item.domain) ?? 0) + Number(item.amount),
    );
  }
  const summaryLines = [...summaryByDomain.entries()]
    .filter(([, amount]) => amount !== 0)
    .map(([domain, amount]) => ({
      label: domainLabel(domain),
      amount: formatCOP(amount),
    }));

  const isClosed = session?.status === "CERRADO";

  return (
    <>
      <AppHeader
        title="Empalme"
        subtitle={
          isClosed
            ? "Acta del día 1 · congelada"
            : "Guía de indagación · captura en vivo"
        }
      />
      <main className="space-y-8 p-8">
        {!session ? (
          <>
            <section className="max-w-3xl space-y-3">
              <h2 className="font-display text-2xl font-bold tracking-tight">
                Tu guía de indagación
              </h2>
              <p className="text-sm leading-relaxed text-[var(--muted)]">
                Herramienta de apoyo para la reunión: tú preguntas, capturas
                aquí y dejas el acta clara para los socios. Flujo rápido —
                esferas, una pregunta abierta, Guardar y seguir.
              </p>
            </section>
            <Card className="max-w-3xl">
              <EmpalmeSteps current={1} />
              <div className="mt-6">
                <h3 className="mb-4 font-display text-lg font-bold">
                  Preparar el empalme
                </h3>
                <CreateHandoverForm
                  defaultCutoff={ctx.organization.administrative_cutoff_date}
                />
              </div>
            </Card>
          </>
        ) : (
          <EmpalmeMeetingView
            session={session}
            items={items}
            quality={{
              total: quality.total,
              confirmed: quality.confirmed,
              declared: quality.declared,
              pending: quality.pending,
            }}
            summaryLines={summaryLines}
          />
        )}
      </main>
    </>
  );
}
