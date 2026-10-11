import Link from "next/link";
import { AppHeader } from "@/components/layout/app-header";
import { Badge, Card, EmptyState, PageIntro } from "@/components/ui/primitives";
import { formatCOP, money } from "@/lib/money";
import { getOrgContext } from "@/lib/org-context";
import { ctxCanAccess, requireModuleAccess } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { isSuperAdmin } from "@/types/domain";
import { redirect } from "next/navigation";
import { CocinaNav } from "../cocina-nav";

function formatUnitCost(value: number | string) {
  const n = money(value).toDecimalPlaces(4).toNumber();
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(n);
}

const TYPE_SHORT: Record<string, string> = {
  INSUMO_PREPARACION: "Insumo",
  PREPARACION: "Preparación",
  PRODUCTO_CARTA: "Carta",
};

export default async function CocinaProduccionesPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requireModuleAccess(ctx, "cocina.produccion");
  if (!ctx.organization) redirect("/empresa");

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("kitchen_productions")
    .select(
      "id, title, produced_at, status, production_type, output_qty, merma_qty, merma_pct, yield_pct, input_total_cost, output_unit_cost, products:output_product_id(name, unit)",
    )
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .order("produced_at", { ascending: false })
    .limit(100);

  const canCreate = ctxCanAccess(ctx, "cocina.produccion");

  return (
    <>
      <AppHeader title="Cocina" subtitle="Producciones" />
      <main className="space-y-6 p-8">
        <CocinaNav
          permissions={ctx.permissions}
          isSuperAdmin={isSuperAdmin(ctx.role)}
        />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <PageIntro
            title="Historial de producciones"
            description="Insumos (con merma) y preparaciones (desde receta). Abra el detalle para ver consumos o anular."
          />
          {canCreate ? (
            <div className="flex flex-wrap gap-2">
              <Link
                href="/cocina/producciones/nueva"
                className="rounded-lg border border-[var(--line)] px-4 py-2.5 text-sm"
              >
                Producir insumo
              </Link>
              <Link
                href="/cocina/producciones/nueva-preparacion"
                className="rounded-lg bg-[var(--ink)] px-4 py-2.5 text-sm text-white"
              >
                Producir preparación
              </Link>
            </div>
          ) : null}
        </div>

        {!rows?.length ? (
          <EmptyState
            title="Sin producciones"
            description="Registre la conversión a insumo o un batch de preparación."
          />
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[var(--line)] bg-[var(--surface)] text-xs uppercase tracking-wide text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Tipo</th>
                  <th className="px-4 py-3 font-medium">Producción</th>
                  <th className="px-4 py-3 font-medium">Producto</th>
                  <th className="px-4 py-3 font-medium">Útil / Merma</th>
                  <th className="px-4 py-3 font-medium">Costo / u</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const product = Array.isArray(r.products)
                    ? r.products[0]
                    : r.products;
                  const unit = (product as { unit?: string } | null)?.unit ?? "";
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-[var(--line)] last:border-0"
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        {r.produced_at}
                      </td>
                      <td className="px-4 py-3 text-[var(--muted)]">
                        {TYPE_SHORT[r.production_type] ?? r.production_type}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/cocina/producciones/${r.id}`}
                          className="font-medium text-[var(--accent)] hover:underline"
                        >
                          {r.title}
                        </Link>
                        <p className="text-xs text-[var(--muted)]">
                          {formatCOP(r.input_total_cost)} entradas
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        {(product as { name?: string } | null)?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <p>
                          {Number(r.output_qty)} {unit}
                          {r.yield_pct != null ? (
                            <span className="text-[var(--muted)]">
                              {" "}
                              ({Number(r.yield_pct).toFixed(1)}%)
                            </span>
                          ) : null}
                        </p>
                        {Number(r.merma_qty) > 0 ? (
                          <p className="text-xs text-[var(--muted)]">
                            Merma {Number(r.merma_qty)}
                            {r.merma_pct != null
                              ? ` (${Number(r.merma_pct).toFixed(1)}%)`
                              : ""}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        {formatUnitCost(r.output_unit_cost)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          tone={
                            r.status === "COMPLETADA"
                              ? "ok"
                              : r.status === "ANULADA"
                                ? "danger"
                                : "neutral"
                          }
                        >
                          {r.status}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </main>
    </>
  );
}
