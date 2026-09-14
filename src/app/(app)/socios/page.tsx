import { AppHeader } from "@/components/layout/app-header";
import { Badge, Card, EmptyState, PageIntro } from "@/components/ui/primitives";
import { getOrgContext } from "@/lib/org-context";
import { createClient } from "@/lib/supabase/server";
import { participationWarning } from "@/lib/handover";
import { sumParticipation } from "@/lib/shareholders";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  CreateShareholderForm,
  ShareholderCard,
  type ShareholderAccountRow,
  type ShareholderRow,
  type ShareholderTxRow,
} from "./shareholders-client";

export default async function SociosPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");

  if (!ctx.organization) {
    return (
      <>
        <AppHeader
          title="Socios"
          subtitle="Composición accionaria y cuentas socio ↔ sociedad"
        />
        <main className="p-8">
          <Card>
            <p className="font-medium">Primero configura la empresa</p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Los socios pertenecen a una organización.
            </p>
            <Link
              href="/empresa"
              className="mt-4 inline-flex rounded-lg bg-[var(--ink)] px-4 py-2 text-sm text-white"
            >
              Ir a Empresa
            </Link>
          </Card>
        </main>
      </>
    );
  }

  const supabase = await createClient();
  const { data: shareholderRows } = await supabase
    .from("shareholders")
    .select(
      "id, full_name, id_type, id_number, participation_pct, entry_date, registered_capital, notes, status, verification_status, comments",
    )
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  const shareholders = (shareholderRows ?? []) as ShareholderRow[];
  const totalPct = sumParticipation(
    shareholders.map((s) => s.participation_pct),
  );
  const warning = participationWarning(totalPct);
  const roundedTotal = Math.round(totalPct * 10000) / 10000;

  const shareholderIds = shareholders.map((s) => s.id);
  let accounts: ShareholderAccountRow[] = [];
  let transactions: ShareholderTxRow[] = [];

  if (shareholderIds.length > 0) {
    const { data: accountRows } = await supabase
      .from("shareholder_accounts")
      .select("id, shareholder_id, opening_balance, notes")
      .eq("organization_id", ctx.organization.id)
      .is("deleted_at", null)
      .in("shareholder_id", shareholderIds);
    accounts = (accountRows ?? []) as ShareholderAccountRow[];

    const accountIds = accounts.map((a) => a.id);
    if (accountIds.length > 0) {
      const { data: txRows } = await supabase
        .from("shareholder_transactions")
        .select(
          "id, shareholder_account_id, transaction_date, description, debit, credit, nature",
        )
        .eq("organization_id", ctx.organization.id)
        .is("deleted_at", null)
        .in("shareholder_account_id", accountIds)
        .order("transaction_date", { ascending: false });
      transactions = (txRows ?? []) as ShareholderTxRow[];
    }
  }

  return (
    <>
      <AppHeader
        title="Socios"
        subtitle="Composición accionaria y cuentas socio ↔ sociedad"
      />
      <main className="space-y-6 p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <PageIntro
            title="Gobierno de socios"
            description="La participación accionaria se gestiona aparte de los préstamos. Si el total no suma 100% se advierte, pero no se bloquea el empalme."
          />
          <CreateShareholderForm />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
              Total participación
            </p>
            <p className="mt-2 font-display text-3xl">{roundedTotal}%</p>
            {warning ? (
              <div className="mt-3">
                <Badge tone="warn">No suma 100%</Badge>
                <p className="mt-2 text-sm text-[var(--muted)]">{warning}</p>
              </div>
            ) : shareholders.length > 0 ? (
              <div className="mt-3">
                <Badge tone="ok">Participación completa</Badge>
              </div>
            ) : null}
          </Card>
          <Card>
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
              Socios activos
            </p>
            <p className="mt-2 font-display text-3xl">
              {shareholders.filter((s) => s.status === "ACTIVO").length}
            </p>
          </Card>
          <Card>
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
              Separación de conceptos
            </p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
              % accionario ≠ préstamos. Los préstamos formales viven en el
              módulo Préstamos.
            </p>
          </Card>
        </div>

        {shareholders.length === 0 ? (
          <EmptyState
            title="Sin socios registrados"
            description="Registre cada socio con identificación, porcentaje, capital registrado y estado. Las cuentas acreedor/deudor viven en entidades separadas."
          />
        ) : (
          <div className="space-y-4">
            {shareholders.map((shareholder) => {
              const account =
                accounts.find((a) => a.shareholder_id === shareholder.id) ??
                null;
              const txs = account
                ? transactions.filter(
                    (t) => t.shareholder_account_id === account.id,
                  )
                : [];
              return (
                <ShareholderCard
                  key={shareholder.id}
                  shareholder={shareholder}
                  account={account}
                  transactions={txs}
                />
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
