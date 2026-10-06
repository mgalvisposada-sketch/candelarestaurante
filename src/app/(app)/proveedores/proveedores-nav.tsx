"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { hasPermission } from "@/lib/permissions-catalog";
import { cn } from "@/lib/utils";

const LINKS = [
  {
    href: "/proveedores",
    label: "Proveedores",
    match: (granted: readonly string[], isSuperAdmin: boolean) =>
      [
        "proveedores.maestro",
        "proveedores.crear",
        "proveedores.editar",
        "proveedores.categorias",
      ].some((k) => hasPermission(granted, k, { isSuperAdmin })),
    active: (pathname: string) =>
      pathname === "/proveedores" || pathname === "/proveedores/",
  },
  {
    href: "/proveedores/cxp",
    label: "Cuentas por pagar",
    match: (granted: readonly string[], isSuperAdmin: boolean) =>
      [
        "proveedores.cxp",
        "proveedores.cxp.crear",
        "proveedores.cxp.editar",
        "proveedores.cxp.pagar",
      ].some((k) => hasPermission(granted, k, { isSuperAdmin })),
    active: (pathname: string) => pathname.startsWith("/proveedores/cxp"),
  },
] as const;

export function ProveedoresNav({
  permissions = [],
  isSuperAdmin = false,
}: {
  permissions?: readonly string[];
  isSuperAdmin?: boolean;
}) {
  const pathname = usePathname();
  const links = LINKS.filter((l) => l.match(permissions, isSuperAdmin));

  if (links.length <= 1) return null;

  return (
    <nav className="flex flex-wrap gap-2 border-b border-[var(--line)] pb-3">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={cn(
            "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
            l.active(pathname)
              ? "bg-[var(--ink)] text-white"
              : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]",
          )}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
