import { AppHeader } from "@/components/layout/app-header";
import { Card } from "@/components/ui/primitives";
import { getOrgContext } from "@/lib/org-context";
import { requireModuleAccess } from "@/lib/permissions";
import { isSuperAdmin } from "@/types/domain";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { InventarioNav } from "../inventario-nav";
import {
  InventoryListPrintClient,
  type ListCategory,
  type ListProduct,
} from "./inventory-list-print-client";

export default async function InventarioListaPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requireModuleAccess(ctx, "inventario.maestro");
  if (!ctx.organization) {
    return (
      <>
        <AppHeader title="Inventario" subtitle="Lista" />
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
  const [{ data: catRows }, { data: prodRows }] = await Promise.all([
    supabase
      .from("product_categories")
      .select("id, code, name")
      .eq("organization_id", ctx.organization.id)
      .is("deleted_at", null)
      .order("code"),
    supabase
      .from("products")
      .select(
        "id, category_id, sku, name, unit, min_stock, current_stock, unit_cost, notes",
      )
      .eq("organization_id", ctx.organization.id)
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("name"),
  ]);

  return (
    <>
      <div className="no-print print:hidden">
        <AppHeader title="Inventario" subtitle="Lista / imprimir" />
      </div>
      <main className="mx-auto max-w-5xl space-y-6 p-6 md:p-8 print:max-w-none print:p-0">
        <div className="no-print print:hidden">
          <InventarioNav
            permissions={ctx.permissions}
            isSuperAdmin={isSuperAdmin(ctx.role)}
          />
        </div>
        <InventoryListPrintClient
          organizationName={
            ctx.organization.trade_name || ctx.organization.legal_name
          }
          categories={(catRows ?? []) as ListCategory[]}
          products={(prodRows ?? []) as ListProduct[]}
        />
      </main>
    </>
  );
}
