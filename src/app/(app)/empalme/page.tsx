import { AppHeader } from "@/components/layout/app-header";
import { Badge, Card } from "@/components/ui/primitives";
import { getOrgContext } from "@/lib/org-context";
import { createClient } from "@/lib/supabase/server";
import { summarizeHandoverQuality } from "@/lib/handover";
import { domainLabel, itemAsk } from "@/lib/handover-catalog";
import { formatCOP } from "@/lib/money";
import { formatDateCO } from "@/lib/dates";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  AddHandoverItemForm,
  CloseHandoverForm,
  CreateHandoverForm,
  EmpalmeSteps,
  HandoverDomainSections,
  SeedDefaultsButton,
  SessionMetaForm,
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
  const pendingItems = items.filter(
    (i) => i.verification_status === "PENDIENTE",
  );
  const declaredItems = items.filter(
    (i) => i.verification_status === "DECLARADO",
  );
  const readOnly = session?.status === "CERRADO";
  const reviewedCount = quality.confirmed + quality.declared;

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

  return (
    <>
      <AppHeader
        title="Entrega"
        subtitle="Reunión de entrega del restaurante · acta del día 1"
      />
      <main className="space-y-8 p-8">
        <section className="max-w-3xl space-y-3">
          <h2 className="font-display text-2xl font-bold tracking-tight">
            Recibir Candela con claridad
          </h2>
          <p className="text-sm leading-relaxed text-[var(--muted)]">
            Úsalo como una guía de entrevista con el administrador anterior:
            pregunta por la plata, las deudas, el inventario de apertura y los
            papeles. Marca si lo viste con prueba o solo te lo dijeron. Al
            cerrar, queda el acta del nuevo comienzo.
          </p>
        </section>

        {!session ? (
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
        ) : (
          <>
            <EmpalmeSteps current={readOnly ? 3 : 2} />

            <Card>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                    Avance de la reunión
                  </p>
                  <p className="mt-1 font-display text-2xl font-bold">
                    {reviewedCount} de {quality.total} preguntas respondidas
                  </p>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    Corte: {formatDateCO(session.cutoff_date)} ·{" "}
                    {session.status === "CERRADO"
                      ? "Acta cerrada"
                      : "En curso"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge tone="ok">
                    Con prueba {quality.confirmed}
                  </Badge>
                  <Badge tone="warn">
                    Solo dicho {quality.declared}
                  </Badge>
                  <Badge tone="danger">
                    Pendiente {quality.pending}
                  </Badge>
                </div>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--line)]">
                <div
                  className="h-full bg-[var(--accent)] transition-all"
                  style={{
                    width: `${quality.total ? (reviewedCount / quality.total) * 100 : 0}%`,
                  }}
                />
              </div>
            </Card>

            <Card>
              <h3 className="font-display text-lg font-bold">
                1. Quiénes participan
              </h3>
              <p className="mt-1 mb-4 text-sm text-[var(--muted)]">
                Nombres de la entrega y la fecha hasta la cual responde la
                administración anterior.
              </p>
              <SessionMetaForm session={session} />
              {!readOnly ? (
                <div className="mt-4 border-t border-[var(--line)] pt-4">
                  <SeedDefaultsButton sessionId={session.id} />
                </div>
              ) : null}
            </Card>

            <section className="space-y-4">
              <div className="max-w-3xl">
                <h3 className="font-display text-xl font-bold tracking-tight">
                  2. Haz las preguntas, bloque por bloque
                </h3>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Abre un bloque, lee la pregunta en voz alta, anota la
                  respuesta y marca si hay prueba. Si hay varios terceros o
                  cuentas, usa el detalle por renglones.
                </p>
              </div>

              <HandoverDomainSections items={items} readOnly={!!readOnly} />

              {!readOnly ? (
                <AddHandoverItemForm sessionId={session.id} />
              ) : null}
            </section>

            {(pendingItems.length > 0 || declaredItems.length > 0) && (
              <Card>
                <h3 className="font-display text-lg font-bold">
                  Para no olvidar
                </h3>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                      Aún sin revisar
                    </p>
                    {pendingItems.length === 0 ? (
                      <p className="mt-2 text-sm text-[var(--muted)]">Ninguna</p>
                    ) : (
                      <ul className="mt-2 space-y-1 text-sm text-[var(--muted)]">
                        {pendingItems.slice(0, 8).map((item) => (
                          <li key={item.id}>
                            • {itemAsk(item.item_key, item.label)}
                          </li>
                        ))}
                        {pendingItems.length > 8 ? (
                          <li>… y {pendingItems.length - 8} más</li>
                        ) : null}
                      </ul>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                      Solo lo dijeron (sin prueba)
                    </p>
                    {declaredItems.length === 0 ? (
                      <p className="mt-2 text-sm text-[var(--muted)]">Ninguna</p>
                    ) : (
                      <ul className="mt-2 space-y-1 text-sm text-[var(--muted)]">
                        {declaredItems.slice(0, 8).map((item) => (
                          <li key={item.id}>
                            • {itemAsk(item.item_key, item.label)}
                          </li>
                        ))}
                        {declaredItems.length > 8 ? (
                          <li>… y {declaredItems.length - 8} más</li>
                        ) : null}
                      </ul>
                    )}
                  </div>
                </div>
              </Card>
            )}

            <section className="space-y-3">
              <h3 className="font-display text-xl font-bold tracking-tight">
                3. Cierra cuando la reunión termine
              </h3>
              <CloseHandoverForm
                session={session}
                pendingCount={pendingItems.length}
                summaryLines={summaryLines}
              />
            </section>
          </>
        )}
      </main>
    </>
  );
}
