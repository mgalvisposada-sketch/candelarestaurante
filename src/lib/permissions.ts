import { redirect } from "next/navigation";
import {
  canAccessModuleHref,
  hasPermission,
  moduleKeyFromPath,
  ROLE_DEFAULT_PERMISSIONS,
} from "@/lib/permissions-catalog";
import type { OrgContext } from "@/lib/org-context";
import { isSuperAdmin, type AppRole } from "@/types/domain";

export function permissionSet(
  keys: readonly string[] | null | undefined,
): Set<string> {
  return new Set(keys ?? []);
}

export function resolveEffectivePermissions(opts: {
  role: AppRole | null | undefined;
  storedKeys: readonly string[] | null | undefined;
}): string[] {
  if (isSuperAdmin(opts.role)) {
    return ROLE_DEFAULT_PERMISSIONS.SUPER_ADMIN;
  }
  let keys: string[];
  if (opts.storedKeys && opts.storedKeys.length > 0) {
    keys = [...opts.storedKeys];
  } else if (opts.role && ROLE_DEFAULT_PERMISSIONS[opts.role]) {
    keys = [...ROLE_DEFAULT_PERMISSIONS[opts.role]];
  } else {
    keys = [...ROLE_DEFAULT_PERMISSIONS.LECTURA];
  }
  // Inicio siempre disponible como landing seguro
  if (!keys.includes("inicio")) keys.push("inicio");
  if (!keys.includes("inicio.resumen")) keys.push("inicio.resumen");
  return keys;
}

export function ctxCanAccess(
  ctx: Pick<OrgContext, "role" | "permissions">,
  key: string,
): boolean {
  return hasPermission(ctx.permissions ?? [], key, {
    isSuperAdmin: isSuperAdmin(ctx.role),
  });
}

export function ctxCanAccessHref(
  ctx: Pick<OrgContext, "role" | "permissions">,
  href: string,
): boolean {
  return canAccessModuleHref(ctx.permissions ?? [], href, {
    isSuperAdmin: isSuperAdmin(ctx.role),
  });
}

/** Redirige a /inicio si el usuario no tiene el módulo. */
export function requireModuleAccess(
  ctx: Pick<OrgContext, "role" | "permissions"> | null,
  moduleKey: string,
): asserts ctx is NonNullable<typeof ctx> {
  if (!ctx) redirect("/login");
  if (!ctxCanAccess(ctx, moduleKey)) {
    redirect("/inicio");
  }
}

export function requirePathModuleAccess(
  ctx: Pick<OrgContext, "role" | "permissions"> | null,
  pathname: string,
): void {
  const key = moduleKeyFromPath(pathname);
  if (!key) return;
  requireModuleAccess(ctx, key);
}
