"use client";

import { useState, useTransition } from "react";
import {
  createEmployeeAction,
  createEmployeeContractAction,
  softDeleteEmployeeAction,
} from "./actions";
import { Badge } from "@/components/ui/primitives";
import { formatCOP } from "@/lib/money";
import { formatDateCO, todayInBogota } from "@/lib/dates";

export type EmployeeRow = {
  id: string;
  full_name: string;
  id_number: string | null;
  position_title: string | null;
  hire_date: string | null;
  employment_type: string;
  salary_or_fee: number | string | null;
  monthly_company_cost: number | string | null;
  eps: string | null;
  arl: string | null;
  is_active: boolean;
};

export type ContractRow = {
  id: string;
  employee_id: string;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
};

const inputClass =
  "w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none ring-[var(--accent)] focus:ring-2";

function daysUntil(date: string | null) {
  if (!date) return null;
  const today = todayInBogota();
  const t = new Date(`${today}T12:00:00`);
  const d = new Date(`${date}T12:00:00`);
  return Math.round((d.getTime() - t.getTime()) / (1000 * 60 * 60 * 24));
}

export function CreateEmployeeForm() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-[var(--ink)] px-4 py-2.5 text-sm font-medium text-white"
      >
        Nueva persona
      </button>
    );
  }
  return (
    <form
      className="space-y-4 rounded-xl border border-[var(--line)] bg-white p-5"
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const r = await createEmployeeAction(fd);
          if (!r.ok) setError(r.error ?? "Error");
          else setOpen(false);
        });
      }}
    >
      <div className="flex justify-between">
        <h3 className="font-medium">Personal administrativo</h3>
        <button type="button" className="text-sm text-[var(--muted)]" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-sm md:col-span-2">
          <span className="mb-1.5 block text-[var(--muted)]">Nombre</span>
          <input name="full_name" required className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Documento</span>
          <input name="id_number" className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Cargo</span>
          <input name="position_title" className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Fecha ingreso</span>
          <input type="date" name="hire_date" className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Tipo vínculo</span>
          <select name="employment_type" defaultValue="LABORAL" className={inputClass}>
            <option value="LABORAL">Laboral</option>
            <option value="PRESTACION_SERVICIOS">Prestación de servicios</option>
            <option value="TEMPORAL">Temporal</option>
            <option value="OTRO">Otro</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Salario / honorarios</span>
          <input name="salary_or_fee" className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Costo empresa / mes</span>
          <input name="monthly_company_cost" className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">EPS</span>
          <input name="eps" className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">ARL</span>
          <input name="arl" className={inputClass} />
        </label>
      </div>
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      <button type="submit" disabled={pending} className="rounded-lg bg-[var(--ink)] px-5 py-2.5 text-sm text-white">
        {pending ? "Guardando…" : "Guardar"}
      </button>
    </form>
  );
}

export function EmployeeCard({
  employee,
  contracts,
}: {
  employee: EmployeeRow;
  contracts: ContractRow[];
}) {
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const alerts = contracts
    .map((c) => ({ c, days: daysUntil(c.end_date) }))
    .filter((x) => x.days !== null && x.days <= 60);

  return (
    <article className="rounded-xl border border-[var(--line)] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-medium">{employee.full_name}</h3>
          <p className="text-sm text-[var(--muted)]">
            {employee.position_title || "Sin cargo"} · {employee.employment_type}
            {employee.hire_date ? ` · ingreso ${formatDateCO(employee.hire_date)}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Badge tone={employee.is_active ? "ok" : "neutral"}>
            {employee.is_active ? "Activo" : "Inactivo"}
          </Badge>
          {alerts.length > 0 ? <Badge tone="warn">Contrato por vencer</Badge> : null}
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 text-sm">
        <div>
          Salario/fee:{" "}
          <strong>
            {employee.salary_or_fee != null ? formatCOP(employee.salary_or_fee) : "—"}
          </strong>
        </div>
        <div>
          Costo empresa:{" "}
          <strong>
            {employee.monthly_company_cost != null
              ? formatCOP(employee.monthly_company_cost)
              : "—"}
          </strong>
        </div>
      </div>
      {contracts.length > 0 ? (
        <ul className="mt-3 space-y-1 text-sm text-[var(--muted)]">
          {contracts.map((c) => (
            <li key={c.id}>
              Contrato {c.start_date ? formatDateCO(c.start_date) : "?"} →{" "}
              {c.end_date ? formatDateCO(c.end_date) : "indefinido"}
              {daysUntil(c.end_date) !== null && (daysUntil(c.end_date) as number) <= 60
                ? ` (${daysUntil(c.end_date)} días)`
                : ""}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm"
          onClick={() => setAdding((v) => !v)}
        >
          Contrato
        </button>
        <button
          type="button"
          className="rounded-lg px-3 py-1.5 text-sm text-red-700"
          disabled={pending}
          onClick={() => {
            if (!confirm("¿Desactivar persona?")) return;
            startTransition(async () => {
              await softDeleteEmployeeAction(employee.id);
            });
          }}
        >
          Desactivar
        </button>
      </div>
      {adding ? (
        <form
          className="mt-4 grid gap-3 border-t border-[var(--line)] pt-4 md:grid-cols-2"
          action={(fd) => {
            fd.set("employee_id", employee.id);
            setError(null);
            startTransition(async () => {
              const r = await createEmployeeContractAction(fd);
              if (!r.ok) setError(r.error ?? "Error");
              else setAdding(false);
            });
          }}
        >
          <input type="hidden" name="employee_id" value={employee.id} />
          <label className="block text-sm">
            <span className="mb-1.5 block text-[var(--muted)]">Inicio</span>
            <input type="date" name="start_date" className={inputClass} />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-[var(--muted)]">Fin</span>
            <input type="date" name="end_date" className={inputClass} />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="mb-1.5 block text-[var(--muted)]">Notas</span>
            <input name="notes" className={inputClass} />
          </label>
          {error ? <p className="text-sm text-red-700 md:col-span-2">{error}</p> : null}
          <button type="submit" disabled={pending} className="rounded-lg bg-[var(--ink)] px-4 py-2 text-sm text-white md:col-span-2">
            Guardar contrato
          </button>
        </form>
      ) : null}
    </article>
  );
}
