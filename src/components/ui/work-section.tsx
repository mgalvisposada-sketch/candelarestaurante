"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown, ClipboardList, List, PenLine, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

export type WorkSectionKind = "form" | "list" | "tools";

const KIND_META: Record<
  WorkSectionKind,
  {
    eyebrow: string;
    Icon: typeof PenLine;
    rail: string;
    head: string;
  }
> = {
  form: {
    eyebrow: "Formulario",
    Icon: PenLine,
    rail: "border-l-[var(--accent)]",
    head: "bg-[var(--accent-soft)]/55",
  },
  list: {
    eyebrow: "Listado",
    Icon: List,
    rail: "border-l-[var(--ink)]/35",
    head: "bg-[var(--surface-muted)]/80",
  },
  tools: {
    eyebrow: "Herramientas",
    Icon: Wrench,
    rail: "border-l-[var(--gold)]",
    head: "bg-[var(--gold-soft)]/70",
  },
};

/**
 * Bloque colapsable para separar claramente formularios, listados y herramientas
 * en la misma página.
 */
export function WorkSection({
  kind = "list",
  title,
  description,
  badge,
  summary,
  defaultOpen,
  children,
  className,
  id,
}: {
  kind?: WorkSectionKind;
  title: string;
  description?: string;
  badge?: ReactNode;
  /** Vista compacta cuando está cerrado */
  summary?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  const meta = KIND_META[kind];
  const resolvedDefault =
    defaultOpen ?? (kind === "list" || kind === "tools");
  const [open, setOpen] = useState(resolvedDefault);
  const panelId = useId();
  const Icon = meta.Icon;

  return (
    <section
      id={id}
      className={cn(
        "overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-soft)] border-l-4",
        meta.rail,
        className,
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-start justify-between gap-3 px-4 py-3.5 text-left transition sm:px-5",
          meta.head,
          "hover:brightness-[0.98]",
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
              <Icon className="size-3.5" aria-hidden />
              {meta.eyebrow}
            </span>
            {badge}
          </div>
          <h3 className="mt-1 font-display text-lg font-semibold tracking-tight text-[var(--ink)]">
            {title}
          </h3>
          {description ? (
            <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
              {description}
            </p>
          ) : null}
          {!open && summary ? (
            <div className="mt-2 text-sm text-[var(--muted)]">{summary}</div>
          ) : null}
        </div>
        <span
          className={cn(
            "mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] transition",
            open && "rotate-180",
          )}
          aria-hidden
        >
          <ChevronDown className="size-4" />
        </span>
      </button>
      <div id={panelId} hidden={!open} className={cn(!open && "hidden")}>
        <div className="border-t border-[var(--line)] px-4 py-4 sm:px-5">
          {children}
        </div>
      </div>
    </section>
  );
}

/** Agrupa secciones de trabajo con ritmo vertical consistente. */
export function WorkStack({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("space-y-4", className)}>{children}</div>;
}

export function WorkEmptyHint({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-[var(--line)] bg-[var(--surface-muted)]/50 px-4 py-8 text-center">
      <ClipboardList
        className="mx-auto size-6 text-[var(--muted)]"
        aria-hidden
      />
      <p className="mt-2 font-medium text-[var(--ink)]">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-[var(--muted)]">
        {description}
      </p>
    </div>
  );
}
