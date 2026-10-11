"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { hasPermission } from "@/lib/permissions-catalog";
import { cn } from "@/lib/utils";

/**
 * Orden = cascada de productos (inventario), y al final la acción de fabricar.
 * “Producir” no es un tipo de producto: es el batch que mueve stock entre niveles.
 */
const LINKS = [
  {
    href: "/cocina",
    label: "Cascada",
    permission: "cocina",
    active: (pathname: string) => pathname === "/cocina",
  },
  {
    href: "/cocina/insumos",
    label: "1 · Insumos",
    permission: "cocina.maestro",
    active: (pathname: string) => pathname.startsWith("/cocina/insumos"),
  },
  {
    href: "/cocina/preparaciones",
    label: "2 · Preparaciones",
    permission: "cocina.recetas",
    active: (pathname: string) => pathname.startsWith("/cocina/preparaciones"),
  },
  {
    href: "/cocina/carta",
    label: "3 · Carta",
    permission: "cocina.recetas",
    active: (pathname: string) => pathname.startsWith("/cocina/carta"),
  },
  {
    href: "/cocina/producciones",
    label: "Producir",
    permission: "cocina.produccion",
    active: (pathname: string) => pathname.startsWith("/cocina/producciones"),
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
