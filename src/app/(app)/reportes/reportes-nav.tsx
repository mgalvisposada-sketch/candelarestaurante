"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  {
    href: "/reportes",
    label: "Informes",
    primary: true,
    active: (pathname: string) =>
      pathname === "/reportes" || pathname === "/reportes/",
  },
  {
    href: "/reportes/egresos",
    label: "Egresos ejecutivos",
    primary: false,
    active: (pathname: string) => pathname.startsWith("/reportes/egresos"),
  },
] as const;

export function ReportesNav() {
  const pathname = usePathname();

  return (
    <nav className="no-print flex flex-wrap items-center gap-2 border-b border-[var(--line)] pb-3 print:hidden">
      {LINKS.map((l) => {
        const active = l.active(pathname);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              l.primary
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
