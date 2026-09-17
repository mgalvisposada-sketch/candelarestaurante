"use client";

import Link from "next/link";
import { BrandLogo } from "@/components/brand/logo";
import { NAV_ITEMS } from "@/types/domain";
import { cn } from "@/lib/utils";

/** Habilita módulos implementados (MVP 1–3). Reportes queda para MVP 4. */
const ENABLED_HREFS: Set<string> = new Set(
  NAV_ITEMS.filter((i) => i.mvp <= 3).map((i) => i.href),
);

export function AppSidebar({ pathname }: { pathname: string }) {
  return (
    <aside className="flex w-64 shrink-0 flex-col bg-[var(--sidebar)] text-[var(--sidebar-text)]">
      <div className="border-b border-white/10 px-4 py-5">
        <Link
          href="/inicio"
          className="flex flex-col items-center gap-2.5 text-center"
        >
          <BrandLogo size="md" priority className="shrink-0 drop-shadow-sm" />
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">
            Admin
          </p>
        </Link>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const enabled = ENABLED_HREFS.has(item.href);
          return (
            <Link
              key={item.href}
              href={enabled ? item.href : "#"}
              aria-disabled={!enabled}
              className={cn(
                "flex items-center justify-between rounded-md px-3 py-2 text-sm transition",
                active &&
                  "bg-[var(--sidebar-active)] text-white shadow-[inset_3px_0_0_0_var(--accent)]",
                !active && enabled && "hover:bg-[var(--sidebar-hover)]",
                !enabled && "cursor-not-allowed opacity-40",
              )}
              onClick={(e) => {
                if (!enabled) e.preventDefault();
              }}
            >
              <span>{item.label}</span>
              {!enabled && (
                <span className="text-[10px] text-[var(--sidebar-muted)]">
                  MVP {item.mvp}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-white/10 px-5 py-4 text-xs text-[var(--sidebar-muted)]">
        Administración financiera · COP
      </div>
    </aside>
  );
}
