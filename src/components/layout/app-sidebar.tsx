"use client";

import Link from "next/link";
import { BrandLogo } from "@/components/brand/logo";
import { NAV_ITEMS } from "@/types/domain";
import { cn } from "@/lib/utils";

const MVP1_HREFS: Set<string> = new Set(
  NAV_ITEMS.filter((i) => i.mvp === 1).map((i) => i.href),
);

export function AppSidebar({ pathname }: { pathname: string }) {
  return (
    <aside className="flex w-64 shrink-0 flex-col bg-[var(--sidebar)] text-[var(--sidebar-text)]">
      <div className="border-b border-white/10 px-4 py-5">
        <Link href="/inicio" className="flex items-center gap-3">
          <BrandLogo size="sm" className="shrink-0" />
          <div className="min-w-0">
            <p className="font-display text-lg font-bold tracking-tight text-white">
              Candela
            </p>
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--gold)]">
              Admin
            </p>
          </div>
        </Link>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const enabled = MVP1_HREFS.has(item.href);
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
