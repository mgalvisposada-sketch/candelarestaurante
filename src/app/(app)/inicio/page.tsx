import { AppHeader } from "@/components/layout/app-header";
import { Badge, Card, PageIntro, StatCard } from "@/components/ui/primitives";
import { formatCOP } from "@/lib/money";
import { formatDateCO } from "@/lib/dates";
import { getOrgContext } from "@/lib/org-context";
import { createClient } from "@/lib/supabase/server";
import { summarizeHandoverQuality } from "@/lib/handover";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function InicioPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");

  let quality = {
    pctConfirmed: 0,
    pctDeclared: 0,
    pctPending: 0,
  };
  let handoverStatus: string | null = null;

  if (ctx.organization) {
    const supabase = await createClient();
    const { data: session } = await supabase
      .from("handover_sessions")
      .select("id, status")
      .eq("organization_id", ctx.organization.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (session) {
      handoverStatus = session.status;
      const { data: items } = await supabase
        .from("handover_items")
        .select("verification_status")
        .eq("handover_session_id", session.id)
        .is("deleted_at", null);
      quality = summarizeHandoverQuality(
        (items ?? []).map((i) => ({
          status: i.verification_status as
            | "CONFIRMADO"
            | "DECLARADO"
            | "PENDIENTE",
        })),
      );
    }
  }

  return (
    <>
      <AppHeader
        title="Inicio"
        subtitle="Panel administrativo — entrega y control financiero"
      />
      <main className="space-y-6 p-8">
        <PageIntro
          title={
            ctx.organization
              ? ctx.organization.trade_name || ctx.organization.legal_name
              : "Situación administrativa"
          }
          description={
            ctx.organization
              ? `Corte: ${formatDateCO(ctx.organization.administrative_cutoff_date)} · Rol: ${ctx.role}`
              : "Candela Admin responde qué tiene y qué debe la empresa. Configura primero la organización en Empresa."
          }
        />

        {!ctx.organization ? (
          <Card>
            <p className="font-medium">Aún no hay empresa configurada</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Crea la organización para iniciar la entrega y el acta del día 1.
            </p>
            <Link
              href="/empresa"
              className="mt-4 inline-flex rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--accent-hover)]"
            >
              Configurar empresa
            </Link>
          </Card>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Liquidez" value={formatCOP(0)} hint="Bancos + caja" />
          <StatCard label="CxP" value={formatCOP(0)} hint="Saldo proveedores" />
          <StatCard
            label="Deuda con socios"
            value={formatCOP(0)}
            hint="Préstamos activos"
          />
          <StatCard label="Gasto mensual" value="—" hint="Disponible en MVP 2" />
          <StatCard
            label="Capital disponible"
            value={formatCOP(0)}
            hint="Bolsas sin comprometer"
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-medium">Calidad de la entrega</h3>
              <Badge tone={handoverStatus === "CERRADO" ? "ok" : "warn"}>
                {handoverStatus ?? "Sin sesión"}
              </Badge>
            </div>
            <div className="space-y-2 text-sm text-[var(--muted)]">
              <p>Confirmado: {quality.pctConfirmed}%</p>
              <p>Declarado: {quality.pctDeclared}%</p>
              <p>Pendiente: {quality.pctPending}%</p>
            </div>
            <Link
              href="/empalme"
              className="mt-4 inline-block text-sm font-medium text-[var(--accent)]"
            >
              Ir a la entrega →
            </Link>
          </Card>
          <Card>
            <h3 className="mb-3 font-medium">Próximos pasos MVP 1</h3>
            <ol className="list-decimal space-y-2 pl-4 text-sm text-[var(--muted)]">
              <li>Completar datos de Empresa y fecha de corte</li>
              <li>Registrar socios y participación</li>
              <li>Cargar bancos, CxP y préstamos</li>
              <li>Cerrar la entrega y emitir Acta PDF</li>
            </ol>
          </Card>
          <Card>
            <h3 className="mb-3 font-medium">Frontera FILIPO</h3>
            <p className="text-sm leading-relaxed text-[var(--muted)]">
              Ventas, Food Cost e inventarios operativos no se muestran aquí.
              Cuando exista integración, aparecerán en una sección READ ONLY
              claramente identificada.
            </p>
          </Card>
        </div>
      </main>
    </>
  );
}
