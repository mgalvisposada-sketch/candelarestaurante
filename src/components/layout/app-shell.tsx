"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { AsistenteWidget } from "@/components/asistente/asistente-widget";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { ROLE_LABELS, type AppRole } from "@/types/domain";
import { cn } from "@/lib/utils";

export function AppShell({
  children,
  userEmail,
  role,
  permissions,
  orgLabel,
}: {
  children: React.ReactNode;
  userEmail?: string | null;
  role?: AppRole | null;
  permissions?: string[];
  orgLabel?: string | null;
}) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!navOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [navOpen]);

  return (
    <div className="flex min-h-screen">
      <button
        type="button"
        aria-label="Cerrar menú"
        className={cn(
          "fixed inset-0 z-40 bg-[var(--overlay)] transition-opacity md:hidden print:hidden",
          navOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => setNavOpen(false)}
      />

      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] transition-transform duration-200 ease-out print:hidden md:static md:max-w-none md:translate-x-0",
          navOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
      >
        <AppSidebar
          pathname={pathname}
          userEmail={userEmail}
          role={role}
          permissions={permissions}
          onNavigate={() => setNavOpen(false)}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-[var(--line)] bg-[var(--surface)]/95 px-4 py-2.5 backdrop-blur md:hidden print:hidden">
          <button
            type="button"
            aria-label="Abrir menú"
            aria-expanded={navOpen}
            onClick={() => setNavOpen(true)}
            className="inline-flex size-10 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]"
          >
            <Menu className="size-5" aria-hidden />
          </button>
          <span className="min-w-0 flex-1 truncate font-display text-sm font-semibold tracking-tight">
            Candela Admin
          </span>
          <ThemeToggle variant="header" />
        </div>
        {children}
      </div>

      <AsistenteWidget
        orgLabel={orgLabel?.trim() || "Candela"}
        userRole={role ? ROLE_LABELS[role] : "Sin rol"}
        role={role ?? null}
        permissions={permissions ?? []}
      />
    </div>
  );
}
