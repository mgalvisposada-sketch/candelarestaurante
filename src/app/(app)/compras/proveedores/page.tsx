import { AppHeader } from "@/components/layout/app-header";
import { Card, EmptyState, PageIntro } from "@/components/ui/primitives";
import { getOrgContext } from "@/lib/org-context";
import { requireModuleAccess } from "@/lib/permissions";
import { isSuperAdmin } from "@/types/domain";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ComprasNav } from "../compras-nav";
import {
  LinkCategoryForm,
  SupplierPurchaseCards,
  type CategoryOption,
  type LinkRow,
  type SupplierRow,
} from "./proveedores-compras-client";

export default async function ComprasProveedoresPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requireModuleAccess(ctx, "compras.proveedores");
  if (!ctx.organization) {
    return (
      <>
        <AppHeader title="Compras" subtitle="Proveedores" />
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
  const [{ data: supplierRows }, { data: catRows }, { data: linkRows }] =
    await Promise.all([
      supabase
        .from("suppliers")
        .select("id, name, category, lead_time_days, is_active")
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
        .select("id, supplier_id, category_id, lead_time_days, notes")
        .eq("organization_id", ctx.organization.id)
        .is("deleted_at", null)
        .eq("is_active", true),
    ]);

  const suppliers = (supplierRows ?? []) as SupplierRow[];
  const categories = (catRows ?? []) as CategoryOption[];
  const links = (linkRows ?? []) as LinkRow[];

  return (
    <>
      <AppHeader title="Compras" subtitle="Proveedores por categoría" />
      <main className="space-y-6 p-8">
        <ComprasNav
          permissions={ctx.permissions}
          isSuperAdmin={isSuperAdmin(ctx.role)}
        />
        <PageIntro
          title="Qué puede vender cada proveedor"
          description="Vincule categorías de producto a proveedores y defina tiempos de entrega. El administrador del punto usará esto para sugerir proveedor al solicitar."
        />
        <p className="text-sm text-[var(--muted)]">
          El maestro base de proveedores (NIT, contacto, CxP) sigue en{" "}
          <Link href="/proveedores" className="text-[var(--accent)]">
            Proveedores & CxP
          </Link>
          .
        </p>
        {suppliers.length === 0 ? (
          <EmptyState
            title="Sin proveedores"
            description="Cree proveedores en Proveedores & CxP y luego vincule categorías aquí."
          />
        ) : categories.length === 0 ? (
          <EmptyState
            title="Sin categorías de producto"
            description="Primero cree categorías en Inventario."
          />
        ) : (
          <>
            <LinkCategoryForm suppliers={suppliers.filter((s) => s.is_active)} categories={categories} />
            <SupplierPurchaseCards
              suppliers={suppliers}
              categories={categories}
              links={links}
            />
          </>
        )}
      </main>
    </>
  );
}
