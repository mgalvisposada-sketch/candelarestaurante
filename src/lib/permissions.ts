import { redirect } from "next/navigation";
import {
  canAccessModuleHref,
  firstAllowedHref,
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
  if (opts.storedKeys && opts.storedKeys.length > 0) {
    return [...opts.storedKeys];
  }
  if (opts.role && ROLE_DEFAULT_PERMISSIONS[opts.role]) {
    return [...ROLE_DEFAULT_PERMISSIONS[opts.role]];
  }
  return [...ROLE_DEFAULT_PERMISSIONS.LECTURA];
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

export function ctxFirstAllowedHref(
  ctx: Pick<OrgContext, "role" | "permissions">,
): string | null {
  return firstAllowedHref(ctx.permissions ?? [], {
    isSuperAdmin: isSuperAdmin(ctx.role),
  });
}

/** Redirige al primer módulo permitido si el usuario no tiene acceso. */
export function requireModuleAccess(
  ctx: Pick<OrgContext, "role" | "permissions"> | null,
  moduleKey: string,
): asserts ctx is NonNullable<typeof ctx> {
  if (!ctx) redirect("/login");
  if (!ctxCanAccess(ctx, moduleKey)) {
    const fallback = ctxFirstAllowedHref(ctx);
    redirect(fallback && fallback !== `/${moduleKey}` ? fallback : "/login");
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
