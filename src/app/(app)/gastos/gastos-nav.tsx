"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { hasPermission } from "@/lib/permissions-catalog";
import { cn } from "@/lib/utils";

const LINKS = [
  {
    href: "/gastos",
    label: "Registro",
    primary: true,
    match: (granted: readonly string[], isSuperAdmin: boolean) =>
      ["gastos", "gastos.registro"].some((k) =>
        hasPermission(granted, k, { isSuperAdmin }),
      ),
    active: (pathname: string) =>
      pathname === "/gastos" || pathname === "/gastos/",
  },
  {
    href: "/gastos/categorias",
    label: "Categorías",
    primary: false,
    match: (granted: readonly string[], isSuperAdmin: boolean) =>
      ["gastos", "gastos.categorias", "gastos.registro"].some((k) =>
        hasPermission(granted, k, { isSuperAdmin }),
      ),
    active: (pathname: string) => pathname.startsWith("/gastos/categorias"),
  },
] as const;

export function GastosNav({
  permissions = [],
  isSuperAdmin = false,
}: {
  permissions?: readonly string[];
  isSuperAdmin?: boolean;
}) {
  const pathname = usePathname();
  const links = LINKS.filter((l) => l.match(permissions, isSuperAdmin));

  if (links.length === 0) return null;

  return (
    <nav className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] pb-3">
      {links.map((l) => {
        const active = l.active(pathname);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              l.primary
                ? active
                  ? "bg-[var(--ink)] text-white"
                  : "border border-[var(--ink)] text-[var(--ink)] hover:bg-neutral-50"
                : active
                  ? "bg-neutral-100 text-[var(--ink)]"
                  : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]",
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
