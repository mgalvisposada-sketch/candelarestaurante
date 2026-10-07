import { AppHeader } from "@/components/layout/app-header";
import { Card, EmptyState, PageIntro } from "@/components/ui/primitives";
import { getOrgContext } from "@/lib/org-context";
import { ctxCanAccess, requireModuleAccess } from "@/lib/permissions";
import { isSuperAdmin } from "@/types/domain";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { GastosNav } from "../gastos-nav";
import {
  CreateExpenseCategoryForm,
  ExpenseCategoryList,
  type CategoryRow,
} from "../categories-client";

export default async function GastosCategoriasPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requireModuleAccess(ctx, "gastos");

  if (
    !ctxCanAccess(ctx, "gastos.categorias") &&
    !ctxCanAccess(ctx, "gastos.registro") &&
    !isSuperAdmin(ctx.role)
  ) {
    redirect("/gastos");
  }

  if (!ctx.organization) {
    return (
      <>
        <AppHeader title="Gastos" subtitle="Categorías" />
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

  const canManage =
    ctxCanAccess(ctx, "gastos.categorias") || isSuperAdmin(ctx.role);

  const supabase = await createClient();

  // Limpia inactivas sin gastos (eliminaciones viejas que solo desactivaban).
  if (canManage) {
    const { data: inactive } = await supabase
      .from("expense_categories")
      .select("id")
      .eq("organization_id", ctx.organization.id)
      .eq("is_active", false);
    const inactiveIds = (inactive ?? []).map((r) => r.id);
    if (inactiveIds.length > 0) {
      const { data: used } = await supabase
        .from("expenses")
        .select("category_id")
        .eq("organization_id", ctx.organization.id)
        .in("category_id", inactiveIds)
        .is("deleted_at", null);
      const usedSet = new Set(
        (used ?? []).map((r) => r.category_id).filter(Boolean),
      );
      const toDelete = inactiveIds.filter((id) => !usedSet.has(id));
      if (toDelete.length > 0) {
        await supabase
          .from("expense_categories")
          .delete()
          .eq("organization_id", ctx.organization.id)
          .in("id", toDelete);
      }
    }
  }

  const { data: catRows } = await supabase
    .from("expense_categories")
    .select("id, code, name, is_active")
    .eq("organization_id", ctx.organization.id)
    .eq("is_active", true)
    .order("code");

  const categories = (catRows ?? []) as CategoryRow[];

  return (
    <>
      <AppHeader
        title="Gastos"
        subtitle="Maestro de categorías (solo opex)"
      />
      <main className="space-y-6 p-8">
        <GastosNav
          permissions={ctx.permissions}
          isSuperAdmin={isSuperAdmin(ctx.role)}
        />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <PageIntro
            title="Categorías de gastos"
            description="Clasificación exclusiva del módulo Gastos (arriendo, gas, seguridad…). No se combina con las categorías de inventario de Compras."
          />
          <CreateExpenseCategoryForm canCreate={canManage} />
        </div>

        {categories.length === 0 ? (
          <EmptyState
            title="Sin categorías de gasto"
            description="Cree el maestro para clasificar facturas operativas al registrarlas."
          />
        ) : (
          <div className="space-y-3">
            <h3 className="font-medium">Maestro ({categories.length})</h3>
            <ExpenseCategoryList categories={categories} canEdit={canManage} />
          </div>
        )}
      </main>
    </>
  );
}
