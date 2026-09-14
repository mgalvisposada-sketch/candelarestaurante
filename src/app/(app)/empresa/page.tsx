import { AppHeader } from "@/components/layout/app-header";
import { Card, PageIntro } from "@/components/ui/primitives";
import { getOrgContext } from "@/lib/org-context";
import { formatDateCO } from "@/lib/dates";
import { redirect } from "next/navigation";
import { OrganizationForm } from "./organization-form";

export default async function EmpresaPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");

  return (
    <>
      <AppHeader
        title="Empresa"
        subtitle="Identidad corporativa y fecha de corte administrativa"
      />
      <main className="space-y-6 p-8">
        <PageIntro
          title="Datos societarios"
          description="Razón social, NIT, representante legal y fecha de corte que define la línea base del empalme. Los documentos societarios se cargarán desde Documentos."
        />

        {ctx.organization ? (
          <Card className="mb-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-display text-xl font-semibold">
                  {ctx.organization.trade_name || ctx.organization.legal_name}
                </p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {ctx.organization.legal_name}
                  {ctx.organization.nit
                    ? ` · NIT ${ctx.organization.nit}${ctx.organization.dv ? `-${ctx.organization.dv}` : ""}`
                    : ""}
                </p>
              </div>
              <div className="text-right text-sm text-[var(--muted)]">
                <div>Fecha de corte</div>
                <div className="font-medium text-[var(--ink)]">
                  {formatDateCO(ctx.organization.administrative_cutoff_date)}
                </div>
              </div>
            </div>
          </Card>
        ) : null}

        <Card>
          <OrganizationForm organization={ctx.organization} />
        </Card>
      </main>
    </>
  );
}
