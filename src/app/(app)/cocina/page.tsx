import Link from "next/link";
import { AppHeader } from "@/components/layout/app-header";
import { Card, PageIntro, StatCard } from "@/components/ui/primitives";
import { getOrgContext } from "@/lib/org-context";
import { ctxCanAccess, requireModuleAccess } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { isSuperAdmin } from "@/types/domain";
import { redirect } from "next/navigation";
import { CocinaNav } from "./cocina-nav";

export default async function CocinaPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requireModuleAccess(ctx, "cocina");
  if (!ctx.organization) redirect("/empresa");

  const supabase = await createClient();
  const orgId = ctx.organization.id;

  const [
    { count: insumosCount },
    { count: preparacionesCount },
    { count: cartaCount },
    { count: produccionesCount },
  ] = await Promise.all([
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("item_kind", "INSUMO_PREPARACION")
      .is("deleted_at", null),
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("item_kind", "PREPARACION")
      .is("deleted_at", null),
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("item_kind", "PRODUCTO_CARTA")
      .is("deleted_at", null),
    supabase
      .from("kitchen_productions")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("status", "COMPLETADA")
      .is("deleted_at", null),
  ]);

  const canMaestro = ctxCanAccess(ctx, "cocina.maestro");
  const canProduccion = ctxCanAccess(ctx, "cocina.produccion");
  const canRecetas = ctxCanAccess(ctx, "cocina.recetas");

  return (
    <>
      <AppHeader title="Cocina" subtitle="Costeo en cascada" />
      <main className="space-y-6 p-8">
        <CocinaNav
          permissions={ctx.permissions}
          isSuperAdmin={isSuperAdmin(ctx.role)}
        />
        <PageIntro
          title="De la materia prima a la carta"
          description="Materia prima → Insumo preparación (con merma y aprovechamiento) → Preparación → Producto de carta. Cada nivel concentra el costo real usable."
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Insumos preparación" value={String(insumosCount ?? 0)} />
          <StatCard label="Preparaciones" value={String(preparacionesCount ?? 0)} />
          <StatCard label="Productos carta" value={String(cartaCount ?? 0)} />
          <StatCard
            label="Producciones"
            value={String(produccionesCount ?? 0)}
            hint="Completadas"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {canMaestro ? (
            <Card>
              <h2 className="font-display text-lg font-semibold">1. Insumos preparación</h2>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Porcionar, limpiar y registrar merma. El costo se concentra en el
                rendimiento útil (ej. 3000 g a $5000 → 1500 g útiles a $3,33/g).
              </p>
              <Link
                href="/cocina/insumos"
                className="mt-4 inline-flex rounded-lg bg-[var(--ink)] px-4 py-2 text-sm text-white"
              >
                Ver insumos
              </Link>
            </Card>
          ) : null}
          {canProduccion ? (
            <Card>
              <h2 className="font-display text-lg font-semibold">2. Producción</h2>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Insumos (merma/aprovechamiento) o preparaciones desde receta.
                Cada batch actualiza stock y costo.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href="/cocina/producciones/nueva"
                  className="inline-flex rounded-lg bg-[var(--ink)] px-4 py-2 text-sm text-white"
                >
                  Producir insumo
                </Link>
                <Link
                  href="/cocina/producciones/nueva-preparacion"
                  className="inline-flex rounded-lg border border-[var(--line)] px-4 py-2 text-sm"
                >
                  Producir preparación
                </Link>
              </div>
            </Card>
          ) : null}
          {canRecetas ? (
            <Card>
              <h2 className="font-display text-lg font-semibold">3. Recetas</h2>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Arme preparaciones (ej. Birria) y productos de carta con insumos,
                materias primas y otras preparaciones.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href="/cocina/preparaciones"
                  className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm"
                >
                  Preparaciones
                </Link>
                <Link
                  href="/cocina/carta"
                  className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm"
                >
                  Carta
                </Link>
              </div>
            </Card>
          ) : null}
        </div>
      </main>
    </>
  );
}
