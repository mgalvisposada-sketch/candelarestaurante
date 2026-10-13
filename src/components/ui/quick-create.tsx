"use client";

import { useId, useState, useTransition, type ReactNode } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type QuickCreateOption = { id: string; label: string };

export type QuickCreateResult =
  | { ok: true; id: string; label: string }
  | { ok: false; error: string };

const fieldClass =
  "w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] outline-none ring-[var(--accent)] focus:ring-2";

/**
 * Select con alta rápida embebida: crea el ítem sin salir del formulario padre.
 */
export function QuickCreateSelect({
  name,
  label,
  required,
  options,
  value,
  onChange,
  placeholder = "—",
  createLabel = "Crear nuevo",
  createTitle,
  hint,
  onCreate,
  children,
  className,
}: {
  name: string;
  label: string;
  required?: boolean;
  options: QuickCreateOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  createLabel?: string;
  createTitle?: string;
  hint?: ReactNode;
  onCreate: (fd: FormData) => Promise<QuickCreateResult>;
  children: ReactNode;
  className?: string;
}) {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const panelId = useId();

  return (
    <div className={cn("block text-sm", className)}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[var(--muted)]">
          {label}
          {required ? " *" : ""}
        </span>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setCreating((v) => !v);
          }}
          className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] hover:underline"
          aria-expanded={creating}
          aria-controls={panelId}
        >
          {creating ? (
            <>
              <X className="size-3.5" aria-hidden />
              Cerrar
            </>
          ) : (
            <>
              <Plus className="size-3.5" aria-hidden />
              {createLabel}
            </>
          )}
        </button>
      </div>

      <select
        name={name}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={fieldClass}
        disabled={creating}
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>

      {hint && !creating ? (
        <div className="mt-1 text-xs text-[var(--muted)]">{hint}</div>
      ) : null}

      {creating ? (
        <div
          id={panelId}
          className="mt-2 space-y-3 rounded-lg border border-dashed border-[var(--line)] bg-[var(--surface-muted)] p-3 text-[var(--ink)]"
        >
          <p className="text-xs font-medium text-[var(--ink)]">
            {createTitle ?? createLabel}
          </p>
          <div className="space-y-2">{children}</div>
          {error ? (
            <p className="rounded-md bg-[var(--accent-soft)] px-2 py-1.5 text-xs text-[var(--danger)]">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              className="rounded-lg bg-[var(--solid)] px-3 py-1.5 text-xs font-medium text-[var(--on-solid)] disabled:opacity-60"
              onClick={() => {
                const panel = document.getElementById(panelId);
                if (!panel) return;
                const fd = new FormData();
                for (const el of panel.querySelectorAll<
                  HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
                >("[data-qc-name]")) {
                  const key = el.getAttribute("data-qc-name");
                  if (!key || el.disabled) continue;
                  if (
                    el instanceof HTMLInputElement &&
                    (el.type === "checkbox" || el.type === "radio") &&
                    !el.checked
                  ) {
                    continue;
                  }
                  fd.set(key, el.value);
                }
                setError(null);
                startTransition(async () => {
                  const result = await onCreate(fd);
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  onChange(result.id);
                  setCreating(false);
                });
              }}
            >
              {pending ? "Creando…" : "Guardar y usar"}
            </button>
            <button
              type="button"
              className="text-xs text-[var(--muted)]"
              onClick={() => {
                setCreating(false);
                setError(null);
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function QuickCreateField({
  name,
  label,
  required,
  type = "text",
  placeholder,
  defaultValue,
}: {
  name: string;
  label: string;
  required?: boolean;
  type?: string;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <label className="block text-xs">
      <span className="mb-1 block text-[var(--muted)]">
        {label}
        {required ? " *" : ""}
      </span>
      <input
        data-qc-name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className={fieldClass}
        // Evita que Enter envíe el formulario padre
        onKeyDown={(e) => {
          if (e.key === "Enter") e.preventDefault();
        }}
      />
    </label>
  );
}

export function QuickCreateSelectField({
  name,
  label,
  required,
  defaultValue,
  children,
}: {
  name: string;
  label: string;
  required?: boolean;
  defaultValue?: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-xs">
      <span className="mb-1 block text-[var(--muted)]">
        {label}
        {required ? " *" : ""}
      </span>
      <select
        data-qc-name={name}
        required={required}
        defaultValue={defaultValue}
        className={fieldClass}
      >
        {children}
      </select>
    </label>
  );
}
