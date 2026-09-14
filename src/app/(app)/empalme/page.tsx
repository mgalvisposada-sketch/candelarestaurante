import { AppHeader } from "@/components/layout/app-header";
import { Badge, Card, PageIntro } from "@/components/ui/primitives";
import { getOrgContext } from "@/lib/org-context";
import { createClient } from "@/lib/supabase/server";
import { summarizeHandoverQuality } from "@/lib/handover";
import { formatDateCO } from "@/lib/dates";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  CloseHandoverForm,
  CreateHandoverForm,
  HandoverItemRow,
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
          title="Empalme"
          subtitle="Línea base administrativa a fecha de corte"
        />
        <main className="p-8">
          <Card>
            <p className="font-display text-lg font-medium">
              Primero configura la empresa
            </p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              El empalme requiere una organización y fecha de corte.
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
        "id, domain, item_key, label, amount, verification_status, comments, source",
      )
      .eq("handover_session_id", session.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    items = (itemRows ?? []) as HandoverItem[];
  }

  const quality = summarizeHandoverQuality(
    items.map((i) => ({ status: i.verification_status })),
  );
  const pendingItems = items.filter((i) => i.verification_status === "PENDIENTE");
  const readOnly = session?.status === "CERRADO";

  return (
    <>
      <AppHeader
        title="Empalme"
        subtitle="Línea base administrativa a fecha de corte"
      />
      <main className="space-y-6 p-8">
        <PageIntro
          title="Construcción de la línea base"
          description="Todo lo anterior a la fecha de corte es situación recibida. El empalme puede cerrarse con pendientes: se muestran % confirmado, declarado y pendiente, y se genera un snapshot inmutable."
        />

        {!session ? (
          <Card>
            <h3 className="mb-4 font-medium">Iniciar sesión de empalme</h3>
            <CreateHandoverForm
              defaultCutoff={ctx.organization.administrative_cutoff_date}
            />
          </Card>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
                  Fecha de corte
                </p>
                <p className="mt-2 font-display text-2xl">
                  {formatDateCO(session.cutoff_date)}
                </p>
                <div className="mt-2">
                  <Badge
                    tone={session.status === "CERRADO" ? "ok" : "accent"}
                  >
                    {session.status}
                  </Badge>
                </div>
              </Card>
              <Card>
                <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
                  Confirmado
                </p>
                <p className="mt-2 font-display text-3xl">
                  {quality.pctConfirmed}%
                </p>
              </Card>
              <Card>
                <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
                  Declarado
                </p>
                <p className="mt-2 font-display text-3xl">
                  {quality.pctDeclared}%
                </p>
              </Card>
              <Card>
                <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
                  Pendiente
                </p>
                <p className="mt-2 font-display text-3xl">
                  {quality.pctPending}%
                </p>
              </Card>
            </div>

            <Card className="overflow-x-auto p-0">
              <div className="border-b border-[var(--line)] px-5 py-4">
                <h3 className="font-medium">Ítems de línea base</h3>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Actualiza montos y estado de verificación. CONFIRMADO requiere
                  soporte; DECLARADO y PENDIENTE no bloquean el cierre.
                </p>
              </div>
              <table className="min-w-full text-left">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-[var(--muted)]">
                  <tr>
                    <th className="px-3 py-3 font-medium">Ítem</th>
                    <th className="px-3 py-3 font-medium">Monto</th>
                    <th className="px-3 py-3 font-medium">Estado</th>
                    <th className="px-3 py-3 font-medium">Comentarios</th>
                    <th className="px-3 py-3 font-medium">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <HandoverItemRow
                      key={item.id}
                      item={item}
                      readOnly={!!readOnly}
                    />
                  ))}
                </tbody>
              </table>
            </Card>

            {pendingItems.length > 0 ? (
              <Card>
                <h3 className="font-medium">Lista de pendientes</h3>
                <ul className="mt-3 space-y-1 text-sm text-[var(--muted)]">
                  {pendingItems.map((item) => (
                    <li key={item.id}>• {item.label}</li>
                  ))}
                </ul>
              </Card>
            ) : null}

            <CloseHandoverForm
              session={session}
              pendingCount={pendingItems.length}
            />
          </>
        )}
      </main>
    </>
  );
}
