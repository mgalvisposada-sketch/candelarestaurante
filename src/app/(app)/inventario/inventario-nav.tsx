"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { hasPermission } from "@/lib/permissions-catalog";
import { cn } from "@/lib/utils";

const LINKS = [
  {
    href: "/inventario/maestro",
    label: "Maestro",
    permission: "inventario.maestro",
    active: (pathname: string) =>
      pathname.startsWith("/inventario/maestro") ||
      pathname === "/inventario",
  },
  {
    href: "/inventario/lista",
    label: "Lista / imprimir",
    permission: "inventario.maestro",
    active: (pathname: string) => pathname.startsWith("/inventario/lista"),
  },
  {
    href: "/inventario/fisico",
    label: "Inv. físico",
    permission: "inventario.fisico",
    active: (pathname: string) => pathname.startsWith("/inventario/fisico"),
  },
] as const;

export function InventarioNav({
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
