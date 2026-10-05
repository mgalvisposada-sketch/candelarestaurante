import { AppHeader } from "@/components/layout/app-header";
import { Card, EmptyState, PageIntro, StatCard } from "@/components/ui/primitives";
import { getOrgContext } from "@/lib/org-context";
import { requireModuleAccess } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { formatCOP, apDocumentBalance, money } from "@/lib/money";
import { summarizeApAging } from "@/lib/accounts-payable";
import { todayInBogota } from "@/lib/dates";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  CreateApDocumentForm,
  CreateCategoryMasterForm,
  CreateSupplierForm,
  SupplierCard,
  type ApDocRow,
  type ProductCategoryOption,
  type SupplierRow,
} from "./suppliers-client";

export default async function ProveedoresPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requireModuleAccess(ctx, "proveedores");
  if (!ctx.organization) {
    return (
      <>
        <AppHeader title="Proveedores & CxP" subtitle="Deudas administrativas" />
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
  const [{ data: supplierRows }, { data: categoryRows }, { data: linkRows }] =
    await Promise.all([
      supabase
        .from("suppliers")
        .select(
          "id, name, tax_id, contact_name, phone, email, category, bank_account_info, notes, is_active, is_purchase_supplier",
        )
        .eq("organization_id", ctx.organization.id)
        .is("deleted_at", null)
        .order("name"),
      supabase
        .from("product_categories")
        .select("id, code, name")
        .eq("organization_id", ctx.organization.id)
        .is("deleted_at", null)
        .eq("is_active", true)
        .order("code"),
      supabase
        .from("supplier_product_categories")
        .select("supplier_id, category_id")
        .eq("organization_id", ctx.organization.id)
        .is("deleted_at", null)
        .eq("is_active", true),
    ]);

  const categories = (categoryRows ?? []) as ProductCategoryOption[];
  const linksBySupplier = new Map<string, string[]>();
  for (const link of linkRows ?? []) {
    const list = linksBySupplier.get(link.supplier_id) ?? [];
    list.push(link.category_id);
    linksBySupplier.set(link.supplier_id, list);
  }

  const suppliers = ((supplierRows ?? []) as Omit<SupplierRow, "category_ids">[]).map(
    (s) => ({
      ...s,
      category_ids: linksBySupplier.get(s.id) ?? [],
    }),
  );
  const ids = suppliers.map((s) => s.id);

  let documents: ApDocRow[] = [];
  if (ids.length > 0) {
    const { data: docs } = await supabase
      .from("accounts_payable_documents")
      .select(
        "id, supplier_id, document_type, document_number, issue_date, due_date, concept, original_amount, paid_amount, status, priority, verification_status, observation, comments, source",
      )
      .eq("organization_id", ctx.organization.id)
      .is("deleted_at", null)
      .in("supplier_id", ids)
      .order("due_date", { ascending: true });
    documents = (docs ?? []) as ApDocRow[];
  }

  const openDocs = documents.filter((d) => d.status !== "ANULADA");
  let total = money(0);
  let confirmed = money(0);
  let declared = money(0);
  let pending = money(0);
  let critica = money(0);

  for (const d of openDocs) {
    const bal = apDocumentBalance(d.original_amount, d.paid_amount);
    total = total.plus(bal);
    if (d.verification_status === "CONFIRMADO") confirmed = confirmed.plus(bal);
    if (d.verification_status === "DECLARADO") declared = declared.plus(bal);
    if (d.verification_status === "PENDIENTE") pending = pending.plus(bal);
    if (d.priority === "CRITICA") critica = critica.plus(bal);
  }

  const aging = summarizeApAging(
    openDocs.map((d) => ({
      dueDate: d.due_date,
      originalAmount: d.original_amount,
      paidAmount: d.paid_amount,
    })),
    todayInBogota(),
  );

  return (
    <>
      <AppHeader
        title="Proveedores & CxP"
        subtitle="Deudas administrativas soportadas por documentos"
      />
      <main className="space-y-6 p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <PageIntro
            title="Cuentas por pagar"
            description="Carga facturas abiertas a la fecha de corte como saldo inicial. El saldo por proveedor se calcula solo. Prioridades y verificación para el empalme. Las categorías del proveedor vienen del maestro único (también usado en inventario de compras)."
          />
          <div className="flex flex-wrap gap-2">
            <CreateCategoryMasterForm />
            <CreateSupplierForm categories={categories} />
            <CreateApDocumentForm suppliers={suppliers.filter((s) => s.is_active)} />
          </div>
        </div>

        {categories.length > 0 ? (
          <Card>
            <h3 className="font-medium">Maestro de categorías</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Misma lista al asignar proveedores y al crear productos de inventario.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {categories.map((c) => (
                <span
                  key={c.id}
                  className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm"
                >
                  <strong>{c.code}</strong> — {c.name}
                </span>
              ))}
            </div>
          </Card>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Total CxP" value={formatCOP(total)} />
          <StatCard label="Confirmada" value={formatCOP(confirmed)} />
          <StatCard label="Declarada" value={formatCOP(declared)} />
          <StatCard label="Pendiente soporte" value={formatCOP(pending)} />
          <StatCard label="Crítica" value={formatCOP(critica)} />
        </div>

        <Card>
          <h3 className="font-medium">Aging</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5 text-sm">
            <div>0-30: <strong>{formatCOP(aging["0-30"])}</strong></div>
            <div>31-60: <strong>{formatCOP(aging["31-60"])}</strong></div>
            <div>61-90: <strong>{formatCOP(aging["61-90"])}</strong></div>
            <div>+90: <strong>{formatCOP(aging[">90"])}</strong></div>
            <div>Sin venc.: <strong>{formatCOP(aging.sin_vencimiento)}</strong></div>
          </div>
        </Card>

        {suppliers.length === 0 ? (
          <EmptyState
            title="Sin proveedores ni documentos CxP"
            description="Cree el maestro de proveedores y cargue facturas con vencimiento, prioridad y evidencia."
          />
        ) : (
          <div className="space-y-4">
            {suppliers.map((s) => (
              <SupplierCard
                key={s.id}
                supplier={s}
                categories={categories}
                documents={documents.filter((d) => d.supplier_id === s.id)}
              />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
