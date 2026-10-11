import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/layout/app-header";
import { Badge, Card, PageIntro } from "@/components/ui/primitives";
import { formatCOP, money } from "@/lib/money";
import { getOrgContext } from "@/lib/org-context";
import { ctxCanAccess, requireModuleAccess } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { isSuperAdmin } from "@/types/domain";
import { CocinaNav } from "../../cocina-nav";
import { VoidProductionForm } from "./void-form";

function formatUnitCost(value: number | string) {
  const n = money(value).toDecimalPlaces(4).toNumber();
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(n);
}

const TYPE_LABEL: Record<string, string> = {
  INSUMO_PREPARACION: "Insumo preparación",
  PREPARACION: "Preparación",
  PRODUCTO_CARTA: "Producto carta",
};

export default async function ProduccionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requireModuleAccess(ctx, "cocina.produccion");
  if (!ctx.organization) redirect("/empresa");

  const supabase = await createClient();
  const orgId = ctx.organization.id;

  const { data: production } = await supabase
    .from("kitchen_productions")
    .select(
      "id, title, produced_at, status, production_type, output_qty, merma_qty, merma_pct, yield_pct, input_total_qty, input_total_cost, aprovechamiento_total_cost, output_total_cost, output_unit_cost, notes, completed_at, recipe_id, products:output_product_id(name, unit), kitchen_recipes:recipe_id(name, yield_qty)",
    )
    .eq("id", id)
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!production) notFound();

  const [{ data: inputs }, { data: outputs }] = await Promise.all([
    supabase
      .from("kitchen_production_inputs")
      .select(
        "id, quantity, unit_cost, line_cost, notes, products:product_id(name, unit)",
      )
      .eq("production_id", id)
      .eq("organization_id", orgId)
      .order("created_at"),
    supabase
      .from("kitchen_production_outputs")
      .select(
        "id, output_role, quantity, allocated_cost, unit_cost, products:product_id(name, unit)",
      )
      .eq("production_id", id)
      .eq("organization_id", orgId)
      .order("created_at"),
  ]);

  const product = Array.isArray(production.products)
    ? production.products[0]
    : production.products;
  const recipe = Array.isArray(production.kitchen_recipes)
    ? production.kitchen_recipes[0]
    : production.kitchen_recipes;
  const canVoid =
    production.status === "COMPLETADA" &&
    ctxCanAccess(ctx, "cocina.produccion");

  return (
    <>
      <AppHeader title="Cocina" subtitle="Detalle de producción" />
      <main className="space-y-6 p-8">
        <CocinaNav
          permissions={ctx.permissions}
          isSuperAdmin={isSuperAdmin(ctx.role)}
        />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <PageIntro
            title={production.title}
            description={`${TYPE_LABEL[production.production_type] ?? production.production_type} · ${(product as { name?: string } | null)?.name ?? "—"}`}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              tone={
                production.status === "COMPLETADA"
                  ? "ok"
                  : production.status === "ANULADA"
                    ? "danger"
                    : "neutral"
              }
            >
              {production.status}
            </Badge>
            <Link
              href="/cocina/producciones"
              className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm"
            >
              Volver
            </Link>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
              Fecha
            </p>
            <p className="mt-1 font-medium">{production.produced_at}</p>
          </Card>
          <Card>
            <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
              Cantidad útil
            </p>
            <p className="mt-1 font-medium">
              {Number(production.output_qty)}{" "}
              {(product as { unit?: string } | null)?.unit ?? ""}
            </p>
          </Card>
          <Card>
            <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
              Costo entradas
            </p>
            <p className="mt-1 font-medium">
              {formatCOP(production.input_total_cost)}
            </p>
          </Card>
          <Card>
            <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
              Costo / u
            </p>
            <p className="mt-1 font-display text-xl font-semibold">
              {formatUnitCost(production.output_unit_cost)}
            </p>
          </Card>
        </div>

        {(production.merma_qty != null && Number(production.merma_qty) > 0) ||
        recipe ? (
          <Card>
            <div className="flex flex-wrap gap-6 text-sm">
              {Number(production.merma_qty) > 0 ? (
                <p>
                  Merma: <strong>{Number(production.merma_qty)}</strong>
                  {production.merma_pct != null
                    ? ` (${Number(production.merma_pct).toFixed(1)}%)`
                    : ""}
                </p>
              ) : null}
              {production.yield_pct != null ? (
                <p>
                  Rendimiento:{" "}
                  <strong>{Number(production.yield_pct).toFixed(1)}%</strong>
                </p>
              ) : null}
              {recipe ? (
                <p>
                  Receta:{" "}
                  <strong>
                    {(recipe as { name?: string }).name} (rinde{" "}
                    {Number((recipe as { yield_qty?: number }).yield_qty)})
                  </strong>
                </p>
              ) : null}
              {Number(production.aprovechamiento_total_cost) > 0 ? (
                <p>
                  Costo aprovechamientos:{" "}
                  <strong>
                    {formatCOP(production.aprovechamiento_total_cost)}
                  </strong>
                </p>
              ) : null}
            </div>
            {production.notes ? (
              <p className="mt-3 whitespace-pre-wrap text-sm text-[var(--muted)]">
                {production.notes}
              </p>
            ) : null}
          </Card>
        ) : production.notes ? (
          <Card>
            <p className="whitespace-pre-wrap text-sm text-[var(--muted)]">
              {production.notes}
            </p>
          </Card>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="overflow-x-auto p-0">
            <div className="border-b border-[var(--line)] px-4 py-3 font-medium">
              Consumos
            </div>
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-2">Producto</th>
                  <th className="px-4 py-2">Cantidad</th>
                  <th className="px-4 py-2">Costo</th>
                </tr>
              </thead>
              <tbody>
                {(inputs ?? []).map((row) => {
                  const p = Array.isArray(row.products)
                    ? row.products[0]
                    : row.products;
                  return (
                    <tr key={row.id} className="border-t border-[var(--line)]">
                      <td className="px-4 py-2">
                        {(p as { name?: string } | null)?.name ?? "—"}
                      </td>
                      <td className="px-4 py-2">
                        {Number(row.quantity)}{" "}
                        {(p as { unit?: string } | null)?.unit ?? ""}
                      </td>
                      <td className="px-4 py-2">{formatCOP(row.line_cost)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          <Card className="overflow-x-auto p-0">
            <div className="border-b border-[var(--line)] px-4 py-3 font-medium">
              Salidas
            </div>
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-2">Rol</th>
                  <th className="px-4 py-2">Producto</th>
                  <th className="px-4 py-2">Cantidad</th>
                  <th className="px-4 py-2">Costo / u</th>
                </tr>
              </thead>
              <tbody>
                {(outputs ?? []).map((row) => {
                  const p = Array.isArray(row.products)
                    ? row.products[0]
                    : row.products;
                  return (
                    <tr key={row.id} className="border-t border-[var(--line)]">
                      <td className="px-4 py-2">{row.output_role}</td>
                      <td className="px-4 py-2">
                        {(p as { name?: string } | null)?.name ?? "—"}
                      </td>
                      <td className="px-4 py-2">
                        {Number(row.quantity)}{" "}
                        {(p as { unit?: string } | null)?.unit ?? ""}
                      </td>
                      <td className="px-4 py-2">
                        {formatUnitCost(row.unit_cost)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </div>

        {canVoid ? <VoidProductionForm productionId={production.id} /> : null}
      </main>
    </>
  );
}
