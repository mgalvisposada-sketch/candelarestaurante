import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/layout/app-header";
import { Card, PageIntro } from "@/components/ui/primitives";
import { getOrgContext } from "@/lib/org-context";
import { ctxCanAccess, requireModuleAccess } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import {
  GestionesClient,
  type GestionRow,
  type TeamMember,
} from "./gestiones-client";

export default async function GestionesPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requireModuleAccess(ctx, "gestiones");

  if (!ctx.organization) {
    return (
      <>
        <AppHeader title="Gestiones" subtitle="Tareas del equipo" />
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

  const supabase = await createClient();
  const orgId = ctx.organization.id;

  const [membersRes, gestionesRes] = await Promise.all([
    supabase
      .from("organization_users")
      .select(
        "user_id, profiles:user_id ( full_name, email, is_active )",
      )
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("gestiones")
      .select(
        "id, title, description, status, priority, assigned_to, due_date, completed_at, created_at, created_by",
      )
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  const members: TeamMember[] = (membersRes.data ?? []).map((row) => {
    const profile = Array.isArray(row.profiles)
      ? row.profiles[0]
      : row.profiles;
    return {
      user_id: row.user_id as string,
      full_name: (profile?.full_name as string | null) ?? null,
      email: (profile?.email as string | null) ?? null,
      is_active: Boolean(profile?.is_active ?? true),
    };
  });

  const gestiones = (gestionesRes.data ?? []) as GestionRow[];
  const canCreate = ctxCanAccess(ctx, "gestiones.crear");
  const canManage = ctxCanAccess(ctx, "gestiones.gestionar");

  return (
    <>
      <AppHeader
        title="Gestiones"
        subtitle="Asigna · sigue · cierra · entre todo el equipo"
      />
      <main className="space-y-6 p-8">
        <PageIntro
          title="Gestor de tareas del equipo"
          description="Crea gestiones para ti o para alguien más. Tu equipo puede asignarte trabajo y todos pueden estar al tanto del avance sin perder el hilo."
        />
        <GestionesClient
          currentUserId={ctx.userId}
          members={members}
          gestiones={gestiones}
          canCreate={canCreate}
          canManage={canManage}
        />
      </main>
    </>
  );
}
