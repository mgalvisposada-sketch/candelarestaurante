import { AppHeader } from "@/components/layout/app-header";
import { Badge, Card, PageIntro } from "@/components/ui/primitives";
import { WorkSection, WorkStack } from "@/components/ui/work-section";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/org-context";
import { resolveEffectivePermissions, ctxCanAccess } from "@/lib/permissions";
import {
  isSuperAdmin,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  type AppRole,
} from "@/types/domain";
import {
  CreateSystemUserForm,
  SystemUsersTable,
  type SystemUserRow,
} from "./users-client";
import {
  PermissionsManager,
  type PermissionUserOption,
} from "./permissions-client";

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

  if (!ctxCanAccess(ctx, "configuracion")) {
    return (
      <>
        <AppHeader title="Configuración" subtitle="Acceso restringido" />
        <main className="p-8">
          <Card>
            <p className="font-medium">No tienes permiso para este módulo</p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Solicita acceso a un super admin de la organización.
            </p>
          </Card>
        </main>
      </>
    );
  }

  const canManageUsers = isSuperAdmin(ctx.role);
  const canManagePermissions =
    isSuperAdmin(ctx.role) || ctx.role === "GESTION";

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

  let permissionUsers: PermissionUserOption[] = [];
  if (canManagePermissions) {
    const membershipIds = users.map((u) => u.membership_id);
    const { data: permRows } = membershipIds.length
      ? await supabase
          .from("user_module_permissions")
          .select("membership_id, permission_key")
          .eq("organization_id", ctx.organization.id)
          .in("membership_id", membershipIds)
      : { data: [] as { membership_id: string; permission_key: string }[] };

    const byMembership = new Map<string, string[]>();
    for (const row of permRows ?? []) {
      const list = byMembership.get(row.membership_id) ?? [];
      list.push(row.permission_key);
      byMembership.set(row.membership_id, list);
    }

    permissionUsers = users.map((u) => ({
      membership_id: u.membership_id,
      user_id: u.user_id,
      full_name: u.full_name,
      email: u.email,
      role: u.role,
      permission_keys: resolveEffectivePermissions({
        role: u.role,
        storedKeys: byMembership.get(u.membership_id) ?? [],
      }),
    }));
  }

  return (
    <>
      <AppHeader
        title="Configuración"
        subtitle="Usuarios, roles, permisos y parámetros de la organización"
      />
      <main className="space-y-6 p-8">
        <PageIntro
          title="Configuración"
          description="Usuarios, roles y permisos de la organización."
        />

        <WorkStack>
          {canManageUsers ? (
            <>
              <WorkSection
                kind="form"
                title="Nuevo usuario"
                description="Cree accesos y asigne un rol inicial."
                defaultOpen={users.length === 0}
              >
                <CreateSystemUserForm embedded />
              </WorkSection>
              <WorkSection
                kind="list"
                title="Usuarios del sistema"
                description="Roles y contraseñas."
                badge={<Badge tone="neutral">{users.length}</Badge>}
                defaultOpen
              >
                <SystemUsersTable users={users} currentUserId={ctx.userId} />
              </WorkSection>
            </>
          ) : null}

          {canManagePermissions ? (
            <WorkSection
              kind="tools"
              title="Permisos por módulo"
              description="Define a qué módulos y submódulos puede entrar cada usuario. El super admin siempre tiene acceso total."
              defaultOpen
            >
              <PermissionsManager
                users={permissionUsers}
                canGrantPrivilegedConfig={isSuperAdmin(ctx.role)}
              />
            </WorkSection>
          ) : null}

          {!canManageUsers && !canManagePermissions ? (
            <Card>
              <h3 className="font-medium">Tu acceso</h3>
              <p className="mt-2 text-sm text-[var(--muted)]">
                {ctx.email ?? "Sin correo"} ·{" "}
                {ctx.role ? ROLE_LABELS[ctx.role] : "Sin rol"}
              </p>
              <p className="mt-3 text-sm text-[var(--muted)]">
                No tienes permisos de administración en este módulo.
              </p>
            </Card>
          ) : null}

          <WorkSection kind="tools" title="Roles y seguridad" defaultOpen={false}>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h4 className="font-medium">Roles</h4>
                <ul className="mt-3 space-y-3 text-sm text-[var(--muted)]">
                  {(Object.keys(ROLE_LABELS) as AppRole[]).map((role) => (
                    <li key={role}>
                      <span className="font-medium text-[var(--ink)]">
                        {ROLE_LABELS[role]}
                      </span>
                      <span> — {ROLE_DESCRIPTIONS[role]}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="font-medium">Seguridad</h4>
                <ul className="mt-3 space-y-2 text-sm text-[var(--muted)]">
                  <li>Permisos por módulo y submódulo por usuario</li>
                  <li>Supabase Auth + RLS multi-tenant</li>
                  <li>Cambios de acceso auditados</li>
                  <li>Cierre de sesión en el menú lateral</li>
                </ul>
              </div>
            </div>
          </WorkSection>
        </WorkStack>
      </main>
    </>
  );
}
