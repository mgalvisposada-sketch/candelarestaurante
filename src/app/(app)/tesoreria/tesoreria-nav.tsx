"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { hasPermission } from "@/lib/permissions-catalog";
import { cn } from "@/lib/utils";

const LINKS = [
  {
    href: "/tesoreria",
    label: "Liquidez y cuentas",
    primary: true,
    match: (granted: readonly string[], isSuperAdmin: boolean) =>
      [
        "tesoreria.cuentas",
        "tesoreria.saldos",
        "tesoreria.caja",
        "tesoreria.caja.avalar",
      ].some((k) => hasPermission(granted, k, { isSuperAdmin })),
    active: (pathname: string) =>
      pathname === "/tesoreria" || pathname === "/tesoreria/",
  },
  {
    href: "/tesoreria/pagos",
    label: "Historial de pagos",
    primary: false,
    match: (granted: readonly string[], isSuperAdmin: boolean) =>
      hasPermission(granted, "tesoreria.pagos", { isSuperAdmin }) ||
      [
        "tesoreria.cuentas",
        "tesoreria.caja",
        "solicitudes-pago.pagar",
      ].some((k) => hasPermission(granted, k, { isSuperAdmin })),
    active: (pathname: string) => pathname.startsWith("/tesoreria/pagos"),
  },
] as const;

export function TesoreriaNav({
  permissions = [],
  isSuperAdmin = false,
}: {
  permissions?: readonly string[];
  isSuperAdmin?: boolean;
}) {
  const pathname = usePathname();
  const links = LINKS.filter((l) => l.match(permissions, isSuperAdmin));

  if (links.length <= 1) {
    const only = links[0];
    if (!only || only.active(pathname)) return null;
  }

  if (links.length === 0) return null;

  const hasLiquidity = links.some((l) => l.href === "/tesoreria");

  return (
    <nav className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] pb-3">
      {links.map((l) => {
        const active = l.active(pathname);
        const treatPrimary = l.primary && hasLiquidity;
        return (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              treatPrimary
                ? active
                  ? "bg-[var(--solid)] text-[var(--on-solid)]"
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
