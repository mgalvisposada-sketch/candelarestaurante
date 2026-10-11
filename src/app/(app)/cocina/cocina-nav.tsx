"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { hasPermission } from "@/lib/permissions-catalog";
import { cn } from "@/lib/utils";

const LINKS = [
  {
    href: "/cocina",
    label: "Resumen",
    permission: "cocina",
    active: (pathname: string) => pathname === "/cocina",
  },
  {
    href: "/cocina/insumos",
    label: "Insumos preparación",
    permission: "cocina.maestro",
    active: (pathname: string) => pathname.startsWith("/cocina/insumos"),
  },
  {
    href: "/cocina/producciones",
    label: "Producciones",
    permission: "cocina.produccion",
    active: (pathname: string) => pathname.startsWith("/cocina/producciones"),
  },
  {
    href: "/cocina/preparaciones",
    label: "Preparaciones",
    permission: "cocina.recetas",
    active: (pathname: string) => pathname.startsWith("/cocina/preparaciones"),
  },
  {
    href: "/cocina/carta",
    label: "Carta",
    permission: "cocina.recetas",
    active: (pathname: string) => pathname.startsWith("/cocina/carta"),
  },
] as const;

export function CocinaNav({
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
