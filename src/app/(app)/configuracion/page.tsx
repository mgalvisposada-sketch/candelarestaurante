import { AppHeader } from "@/components/layout/app-header";
import { Card, PageIntro } from "@/components/ui/primitives";

export default function ConfiguracionPage() {
  return (
    <>
      <AppHeader
        title="Configuración"
        subtitle="Usuarios, roles y parámetros de la organización"
      />
      <main className="space-y-6 p-8">
        <PageIntro
          title="RBAC y entorno"
          description="Roles: SUPER_ADMIN, GESTION, SOCIO, CONTADOR, LECTURA. Las personas se administran en base de datos; no se hardcodean en el código."
        />
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <h3 className="font-medium">Seguridad</h3>
            <ul className="mt-3 space-y-2 text-sm text-[var(--muted)]">
              <li>Supabase Auth + RLS multi-tenant</li>
              <li>Service role solo server-side</li>
              <li>Audit logs en operaciones sensibles</li>
            </ul>
          </Card>
          <Card>
            <h3 className="font-medium">Localización</h3>
            <ul className="mt-3 space-y-2 text-sm text-[var(--muted)]">
              <li>UI en español</li>
              <li>Moneda COP (NUMERIC)</li>
              <li>Fechas DD/MM/YYYY · America/Bogota</li>
            </ul>
          </Card>
        </div>
      </main>
    </>
  );
}
