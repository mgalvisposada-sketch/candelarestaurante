"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  BarChart3,
  Building2,
  Calculator,
  CircleDollarSign,
  CreditCard,
  FileText,
  FolderOpen,
  Landmark,
  LayoutDashboard,
  Package,
  PieChart,
  Receipt,
  Search,
  Settings,
  Shield,
  ShoppingCart,
  Truck,
  UserCog,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { BrandLogo } from "@/components/brand/logo";
import {
  NavUnreadBadge,
  PendingActionsBell,
  usePendingActions,
} from "@/components/layout/pending-actions-inbox";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { canAccessModuleHref, firstAllowedHref } from "@/lib/permissions-catalog";
import {
  NAV_GROUPS,
  NAV_ITEMS,
  ROLE_LABELS,
  type AppRole,
  type NavItem,
} from "@/types/domain";
import { cn } from "@/lib/utils";

function pendingCountForHref(
  href: NavItem["href"],
  counts: { compras: number; personal: number; pagos: number },
) {
  if (href === "/compras") return counts.compras;
  if (href === "/personal") return counts.personal;
  if (href === "/solicitudes-pago") return counts.pagos;
  return 0;
}

/** Habilita módulos implementados (MVP 1–3). Reportes queda para MVP 4. */
const ENABLED_HREFS: Set<string> = new Set(
  NAV_ITEMS.filter((i) => i.mvp <= 3).map((i) => i.href),
);

const NAV_ICONS: Record<NavItem["href"], LucideIcon> = {
  "/inicio": LayoutDashboard,
  "/empalme": ArrowLeftRight,
  "/empresa": Building2,
  "/socios": Users,
  "/tesoreria": Wallet,
  "/proveedores": Truck,
  "/prestamos": Landmark,
  "/capital": CircleDollarSign,
  "/gastos": Receipt,
  "/solicitudes-pago": CreditCard,
  "/inventario": Package,
  "/compras": ShoppingCart,
  "/presupuesto": PieChart,
  "/personal": UserCog,
  "/tributario": Calculator,
  "/contratos": FileText,
  "/sst": Shield,
  "/documentos": FolderOpen,
  "/reportes": BarChart3,
  "/configuracion": Settings,
};

const ITEMS_BY_HREF = Object.fromEntries(
  NAV_ITEMS.map((item) => [item.href, item]),
) as Record<NavItem["href"], NavItem>;

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

type VisibleItem = {
  item: NavItem;
  enabled: boolean;
  allowed: boolean;
};

export function AppSidebar({
  pathname,
  userEmail,
  role,
  permissions = [],
}: {
  pathname: string;
  userEmail?: string | null;
  role?: AppRole | null;
  permissions?: string[];
}) {
  const [query, setQuery] = useState("");
  const isAdmin = role === "SUPER_ADMIN";
  const homeHref =
    firstAllowedHref(permissions, { isSuperAdmin: isAdmin }) ?? "/login";
  const { items: pendingItems, counts: pendingCounts, loading: pendingLoading } =
    usePendingActions(true);

  const groups = useMemo(() => {
    const q = normalizeSearch(query);

    return NAV_GROUPS.map((group) => {
      const items: VisibleItem[] = [];

      for (const href of group.hrefs) {
        const item = ITEMS_BY_HREF[href];
        const enabled = ENABLED_HREFS.has(item.href);
        const allowed =
          enabled &&
          canAccessModuleHref(permissions, item.href, {
            isSuperAdmin: isAdmin,
          });

        const haystack = normalizeSearch(
          `${item.label} ${item.hint} ${group.label}`,
        );
        const matchesQuery = !q || haystack.includes(q);

        if (!matchesQuery) continue;

        // Solo listar módulos disponibles. Los de MVP futuro aparecen
        // únicamente si la búsqueda los menciona.
        if (allowed) {
          items.push({ item, enabled: true, allowed: true });
        } else if (!enabled && q) {
          items.push({ item, enabled: false, allowed: false });
        }
      }

      return { ...group, items };
    }).filter((group) => group.items.length > 0);
  }, [permissions, isAdmin, query]);

  const totalVisible = groups.reduce((acc, g) => acc + g.items.length, 0);

  return (
    <aside className="flex w-72 shrink-0 flex-col bg-[var(--sidebar)] text-[var(--sidebar-text)]">
      <div className="border-b border-white/10 px-4 py-5">
        <Link
          href={homeHref}
          className="flex flex-col items-center gap-2.5 text-center"
        >
          <BrandLogo size="md" priority className="shrink-0 drop-shadow-sm" />
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">
            Admin
          </p>
        </Link>

        <label className="relative mt-4 block">
          <span className="sr-only">Buscar módulo</span>
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--sidebar-muted)]"
            aria-hidden
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar módulo…"
            className="w-full rounded-md border border-white/10 bg-white/5 py-2 pl-8 pr-8 text-sm text-white placeholder:text-[var(--sidebar-muted)] outline-none transition focus:border-[var(--accent)]/50 focus:bg-white/8"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--sidebar-muted)] hover:text-white"
              aria-label="Limpiar búsqueda"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </label>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-3" aria-label="Módulos">
        {totalVisible === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-[var(--sidebar-muted)]">
            No hay módulos que coincidan con “{query}”.
          </p>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => (
              <div key={group.id}>
                <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--sidebar-muted)]">
                  {group.label}
                </p>
                <ul className="space-y-0.5">
                  {group.items.map(({ item, enabled, allowed }) => {
                    const active =
                      pathname === item.href ||
                      pathname.startsWith(`${item.href}/`);
                    const Icon = NAV_ICONS[item.href];

                    const showHint = Boolean(query) || !enabled;
                    const unread = pendingCountForHref(item.href, pendingCounts);

                    return (
                      <li key={item.href}>
                        <Link
                          href={allowed ? item.href : "#"}
                          title={item.hint}
                          aria-current={active ? "page" : undefined}
                          aria-disabled={!allowed}
                          className={cn(
                            "group flex gap-2.5 rounded-md px-2.5 py-2 transition",
                            showHint ? "items-start" : "items-center",
                            active &&
                              "bg-[var(--sidebar-active)] text-white shadow-[inset_3px_0_0_0_var(--accent)]",
                            !active &&
                              allowed &&
                              "hover:bg-[var(--sidebar-hover)]",
                            !allowed && "cursor-not-allowed opacity-45",
                          )}
                          onClick={(e) => {
                            if (!allowed) e.preventDefault();
                          }}
                        >
                          <Icon
                            className={cn(
                              "size-4 shrink-0",
                              showHint && "mt-0.5",
                              active
                                ? "text-[var(--gold)]"
                                : "text-[var(--sidebar-muted)] group-hover:text-white/80",
                            )}
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm leading-tight">
                              {item.label}
                            </span>
                            {showHint ? (
                              <span
                                className={cn(
                                  "mt-0.5 block text-[11px] leading-snug",
                                  active
                                    ? "text-white/65"
                                    : "text-[var(--sidebar-muted)]",
                                )}
                              >
                                {!enabled
                                  ? `Próximamente · MVP ${item.mvp}`
                                  : item.hint}
                              </span>
                            ) : null}
                          </span>
                          <NavUnreadBadge count={unread} />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </nav>

      <div className="space-y-3 border-t border-white/10 px-3 py-4">
        <PendingActionsBell
          items={pendingItems}
          counts={pendingCounts}
          loading={pendingLoading}
        />
        {(userEmail || role) && (
          <div className="px-1 text-xs text-[var(--sidebar-muted)]">
            {userEmail ? (
              <p className="truncate text-sm text-white/90" title={userEmail}>
                {userEmail}
              </p>
            ) : null}
            {role ? (
              <p className="mt-0.5">{ROLE_LABELS[role] ?? role}</p>
            ) : null}
          </div>
        )}
        <div className="px-1">
          <SignOutButton />
        </div>
        <p className="px-1 text-[10px] text-[var(--sidebar-muted)]">
          Administración financiera · COP
        </p>
      </div>
    </aside>
  );
}
