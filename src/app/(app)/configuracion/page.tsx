import { AppHeader } from "@/components/layout/app-header";
import { Card, PageIntro } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/org-context";
import { isSuperAdmin, ROLE_LABELS, type AppRole } from "@/types/domain";
import {
  CreateSystemUserForm,
  SystemUsersTable,
  type SystemUserRow,
} from "./users-client";

export default async function ConfiguracionPage() {
  const ctx = await getOrgContext();

  if (!ctx?.organization) {
    return (
      <>
        <AppHeader
          title="Configuración"
          subtitle="Usuarios, roles y parámetros de la organización"
        />
        <main className="p-8">
          <PageIntro
            title="Sin organización"
            description="Cree o asocie una organización antes de administrar usuarios."
          />
        </main>
      </>
    );
  }

  const supabase = await createClient();
  const { data: memberships } = await supabase
    .from("organization_users")
    .select(
      "id, role, created_at, user_id, profiles:user_id ( full_name, email, is_active )",
    )
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  const users: SystemUserRow[] = (memberships ?? []).map((row) => {
    const profile = Array.isArray(row.profiles)
      ? row.profiles[0]
      : row.profiles;
    return {
      membership_id: row.id as string,
      user_id: row.user_id as string,
      role: row.role as AppRole,
      email: (profile?.email as string | null | undefined) ?? null,
      full_name: (profile?.full_name as string | null | undefined) ?? null,
      is_active: Boolean(profile?.is_active ?? true),
      created_at: row.created_at as string,
    };
  });

  const canManageUsers = isSuperAdmin(ctx.role);

  return (
    <>
      <AppHeader
        title="Configuración"
        subtitle="Usuarios, roles y parámetros de la organización"
      />
      <main className="space-y-8 p-8">
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <PageIntro
              title="Usuarios del sistema"
              description={
                canManageUsers
                  ? "Cree accesos, asigne roles y actualice contraseñas. Solo visible y editable para super admin."
                  : "Solo un super admin puede crear o modificar usuarios y contraseñas."
              }
            />
            {canManageUsers ? <CreateSystemUserForm /> : null}
          </div>

          {canManageUsers ? (
            <SystemUsersTable users={users} currentUserId={ctx.userId} />
          ) : (
            <Card>
              <h3 className="font-medium">Tu acceso</h3>
              <p className="mt-2 text-sm text-[var(--muted)]">
                {ctx.email ?? "Sin correo"} ·{" "}
                {ctx.role ? ROLE_LABELS[ctx.role] : "Sin rol"}
              </p>
              <p className="mt-3 text-sm text-[var(--muted)]">
                Para altas, cambios de rol o contraseñas, solicítelo a un super
                admin de la organización.
              </p>
            </Card>
          )}
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <Card>
            <h3 className="font-medium">Roles</h3>
            <ul className="mt-3 space-y-2 text-sm text-[var(--muted)]">
              {(Object.keys(ROLE_LABELS) as AppRole[]).map((role) => (
                <li key={role}>
                  <span className="font-medium text-[var(--ink)]">
                    {ROLE_LABELS[role]}
                  </span>
                  {role === "SUPER_ADMIN"
                    ? " — usuarios y configuración crítica"
                    : role === "GESTION"
                      ? " — operación diaria"
                      : role === "SOCIO"
                        ? " — lectura de gobierno societario"
                        : role === "CONTADOR"
                          ? " — lectura financiera / tributaria"
                          : " — solo consulta"}
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <h3 className="font-medium">Seguridad</h3>
            <ul className="mt-3 space-y-2 text-sm text-[var(--muted)]">
              <li>Supabase Auth + RLS multi-tenant</li>
              <li>Alta de usuarios con service role solo en servidor</li>
              <li>Cambios de acceso auditados</li>
              <li>Cierre de sesión disponible en el menú lateral</li>
            </ul>
          </Card>
        </section>
      </main>
    </>
  );
}
