"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { OrgContext } from "@/lib/org-context";
import { getOrgContext } from "@/lib/org-context";
import {
  normalizePermissionKeys,
  ROLE_DEFAULT_PERMISSIONS,
} from "@/lib/permissions-catalog";
import { ctxCanAccess } from "@/lib/permissions";
import { isSuperAdmin, type AppRole } from "@/types/domain";
import {
  createSystemUserSchema,
  updateSystemUserSchema,
} from "@/validations/users";
import { saveUserPermissionsSchema } from "@/validations/permissions";
import type { ActionResult } from "../empresa/actions";

type AdminCtx = OrgContext & {
  organization: NonNullable<OrgContext["organization"]>;
};

async function requireSuperAdmin(): Promise<
  { ok: true; ctx: AdminCtx } | { ok: false; error: string }
> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) {
    return { ok: false, error: "Sin organización" };
  }
  if (!isSuperAdmin(ctx.role)) {
    return {
      ok: false,
      error: "Solo un super admin puede gestionar usuarios del sistema",
    };
  }
  return {
    ok: true,
    ctx: ctx as AdminCtx,
  };
}

async function requirePermissionsAdmin(): Promise<
  { ok: true; ctx: AdminCtx } | { ok: false; error: string }
> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) {
    return { ok: false, error: "Sin organización" };
  }
  const canManage =
    isSuperAdmin(ctx.role) ||
    ctx.role === "GESTION" ||
    ctxCanAccess(ctx, "configuracion.permisos");
  if (!canManage) {
    return {
      ok: false,
      error: "Sin permiso para editar permisos por módulo",
    };
  }
  return {
    ok: true,
    ctx: ctx as AdminCtx,
  };
}

async function seedMembershipPermissions(opts: {
  organizationId: string;
  membershipId: string;
  role: AppRole;
  actorId: string;
  replace?: boolean;
}) {
  const keys = ROLE_DEFAULT_PERMISSIONS[opts.role] ?? [];
  const supabase = await createClient();

  if (opts.replace) {
    await supabase
      .from("user_module_permissions")
      .delete()
      .eq("organization_id", opts.organizationId)
      .eq("membership_id", opts.membershipId);
  }

  if (keys.length === 0 || opts.role === "SUPER_ADMIN") return;

  const rows = keys.map((permission_key) => ({
    organization_id: opts.organizationId,
    membership_id: opts.membershipId,
    permission_key,
    created_by: opts.actorId,
    updated_by: opts.actorId,
  }));

  const { error } = await supabase.from("user_module_permissions").insert(rows);
  if (error) {
    console.error("seedMembershipPermissions:", error.message);
  }
}

export async function createSystemUserAction(
  formData: FormData,
): Promise<ActionResult> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { ctx } = gate;

  const parsed = createSystemUserSchema.safeParse({
    email: formData.get("email"),
    full_name: formData.get("full_name"),
    role: formData.get("role"),
    password: formData.get("password"),
    is_active: formData.get("is_active") || "true",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  const v = parsed.data;
  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Service role no configurado",
    };
  }

  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email: v.email.trim().toLowerCase(),
      password: v.password,
      email_confirm: true,
      user_metadata: { full_name: v.full_name.trim() },
    });

  if (createError || !created.user) {
    return {
      ok: false,
      error: createError?.message ?? "No se pudo crear el usuario en Auth",
    };
  }

  const userId = created.user.id;

  const { error: profileError } = await admin
    .from("profiles")
    .update({
      full_name: v.full_name.trim(),
      email: v.email.trim().toLowerCase(),
      is_active: v.is_active !== "false",
    })
    .eq("id", userId);

  if (profileError) {
    await admin.auth.admin.deleteUser(userId);
    return { ok: false, error: profileError.message };
  }

  const supabase = await createClient();
  const { data: membership, error: membershipError } = await supabase
    .from("organization_users")
    .insert({
      organization_id: ctx.organization.id,
      user_id: userId,
      role: v.role,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (membershipError) {
    await admin.auth.admin.deleteUser(userId);
    return { ok: false, error: membershipError.message };
  }

  await seedMembershipPermissions({
    organizationId: ctx.organization.id,
    membershipId: membership.id,
    role: v.role,
    actorId: ctx.userId,
  });

  await supabase.from("audit_logs").insert({
    organization_id: ctx.organization.id,
    user_id: ctx.userId,
    action: "CREATE",
    entity: "organization_users",
    entity_id: membership.id,
    new_values: {
      email: v.email.trim().toLowerCase(),
      role: v.role,
      target_user_id: userId,
    },
  });

  // El cliente hace router.refresh(); evita doble refresh que deja el botón colgado.
  return { ok: true, id: membership.id };
}

export async function updateSystemUserAction(
  formData: FormData,
): Promise<ActionResult> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { ctx } = gate;

  const parsed = updateSystemUserSchema.safeParse({
    membership_id: formData.get("membership_id"),
    user_id: formData.get("user_id"),
    email: formData.get("email"),
    full_name: formData.get("full_name"),
    role: formData.get("role"),
    password: formData.get("password"),
    is_active: formData.get("is_active") || "true",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  const v = parsed.data;
  const supabase = await createClient();

  const { data: membership, error: loadError } = await supabase
    .from("organization_users")
    .select("id, user_id, role, organization_id")
    .eq("id", v.membership_id)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (loadError || !membership) {
    return { ok: false, error: loadError?.message ?? "Usuario no encontrado" };
  }

  if (membership.user_id !== v.user_id) {
    return { ok: false, error: "Membresía inconsistente" };
  }

  if (
    membership.user_id === ctx.userId &&
    membership.role === "SUPER_ADMIN" &&
    v.role !== "SUPER_ADMIN"
  ) {
    return {
      ok: false,
      error: "No puedes quitarte el rol de super admin a ti mismo",
    };
  }

  if (membership.role === "SUPER_ADMIN" && v.role !== "SUPER_ADMIN") {
    const { count } = await supabase
      .from("organization_users")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", ctx.organization.id)
      .eq("role", "SUPER_ADMIN")
      .is("deleted_at", null);

    if ((count ?? 0) <= 1) {
      return {
        ok: false,
        error: "Debe quedar al menos un super admin en la organización",
      };
    }
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Service role no configurado",
    };
  }

  const authPatch: {
    email?: string;
    password?: string;
    user_metadata?: { full_name: string };
  } = {
    email: v.email.trim().toLowerCase(),
    user_metadata: { full_name: v.full_name.trim() },
  };
  if (v.password) authPatch.password = v.password;

  const { error: authError } = await admin.auth.admin.updateUserById(
    v.user_id,
    authPatch,
  );
  if (authError) return { ok: false, error: authError.message };

  const { error: profileError } = await admin
    .from("profiles")
    .update({
      full_name: v.full_name.trim(),
      email: v.email.trim().toLowerCase(),
      is_active: v.is_active !== "false",
    })
    .eq("id", v.user_id);

  if (profileError) return { ok: false, error: profileError.message };

  const { error: membershipError } = await supabase
    .from("organization_users")
    .update({
      role: v.role,
      updated_by: ctx.userId,
    })
    .eq("id", v.membership_id)
    .eq("organization_id", ctx.organization.id);

  if (membershipError) return { ok: false, error: membershipError.message };

  if (membership.role !== v.role) {
    await seedMembershipPermissions({
      organizationId: ctx.organization.id,
      membershipId: v.membership_id,
      role: v.role,
      actorId: ctx.userId,
      replace: true,
    });
  }

  await supabase.from("audit_logs").insert({
    organization_id: ctx.organization.id,
    user_id: ctx.userId,
    action: "UPDATE",
    entity: "organization_users",
    entity_id: v.membership_id,
    new_values: {
      email: v.email.trim().toLowerCase(),
      role: v.role,
      is_active: v.is_active !== "false",
      password_changed: Boolean(v.password),
      target_user_id: v.user_id,
      permissions_reset: membership.role !== v.role,
    },
  });

  return { ok: true, id: v.membership_id };
}

export async function deactivateSystemUserAction(
  membershipId: string,
): Promise<ActionResult> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { ctx } = gate;

  const supabase = await createClient();
  const { data: membership, error: loadError } = await supabase
    .from("organization_users")
    .select("id, user_id, role")
    .eq("id", membershipId)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (loadError || !membership) {
    return { ok: false, error: loadError?.message ?? "Usuario no encontrado" };
  }

  if (membership.user_id === ctx.userId) {
    return { ok: false, error: "No puedes desactivar tu propia cuenta" };
  }

  if (membership.role === "SUPER_ADMIN") {
    const { count } = await supabase
      .from("organization_users")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", ctx.organization.id)
      .eq("role", "SUPER_ADMIN")
      .is("deleted_at", null);

    if ((count ?? 0) <= 1) {
      return {
        ok: false,
        error: "Debe quedar al menos un super admin en la organización",
      };
    }
  }

  const { error } = await supabase
    .from("organization_users")
    .update({
      deleted_at: new Date().toISOString(),
      updated_by: ctx.userId,
    })
    .eq("id", membershipId);

  if (error) return { ok: false, error: error.message };

  try {
    const admin = createAdminClient();
    await admin
      .from("profiles")
      .update({ is_active: false })
      .eq("id", membership.user_id);
  } catch {
    // Si no hay service role, la membresía ya quedó desactivada.
  }

  await supabase.from("audit_logs").insert({
    organization_id: ctx.organization.id,
    user_id: ctx.userId,
    action: "SOFT_DELETE",
    entity: "organization_users",
    entity_id: membershipId,
    new_values: { target_user_id: membership.user_id },
  });

  revalidatePath("/configuracion");
  return { ok: true, id: membershipId };
}

export async function saveUserPermissionsAction(
  membershipId: string,
  permissionKeys: string[],
): Promise<ActionResult> {
  const gate = await requirePermissionsAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { ctx } = gate;

  const parsed = saveUserPermissionsSchema.safeParse({
    membership_id: membershipId,
    // Normaliza legacy (compras.inventario* → inventario.*) y descarta basura.
    permission_keys: normalizePermissionKeys(permissionKeys),
  });
  if (!parsed.success) {
    const invalid = permissionKeys.filter(
      (k) => !normalizePermissionKeys([k]).length,
    );
    return {
      ok: false,
      error:
        invalid.length > 0
          ? `Hay claves de permiso inválidas: ${invalid.slice(0, 8).join(", ")}`
          : (parsed.error.issues[0]?.message ?? "Datos inválidos"),
    };
  }

  const supabase = await createClient();
  const { data: membership, error: loadError } = await supabase
    .from("organization_users")
    .select("id, user_id, role")
    .eq("id", parsed.data.membership_id)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (loadError || !membership) {
    return { ok: false, error: loadError?.message ?? "Usuario no encontrado" };
  }

  if (membership.role === "SUPER_ADMIN") {
    return {
      ok: false,
      error: "Los permisos del super admin no se editan (tiene acceso total)",
    };
  }

  // Solo SUPER_ADMIN puede otorgar administración de usuarios/permisos.
  let uniqueKeys = [...new Set(parsed.data.permission_keys)];
  if (!isSuperAdmin(ctx.role)) {
    const privileged = new Set([
      "configuracion.usuarios",
      "configuracion.permisos",
    ]);
    uniqueKeys = uniqueKeys.filter((k) => !privileged.has(k));
  }

  if (uniqueKeys.length === 0) {
    return {
      ok: false,
      error: "Debe asignar al menos un módulo",
    };
  }

  // Service role: evita fallos RLS en producción tras el chequeo de app.
  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? e.message
          : "Falta SUPABASE_SERVICE_ROLE_KEY en el servidor",
    };
  }

  const { error: deleteError } = await admin
    .from("user_module_permissions")
    .delete()
    .eq("membership_id", membership.id)
    .eq("organization_id", ctx.organization.id);

  if (deleteError) return { ok: false, error: deleteError.message };

  const rows = uniqueKeys.map((permission_key) => ({
    organization_id: ctx.organization.id,
    membership_id: membership.id,
    permission_key,
    created_by: ctx.userId,
    updated_by: ctx.userId,
  }));
  const { error: insertError } = await admin
    .from("user_module_permissions")
    .insert(rows);
  if (insertError) return { ok: false, error: insertError.message };

  await supabase.from("audit_logs").insert({
    organization_id: ctx.organization.id,
    user_id: ctx.userId,
    action: "UPDATE",
    entity: "user_module_permissions",
    entity_id: membership.id,
    new_values: {
      target_user_id: membership.user_id,
      permission_keys: uniqueKeys,
    },
  });

  revalidatePath("/configuracion");
  return { ok: true, id: membership.id };
}
