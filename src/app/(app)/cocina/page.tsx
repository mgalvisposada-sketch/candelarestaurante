import Link from "next/link";
import { AppHeader } from "@/components/layout/app-header";
import { Card, PageIntro, StatCard } from "@/components/ui/primitives";
import { getOrgContext } from "@/lib/org-context";
import { ctxCanAccess, requireModuleAccess } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { isSuperAdmin } from "@/types/domain";
import { redirect } from "next/navigation";
import { CocinaNav } from "./cocina-nav";
import { CocinaSearch, type CocinaSearchHit } from "./cocina-search";

function productHref(kind: string, productId: string) {
  switch (kind) {
    case "MATERIA_PRIMA":
      return `/inventario/maestro?producto=${productId}`;
    case "INSUMO_PREPARACION":
      return `/cocina/insumos?producto=${productId}`;
    case "PREPARACION":
      return `/cocina/preparaciones?producto=${productId}`;
    case "PRODUCTO_CARTA":
      return `/cocina/carta?producto=${productId}`;
    default:
      return "/cocina";
  }
}

export default async function CocinaPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requireModuleAccess(ctx, "cocina");
  if (!ctx.organization) redirect("/empresa");

  const supabase = await createClient();
  const orgId = ctx.organization.id;

  const canMaestro = ctxCanAccess(ctx, "cocina.maestro");
  const canProduccion = ctxCanAccess(ctx, "cocina.produccion");
  const canRecetas = ctxCanAccess(ctx, "cocina.recetas");
  const canInventario = ctxCanAccess(ctx, "inventario.maestro");

  const [
    { count: materiaCount },
    { count: insumosCount },
    { count: preparacionesCount },
    { count: cartaCount },
    { count: produccionesCount },
    { data: productRows },
    { data: productionRows },
    { data: categoryRows },
  ] = await Promise.all([
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("item_kind", "MATERIA_PRIMA")
      .is("deleted_at", null),
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
    supabase
      .from("products")
      .select(
        "id, name, sku, unit, item_kind, current_stock, category_id, product_categories(name, code)",
      )
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .in("item_kind", [
        "MATERIA_PRIMA",
        "INSUMO_PREPARACION",
        "PREPARACION",
        "PRODUCTO_CARTA",
      ])
      .order("name")
      .limit(2000),
    canProduccion
      ? supabase
          .from("kitchen_productions")
          .select(
            "id, title, produced_at, production_type, status, products:output_product_id(name)",
          )
          .eq("organization_id", orgId)
          .is("deleted_at", null)
          .order("produced_at", { ascending: false })
          .limit(300)
      : Promise.resolve({ data: [] as never[] }),
    supabase
      .from("product_categories")
      .select("id, name, code")
      .eq("organization_id", orgId)
      .is("deleted_at", null),
  ]);

  const categoryById = new Map(
    (categoryRows ?? []).map((c) => [c.id, c]),
  );

  const searchHits: CocinaSearchHit[] = [];

  for (const p of productRows ?? []) {
    const kind = p.item_kind as CocinaSearchHit["kind"];
    const catRel = Array.isArray(p.product_categories)
      ? p.product_categories[0]
      : p.product_categories;
    const cat = categoryById.get(p.category_id);
    const catLabel =
      cat?.name ??
      (catRel as { name?: string } | null)?.name ??
      null;
    const stock = Number(p.current_stock || 0);

    searchHits.push({
      id: p.id,
      kind,
      name: p.name,
      subtitle: [catLabel, p.sku].filter(Boolean).join(" · ") || null,
      href: productHref(kind, p.id),
      meta:
        kind === "PRODUCTO_CARTA"
          ? null
          : `Stock ${stock} ${p.unit}`,
    });
  }

  for (const prod of productionRows ?? []) {
    const out = Array.isArray(prod.products) ? prod.products[0] : prod.products;
    const outName = (out as { name?: string } | null)?.name;
    searchHits.push({
      id: prod.id,
      kind: "PRODUCCION",
      name: prod.title,
      subtitle: [outName, prod.production_type, prod.status]
        .filter(Boolean)
        .join(" · "),
      href: `/cocina/producciones/${prod.id}`,
      meta: prod.produced_at,
    });
  }

  return (
    <>
      <AppHeader title="Cocina" subtitle="Cascada de inventario y costeo" />
      <main className="space-y-8 p-8">
        <CocinaNav
          permissions={ctx.permissions}
          isSuperAdmin={isSuperAdmin(ctx.role)}
        />
        <PageIntro
          title="Todo lo que se cocina también es inventario"
          description="Hay cuatro tipos de producto con stock y costo. “Producir” no es un tipo nuevo: es la acción que convierte un nivel en el siguiente."
        />

        <CocinaSearch hits={searchHits} />

        {/* Cascada visual */}
        <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[linear-gradient(160deg,var(--panel-warm)_0%,var(--panel-warm-mid)_45%,var(--panel-warm-deep)_100%)]">
          <div className="border-b border-[var(--line)] px-5 py-4 sm:px-6">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--muted)]">
              Cascada Candela
            </p>
            <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
              Cada flecha puede ser una producción del día o una carga de
              apertura (stock que el restaurante ya tenía).
            </p>
          </div>

          <ol className="grid gap-0 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr]">
            <CascadeLevel
              step="0"
              title="Materia prima"
              subtitle="Inventario comprable"
              detail="Aceite, cebolla, carne… lo que entra por compras."
              count={materiaCount ?? 0}
              href={canInventario ? "/inventario/maestro" : undefined}
              cta={canInventario ? "Ver inventario" : undefined}
              tone="base"
            />
            <CascadeArrow label="merma / aprovechamiento" />
            <CascadeLevel
              step="1"
              title="Insumo preparación"
              subtitle="Inventario de cocina"
              detail="Sin receta: limpia/porciona materia prima, registra merma y aprovechamientos."
              count={insumosCount ?? 0}
              href={canMaestro ? "/cocina/insumos" : undefined}
              cta={canMaestro ? "Ver insumos" : undefined}
              tone="kitchen"
            />
            <CascadeArrow label="receta / batch" />
            <CascadeLevel
              step="2"
              title="Preparación"
              subtitle="Inventario intermedio"
              detail="Ej. Birria, salsa, fondo. Se arma con materia prima, insumos y/u otras preparaciones."
              count={preparacionesCount ?? 0}
              href={canRecetas ? "/cocina/preparaciones" : undefined}
              cta={canRecetas ? "Ver preparaciones" : undefined}
              tone="kitchen"
            />
            <CascadeArrow label="montaje" />
            <CascadeLevel
              step="3"
              title="Producto de carta"
              subtitle="Menú"
              detail="Plato o bebida. Receta con inventario, insumos y/o preparaciones."
              count={cartaCount ?? 0}
              href={canRecetas ? "/cocina/carta" : undefined}
              cta={canRecetas ? "Ver carta" : undefined}
              tone="menu"
            />
          </ol>
        </section>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Materias primas"
            value={String(materiaCount ?? 0)}
            hint="Inventario"
          />
          <StatCard
            label="Insumos"
            value={String(insumosCount ?? 0)}
            hint="Con stock"
          />
          <StatCard
            label="Preparaciones"
            value={String(preparacionesCount ?? 0)}
            hint="Con stock"
          />
          <StatCard
            label="Batches producidos"
            value={String(produccionesCount ?? 0)}
            hint="Acción, no maestro"
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
              Productos (= inventario)
            </p>
            <h2 className="mt-2 font-display text-xl font-semibold">
              Maestro y stock
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Cree o cargue masivamente cada nivel con stock y costo de apertura.
              Luego el día a día solo mueve cantidades.
            </p>
            <ul className="mt-4 space-y-2 text-sm">
              <li className="flex gap-2">
                <span className="font-medium text-[var(--ink)]">Inventario</span>
                <span className="text-[var(--muted)]">
                  → materias primas (compras)
                </span>
              </li>
              <li className="flex gap-2">
                <span className="font-medium text-[var(--ink)]">Insumos</span>
                <span className="text-[var(--muted)]">
                  → salen de materia prima
                </span>
              </li>
              <li className="flex gap-2">
                <span className="font-medium text-[var(--ink)]">Preparaciones</span>
                <span className="text-[var(--muted)]">
                  → salen de inventario + insumos (+ otras prep.)
                </span>
              </li>
              <li className="flex gap-2">
                <span className="font-medium text-[var(--ink)]">Carta</span>
                <span className="text-[var(--muted)]">
                  → arma el menú con todo lo anterior
                </span>
              </li>
            </ul>
            <div className="mt-5 flex flex-wrap gap-2">
              {canInventario ? (
                <Link
                  href="/inventario/maestro"
                  className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm"
                >
                  Materias primas
                </Link>
              ) : null}
              {canMaestro ? (
                <Link
                  href="/cocina/insumos"
                  className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm"
                >
                  Insumos
                </Link>
              ) : null}
              {canRecetas ? (
                <>
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
                </>
              ) : null}
            </div>
          </Card>

          <Card>
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
              Acción del día
            </p>
            <h2 className="mt-2 font-display text-xl font-semibold">
              Crear más
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Fabricar más cantidad de un producto que ya está en el catálogo.
              Consume inventario y entra stock. No da de alta productos nuevos.
            </p>
            <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm">
              <p>
                <span className="font-medium">Crear más · Insumo</span>
                <span className="text-[var(--muted)]">
                  {" "}
                  · materia prima + merma (+ aprovechamiento)
                </span>
              </p>
              <p className="mt-2">
                <span className="font-medium">Crear más · Preparación</span>
                <span className="text-[var(--muted)]">
                  {" "}
                  · receta con MP e insumos
                </span>
              </p>
            </div>
            {canProduccion ? (
              <div className="mt-5 flex flex-wrap gap-2">
                <Link
                  href="/cocina/insumos"
                  className="rounded-lg bg-[var(--solid)] px-4 py-2 text-sm text-[var(--on-solid)]"
                >
                  Desde insumos
                </Link>
                <Link
                  href="/cocina/preparaciones"
                  className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm"
                >
                  Desde preparaciones
                </Link>
                <Link
                  href="/cocina/producciones"
                  className="rounded-lg px-3 py-2 text-sm text-[var(--muted)] underline-offset-2 hover:underline"
                >
                  Historial ({produccionesCount ?? 0})
                </Link>
              </div>
            ) : (
              <p className="mt-5 text-sm text-[var(--muted)]">
                Sin permiso de producción.
              </p>
            )}
          </Card>
        </div>
      </main>
    </>
  );
}

function CascadeLevel({
  step,
  title,
  subtitle,
  detail,
  count,
  href,
  cta,
  tone,
}: {
  step: string;
  title: string;
  subtitle: string;
  detail: string;
  count: number;
  href?: string;
  cta?: string;
  tone: "base" | "kitchen" | "menu";
}) {
  const toneClass =
    tone === "base"
      ? "bg-[var(--surface)]/80"
      : tone === "menu"
        ? "bg-[var(--solid)] text-[var(--on-solid)]"
        : "bg-[var(--surface)]";

  const muted =
    tone === "menu" ? "text-[var(--on-solid)]/70" : "text-[var(--muted)]";
  const strong =
    tone === "menu" ? "text-[var(--on-solid)]" : "text-[var(--ink)]";

  const body = (
    <div className={`flex h-full flex-col px-5 py-5 sm:px-6 ${toneClass}`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className={`text-xs font-semibold tracking-wide ${muted}`}>
          Nivel {step}
        </span>
        <span className={`font-display text-2xl font-semibold tabular-nums ${strong}`}>
          {count}
        </span>
      </div>
      <h3 className={`mt-2 font-display text-lg font-semibold ${strong}`}>
        {title}
      </h3>
      <p className={`mt-0.5 text-xs font-medium uppercase tracking-[0.1em] ${muted}`}>
        {subtitle}
      </p>
      <p className={`mt-3 flex-1 text-sm leading-relaxed ${muted}`}>{detail}</p>
      {cta ? (
        <span
          className={`mt-4 inline-flex text-sm font-medium ${
            tone === "menu" ? "text-[var(--on-solid)] underline-offset-2" : "text-[var(--ink)]"
          }`}
        >
          {cta} →
        </span>
      ) : null}
    </div>
  );

  if (href) {
    return (
      <li className="border-b border-[var(--line)] lg:border-b-0 lg:border-r">
        <Link href={href} className="block h-full transition hover:brightness-[0.98]">
          {body}
        </Link>
      </li>
    );
  }

  return (
    <li className="border-b border-[var(--line)] lg:border-b-0 lg:border-r last:border-0">
      {body}
    </li>
  );
}

function CascadeArrow({ label }: { label: string }) {
  return (
    <li
      aria-hidden
      className="hidden items-center justify-center px-1 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--muted)] lg:flex"
    >
      <div className="flex flex-col items-center gap-1">
        <span>→</span>
        <span className="max-w-[4.5rem] text-center leading-tight">{label}</span>
      </div>
    </li>
  );
}
