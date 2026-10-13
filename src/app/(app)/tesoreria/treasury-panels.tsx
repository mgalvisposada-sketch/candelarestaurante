"use client";

import { useState, type ReactNode } from "react";
import { WorkSection } from "@/components/ui/work-section";
import { cn } from "@/lib/utils";

export function TreasuryViewSwitch({
  defaultView,
  showCaja,
  cajaLabel = "Caja del día",
  cuentasLabel = "Cuentas",
  cajaHint,
  cuentasHint,
  caja,
  cuentas,
}: {
  defaultView: "caja" | "cuentas";
  showCaja: boolean;
  cajaLabel?: string;
  cuentasLabel?: string;
  cajaHint?: string;
  cuentasHint?: string;
  caja: ReactNode;
  cuentas: ReactNode;
}) {
  const [view, setView] = useState<"caja" | "cuentas">(
    showCaja ? defaultView : "cuentas",
  );
  const active = showCaja ? view : "cuentas";

  return (
    <div className="space-y-6">
      {showCaja ? (
        <div
          role="tablist"
          aria-label="Secciones de tesorería"
          className="flex flex-wrap gap-1 rounded-xl border border-[var(--line)] bg-[var(--surface-muted)]/80 p-1"
        >
          <ViewTab
            active={active === "caja"}
            onClick={() => setView("caja")}
            label={cajaLabel}
            hint={cajaHint}
          />
          <ViewTab
            active={active === "cuentas"}
            onClick={() => setView("cuentas")}
            label={cuentasLabel}
            hint={cuentasHint}
          />
        </div>
      ) : null}

      {showCaja ? (
        <div
          role="tabpanel"
          hidden={active !== "caja"}
          className={cn(active !== "caja" && "hidden")}
        >
          {caja}
        </div>
      ) : null}

      <div
        role="tabpanel"
        hidden={active !== "cuentas"}
        className={cn(active !== "cuentas" && "hidden")}
      >
        {cuentas}
      </div>
    </div>
  );
}

function ViewTab({
  active,
  onClick,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "min-w-[10rem] flex-1 rounded-lg px-4 py-2.5 text-left transition",
        active
          ? "bg-[var(--surface)] text-[var(--ink)] shadow-sm ring-1 ring-[var(--line)]"
          : "text-[var(--muted)] hover:text-[var(--ink)]",
      )}
    >
      <span className="block text-sm font-semibold">{label}</span>
      {hint ? (
        <span className="mt-0.5 block text-xs text-[var(--muted)]">{hint}</span>
      ) : null}
    </button>
  );
}

/** Compat: paneles de tesorería usan la primitiva compartida. */
export function CollapsiblePanel({
  title,
  description,
  summary,
  badge,
  defaultOpen = false,
  children,
  className,
}: {
  title: string;
  description?: string;
  summary?: ReactNode;
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <WorkSection
      kind="tools"
      title={title}
      description={description}
      summary={summary}
      badge={badge}
      defaultOpen={defaultOpen}
      className={className}
    >
      {children}
    </WorkSection>
  );
}

export function FormStep({
  step,
  title,
  hint,
  summary,
  open,
  onOpen,
  children,
  done,
}: {
  step: number;
  title: string;
  hint?: string;
  summary?: ReactNode;
  open: boolean;
  onOpen: () => void;
  children: ReactNode;
  done?: boolean;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border",
        open
          ? "border-[var(--ink)]/20 bg-white shadow-[0_1px_0_rgba(18,18,18,0.03)]"
          : "border-[var(--line)] bg-slate-50/40",
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={onOpen}
        className="flex w-full items-start gap-3 px-4 py-3.5 text-left"
      >
        <span
          className={cn(
            "mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
            done
              ? "bg-emerald-600 text-white"
              : open
                ? "bg-[var(--ink)] text-white"
                : "bg-white text-[var(--muted)] ring-1 ring-[var(--line)]",
          )}
        >
          {done && !open ? "✓" : step}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-display text-base font-semibold">{title}</span>
            <Chevron open={open} className="mt-0.5" />
          </div>
          {hint && open ? (
            <p className="mt-1 text-sm text-[var(--muted)]">{hint}</p>
          ) : null}
          {!open && summary ? (
            <div className="mt-1 text-sm text-[var(--muted)]">{summary}</div>
          ) : null}
        </div>
      </button>
      <div className={cn("border-t border-[var(--line)] px-4 py-4", !open && "hidden")}>
        {children}
      </div>
    </div>
  );
}

function Chevron({ open, className }: { open: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      className={cn(
        "h-5 w-5 shrink-0 text-[var(--muted)] transition-transform",
        open && "rotate-180",
        className,
      )}
    >
      <path
        d="M5 7.5 10 12.5 15 7.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
