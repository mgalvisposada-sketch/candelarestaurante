import { AppHeader } from "@/components/layout/app-header";
import { Card } from "@/components/ui/primitives";
import { getOrgContext } from "@/lib/org-context";
import { createClient } from "@/lib/supabase/server";
import { summarizeHandoverQuality } from "@/lib/handover";
import { formatCOP } from "@/lib/money";
import { domainLabel } from "@/lib/handover-catalog";
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

  if (!ctx.organization) {
    return (
      <>
        <AppHeader
          title="Entrega"
          subtitle="Acta de entrega entre administraciones"
        />
        <main className="p-8">
          <Card>
            <p className="font-display text-lg font-bold">
              Primero configura la empresa
            </p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Antes de la entrega necesitamos el nombre de la empresa y una
              fecha de corte.
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
    items = (itemRows ?? []) as HandoverItem[];
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
        title="Entrega"
        subtitle={
          isClosed
            ? "Acta del día 1 · congelada"
            : "Reunión de entrega del restaurante · acta del día 1"
        }
      />
      <main className="space-y-8 p-8">
        {!session ? (
          <>
            <section className="max-w-3xl space-y-3">
              <h2 className="font-display text-2xl font-bold tracking-tight">
                Una misma foto para todos los socios
              </h2>
              <p className="text-sm leading-relaxed text-[var(--muted)]">
                Esta reunión no es un juicio de la gestión anterior: es dejar
                escrita la plata, las deudas, el inventario y los papeles para
                que todos vean lo mismo. Si algo viene a medias, se marca como
                “me lo dijeron” o pendiente — eso también protege a quien
                entrega y sigue en el negocio.
              </p>
            </section>
            <Card className="max-w-3xl">
              <EmpalmeSteps current={1} />
              <div className="mt-6">
                <h3 className="mb-4 font-display text-lg font-bold">
                  Empezar la reunión de entrega
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
