import { AppHeader } from "@/components/layout/app-header";
import { Card, EmptyState, PageIntro, StatCard } from "@/components/ui/primitives";
import { getOrgContext } from "@/lib/org-context";
import { ctxCanAccess, requireModuleAccess } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { formatCOP, money } from "@/lib/money";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  CreateInternalRequestForm,
  CreateInvoiceRequestForm,
  PaymentRequestQueues,
  type BankAccountOption,
  type PaymentRequestRow,
  type SupplierOption,
} from "./payment-requests-client";

export default async function SolicitudesPagoPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requireModuleAccess(ctx, "solicitudes-pago");

  if (!ctx.organization) {
    return (
      <>
        <AppHeader title="Solicitudes de pago" subtitle="Aprobación y cola de tesorería" />
        <main className="p-8">
          <Card>
            <p className="font-medium">Primero configura la empresa</p>
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
  const [{ data: requestRows }, { data: supplierRows }, { data: bankRows }] =
    await Promise.all([
      supabase
        .from("payment_requests")
        .select(
          "id, source, status, priority, concept, amount, requested_at, due_date, supplier_id, document_number, document_type, notes, rejection_reason, paid_at, payment_reference",
        )
        .eq("organization_id", ctx.organization.id)
        .is("deleted_at", null)
        .order("requested_at", { ascending: false }),
      supabase
        .from("suppliers")
        .select("id, name")
        .eq("organization_id", ctx.organization.id)
        .is("deleted_at", null)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("bank_accounts")
        .select("id, bank_name, masked_number")
        .eq("organization_id", ctx.organization.id)
        .is("deleted_at", null)
        .eq("is_active", true)
        .order("bank_name"),
    ]);

  const requests = (requestRows ?? []) as PaymentRequestRow[];
  const suppliers = (supplierRows ?? []) as SupplierOption[];
  const bankAccounts = (bankRows ?? []) as BankAccountOption[];

  const review = requests.filter(
    (r) => r.status === "EN_REVISION" || r.status === "BORRADOR",
  );
  const payQueue = requests.filter(
    (r) => r.status === "EN_COLA_PAGO" || r.status === "APROBADA",
  );
  const history = requests.filter((r) =>
    ["PAGADA", "RECHAZADA", "ANULADA"].includes(r.status),
  );

  const reviewTotal = review.reduce(
    (acc, r) => acc.plus(money(r.amount)),
    money(0),
  );
  const payTotal = payQueue.reduce(
    (acc, r) => acc.plus(money(r.amount)),
    money(0),
  );

  const canCreate = ctxCanAccess(ctx, "solicitudes-pago.crear");
  const canApprove = ctxCanAccess(ctx, "solicitudes-pago.aprobar");
  const canPay = ctxCanAccess(ctx, "solicitudes-pago.pagar");

  return (
    <>
      <AppHeader
        title="Solicitudes de pago"
        subtitle="Solicitar · aprobar · pagar desde tesorería"
      />
      <main className="space-y-6 p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <PageIntro
            title="Bandeja operativa"
            description="Unifique solicitudes internas y facturas de proveedores. Al aprobar pasan a cola de tesorería; al pagar se registran movimiento bancario y, si aplica, CxP o gasto."
          />
          {canCreate ? (
            <div className="flex flex-wrap gap-2">
              <CreateInternalRequestForm suppliers={suppliers} />
              <CreateInvoiceRequestForm suppliers={suppliers} />
            </div>
          ) : null}
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <StatCard label="Por aprobar" value={formatCOP(reviewTotal)} />
          <StatCard label="Por pagar" value={formatCOP(payTotal)} />
          <StatCard label="En bandeja" value={String(requests.length)} />
        </div>

        {requests.length === 0 ? (
          <EmptyState
            title="Sin solicitudes de pago"
            description="Cree una solicitud interna o registre una factura de proveedor para iniciar el flujo de aprobación."
          />
        ) : (
          <PaymentRequestQueues
            review={review}
            payQueue={payQueue}
            history={history}
            suppliers={suppliers}
            bankAccounts={bankAccounts}
            canApprove={canApprove}
            canPay={canPay}
            canCreate={canCreate}
          />
        )}
      </main>
    </>
  );
}
