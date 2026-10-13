"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { hasPermission } from "@/lib/permissions-catalog";
import { cn } from "@/lib/utils";

const LINKS = [
  {
    href: "/compras/solicitudes",
    label: "Solicitudes",
    permission: "compras.solicitudes",
    active: (pathname: string) =>
      pathname.startsWith("/compras/solicitudes") || pathname === "/compras",
  },
  {
    href: "/compras/sugeridos",
    label: "Sugeridos",
    permission: "compras.sugeridos",
    active: (pathname: string) => pathname.startsWith("/compras/sugeridos"),
  },
  {
    href: "/compras/proveedores",
    label: "Proveedores",
    permission: "compras.proveedores",
    active: (pathname: string) => pathname.startsWith("/compras/proveedores"),
  },
] as const;

export function ComprasNav({
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
              ? "bg-[var(--solid)] text-[var(--on-solid)]"
              : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]",
          )}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
