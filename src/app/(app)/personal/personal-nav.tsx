"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { hasPermission } from "@/lib/permissions-catalog";
import { cn } from "@/lib/utils";

const LINKS = [
  {
    href: "/personal",
    label: "Empleados",
    permission: "personal.empleados",
    active: (pathname: string) =>
      pathname === "/personal" ||
      (/^\/personal\/[^/]+$/.test(pathname) &&
        !pathname.startsWith("/personal/novedades") &&
        !pathname.startsWith("/personal/liquidacion") &&
        !pathname.startsWith("/personal/parametros")),
  },
  {
    href: "/personal/novedades",
    label: "Novedades",
    permission: "personal.novedades",
    active: (pathname: string) => pathname.startsWith("/personal/novedades"),
  },
  {
    href: "/personal/liquidacion",
    label: "Liquidación",
    permission: "personal.liquidacion",
    active: (pathname: string) => pathname.startsWith("/personal/liquidacion"),
  },
  {
    href: "/personal/parametros",
    label: "Parámetros",
    permission: "personal.parametros",
    active: (pathname: string) => pathname.startsWith("/personal/parametros"),
  },
] as const;

export function PersonalNav({
  permissions = [],
  isSuperAdmin = false,
}: {
  permissions?: readonly string[];
  isSuperAdmin?: boolean;
}) {
  const pathname = usePathname();
  const links = LINKS.filter((l) =>
    hasPermission(permissions, l.permission, { isSuperAdmin }),
  );

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
