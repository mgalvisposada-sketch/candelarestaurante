import { AppHeader } from "@/components/layout/app-header";
import { Card, PageIntro } from "@/components/ui/primitives";
import { getOrgContext } from "@/lib/org-context";
import { requireModuleAccess } from "@/lib/permissions";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ReportesNav } from "./reportes-nav";

export default async function ReportesPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requireModuleAccess(ctx, "reportes");

  if (!ctx.organization) {
    return (
      <>
        <AppHeader title="Reportes" subtitle="Informes financieros" />
        <main className="p-8">
          <Card>
            <p className="font-medium">Primero configura la empresa</p>
            <Link
              href="/empresa"
              className="mt-4 inline-flex rounded-lg bg-[var(--solid)] px-4 py-2 text-sm text-[var(--on-solid)]"
            >
              Ir a Empresa
            </Link>
          </Card>
        </main>
      </>
    );
  }

  return (
    <>
      <AppHeader title="Reportes" subtitle="Informes financieros" />
      <main className="space-y-6 p-8">
        <ReportesNav />

        <PageIntro
          title="Informes"
          description="Consulta egresos reales por cuenta y período. Base caja: solo dinero que salió de bancos y cajas vía pagos ejecutados."
        />

        <div className="grid gap-4 md:grid-cols-2">
          <Link
            href="/reportes/egresos"
            className="group rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)] transition-colors hover:border-[var(--ink)]"
          >
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
              Financiero
            </p>
            <h2 className="mt-2 text-lg font-semibold text-[var(--ink)] group-hover:underline">
              Informe ejecutivo de egresos
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Gastos por categoría (expandible), cruce con cuentas y filtros
              dinámicos por período, origen y propósito.
            </p>
          </Link>
        </div>
      </main>
    </>
  );
}
