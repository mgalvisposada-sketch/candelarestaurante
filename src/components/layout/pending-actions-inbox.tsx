"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  CreditCard,
  ShoppingCart,
  UserCog,
  X,
} from "lucide-react";
import { getPendingActionsAction } from "@/app/(app)/notifications/actions";
import type {
  PendingAction,
  PendingActionCounts,
  PendingActionKind,
} from "@/lib/pending-actions";
import { cn } from "@/lib/utils";

const EMPTY_COUNTS: PendingActionCounts = {
  total: 0,
  compras: 0,
  personal: 0,
  pagos: 0,
};

const KIND_META: Record<
  PendingActionKind,
  { icon: typeof Bell; tone: string; short: string }
> = {
  compra_autorizar: {
    icon: ShoppingCart,
    tone: "bg-[var(--accent)]/15 text-[var(--accent)]",
    short: "Compras",
  },
  novedad_aprobar: {
    icon: UserCog,
    tone: "bg-[var(--info)]/15 text-[var(--info)]",
    short: "Personal",
  },
  pago_aprobar: {
    icon: CreditCard,
    tone: "bg-[var(--warn)]/20 text-[var(--warn)]",
    short: "Pagos",
  },
  pago_ejecutar: {
    icon: CreditCard,
    tone: "bg-[var(--ok)]/15 text-[var(--ok)]",
    short: "Tesorería",
  },
};

function formatRelative(iso: string) {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "";
  const diffMin = Math.round((Date.now() - ts) / 60000);
  if (diffMin < 1) return "ahora";
  if (diffMin < 60) return `${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH} h`;
  const diffD = Math.round(diffH / 24);
  return `${diffD} d`;
}

export function usePendingActions(enabled = true) {
  const pathname = usePathname();
  const [items, setItems] = useState<PendingAction[]>([]);
  const [counts, setCounts] = useState<PendingActionCounts>(EMPTY_COUNTS);
  const [pending, startTransition] = useTransition();
  const mounted = useRef(true);

  const refresh = useCallback(() => {
    if (!enabled) return;
    startTransition(async () => {
      try {
        const result = await getPendingActionsAction();
        if (!mounted.current) return;
        setItems(result.items);
        setCounts(result.counts);
      } catch {
        // Silencioso: el inbox no debe romper la app.
      }
    });
  }, [enabled]);

  useEffect(() => {
    mounted.current = true;
    refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh, pathname]);

  useEffect(() => {
    if (!enabled) return;
    const onFocus = () => refresh();
    const onCustom = () => refresh();
    window.addEventListener("focus", onFocus);
    window.addEventListener("candela:pending-actions", onCustom);
    const id = window.setInterval(refresh, 45_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("candela:pending-actions", onCustom);
      window.clearInterval(id);
    };
  }, [enabled, refresh]);

  return { items, counts, refresh, loading: pending };
}

/** Llama esto tras crear/gestionar algo que afecta pendientes. */
export function notifyPendingActionsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("candela:pending-actions"));
}

export function PendingActionsBell({
  className,
  items: itemsProp,
  counts: countsProp,
  loading: loadingProp,
}: {
  className?: string;
  items?: PendingAction[];
  counts?: PendingActionCounts;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const fetched = usePendingActions(itemsProp === undefined);
  const items = itemsProp ?? fetched.items;
  const counts = countsProp ?? fetched.counts;
  const loading = loadingProp ?? fetched.loading;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const countLabel = counts.total > 99 ? "99+" : String(counts.total);

  return (
    <div className={cn("relative", className)} ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "relative flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition",
          open
            ? "bg-white/10 text-white"
            : "text-[var(--sidebar-text)] hover:bg-[var(--sidebar-hover)]",
        )}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Bell className="size-4 shrink-0 text-[var(--sidebar-muted)]" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block font-medium leading-tight">Pendientes</span>
          <span className="mt-0.5 block text-[11px] text-[var(--sidebar-muted)]">
            {counts.total === 0
              ? "Sin acciones por gestionar"
              : `${counts.total} por gestionar`}
          </span>
        </span>
        {counts.total > 0 ? (
          <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[#25D366] px-1.5 text-[11px] font-bold leading-none text-white">
            {countLabel}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Acciones pendientes"
          className="absolute bottom-full left-0 z-50 mb-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-white/10 bg-[#111] shadow-2xl shadow-black/50"
        >
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2.5">
            <div>
              <p className="text-sm font-semibold text-white">
                Acciones pendientes
              </p>
              <p className="text-[11px] text-[var(--sidebar-muted)]">
                Se mantienen hasta que las gestiones
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-1 text-[var(--sidebar-muted)] hover:bg-white/10 hover:text-white"
              aria-label="Cerrar"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-[var(--sidebar-muted)]">
                {loading
                  ? "Revisando pendientes…"
                  : "No tienes nada pendiente por gestionar."}
              </p>
            ) : (
              <ul className="divide-y divide-white/5">
                {items.map((item) => {
                  const meta = KIND_META[item.kind];
                  const Icon = meta.icon;
                  return (
                    <li key={item.id}>
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className="flex gap-3 px-3 py-3 transition hover:bg-white/5"
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full",
                            meta.tone,
                          )}
                        >
                          <Icon className="size-4" aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start justify-between gap-2">
                            <span className="text-sm font-medium text-white">
                              {item.title}
                            </span>
                            <span className="shrink-0 text-[10px] text-[var(--sidebar-muted)]">
                              {formatRelative(item.createdAt)}
                            </span>
                          </span>
                          <span className="mt-0.5 block text-[12px] leading-snug text-white/70">
                            {item.body}
                          </span>
                          <span className="mt-1 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-[var(--sidebar-muted)]">
                            {meta.short}
                            {item.urgent ? (
                              <span className="rounded bg-[#25D366]/20 px-1.5 py-0.5 font-semibold text-[#25D366]">
                                Urgente
                              </span>
                            ) : null}
                          </span>
                        </span>
                        <span
                          className="mt-1 size-2.5 shrink-0 rounded-full bg-[#25D366]"
                          aria-hidden
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Badge verde estilo WhatsApp para ítems del menú. */
export function NavUnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-[#25D366] px-1 text-[10px] font-bold leading-none text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}
