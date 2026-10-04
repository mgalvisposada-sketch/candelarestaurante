"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { createEmployeeAction, softDeleteEmployeeAction } from "./actions";
import { Badge } from "@/components/ui/primitives";
import { formatCOP } from "@/lib/money";
import { formatDateCO } from "@/lib/dates";
import { formatTimeHm, scheduleDiffSummary } from "@/lib/payroll";
import type { PayrollScheduleInput } from "@/lib/payroll";
import { EMPLOYMENT_TYPES } from "@/validations/hr";

export type EmployeeRow = {
  id: string;
  full_name: string;
  id_number: string | null;
  email: string | null;
  phone: string | null;
  position_title: string | null;
  hire_date: string | null;
  contract_end_date: string | null;
  employment_type: string;
  basic_salary: number | string | null;
  salary_or_fee: number | string | null;
  monthly_company_cost: number | string | null;
  eps: string | null;
  arl: string | null;
  ordinary_entry_time: string | null;
  ordinary_exit_time: string | null;
  break_minutes: number | null;
  uses_custom_schedule: boolean;
  is_active: boolean;
};

const EMPLOYMENT_LABELS: Record<string, string> = {
  INDEFINIDO: "Indefinido",
  TERMINO_FIJO: "Término fijo",
  OBRA_LABOR: "Obra o labor",
  APRENDIZAJE: "Aprendizaje",
  PRESTACION_SERVICIOS: "Prestación de servicios",
  MEDIO_TIEMPO: "Medio tiempo",
  LABORAL: "Laboral",
  TEMPORAL: "Temporal",
  OTRO: "Otro",
};

const inputClass =
  "w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none ring-[var(--accent)] focus:ring-2";

export type JobPositionOption = {
  id: string;
  name: string;
  arl_risk_level: string;
};

export function CreateEmployeeForm({
  positions = [],
}: {
  positions?: JobPositionOption[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [arl, setArl] = useState("I");
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-[var(--ink)] px-4 py-2.5 text-sm font-medium text-white"
      >
        Nuevo empleado
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
        <h3 className="font-medium">Nuevo empleado</h3>
        <button
          type="button"
          className="text-sm text-[var(--muted)]"
          onClick={() => setOpen(false)}
        >
          Cancelar
        </button>
      </div>
      <p className="text-sm text-[var(--muted)]">
        Hereda el Horario Candela vigente. Puede personalizarlo en su carpeta.
      </p>
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
          <span className="mb-1.5 block text-[var(--muted)]">Cargo Candela</span>
          <select
            name="position_id"
            className={inputClass}
            defaultValue=""
            onChange={(e) => {
              const pos = positions.find((p) => p.id === e.target.value);
              if (pos) setArl(pos.arl_risk_level);
            }}
          >
            <option value="">Sin cargo maestro…</option>
            {positions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} (ARL {p.arl_risk_level})
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Cargo (texto)</span>
          <input name="position_title" className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Email</span>
          <input name="email" type="email" className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Teléfono</span>
          <input name="phone" className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Fecha ingreso</span>
          <input type="date" name="hire_date" className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Fin de contrato</span>
          <input type="date" name="contract_end_date" className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Tipo de contrato</span>
          <select name="employment_type" defaultValue="INDEFINIDO" className={inputClass}>
            {EMPLOYMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {EMPLOYMENT_LABELS[t] ?? t}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Salario básico</span>
          <input name="basic_salary" required className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Nivel riesgo ARL</span>
          <select
            name="arl_risk_level"
            value={arl}
            onChange={(e) => setArl(e.target.value)}
            className={inputClass}
          >
            {["I", "II", "III", "IV", "V"].map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Auxilio transporte</span>
          <select name="receives_transport_aid" defaultValue="auto" className={inputClass}>
            <option value="auto">Automático (≤ 2 SMMLV)</option>
            <option value="true">Sí</option>
            <option value="false">No</option>
          </select>
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
      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[var(--ink)] px-5 py-2.5 text-sm text-white"
      >
        {pending ? "Guardando…" : "Guardar"}
      </button>
    </form>
  );
}

export function EmployeeCard({
  employee,
  candelaSchedule,
}: {
  employee: EmployeeRow;
  candelaSchedule: PayrollScheduleInput | null;
}) {
  const [pending, startTransition] = useTransition();
  const salary = employee.basic_salary ?? employee.salary_or_fee;
  const custom = employee.uses_custom_schedule;
  const diff =
    custom && candelaSchedule
      ? scheduleDiffSummary(
          {
            ordinary_entry_time: employee.ordinary_entry_time ?? "10:00",
            ordinary_exit_time: employee.ordinary_exit_time ?? "22:00",
            break_minutes: employee.break_minutes ?? 0,
            uses_custom_schedule: true,
          },
          candelaSchedule,
        )
      : null;

  return (
    <article className="rounded-xl border border-[var(--line)] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-medium">
            <Link
              href={`/personal/${employee.id}`}
              className="hover:text-[var(--accent)]"
            >
              {employee.full_name}
            </Link>
          </h3>
          <p className="text-sm text-[var(--muted)]">
            {employee.position_title || "Sin cargo"} ·{" "}
            {EMPLOYMENT_LABELS[employee.employment_type] ??
              employee.employment_type}
            {employee.hire_date
              ? ` · ingreso ${formatDateCO(employee.hire_date)}`
              : ""}
            {employee.contract_end_date
              ? ` · hasta ${formatDateCO(employee.contract_end_date)}`
              : ""}
          </p>
          {(employee.email || employee.phone) && (
            <p className="mt-1 text-sm text-[var(--muted)]">
              {[employee.email, employee.phone].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={employee.is_active ? "ok" : "neutral"}>
            {employee.is_active ? "Activo" : "Inactivo"}
          </Badge>
          {custom ? <Badge tone="info">Horario personalizado</Badge> : null}
        </div>
      </div>

      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          Salario básico:{" "}
          <strong>{salary != null ? formatCOP(salary) : "—"}</strong>
        </div>
        <div>
          Turno:{" "}
          <strong>
            {formatTimeHm(employee.ordinary_entry_time)} –{" "}
            {formatTimeHm(employee.ordinary_exit_time)}
          </strong>
          {employee.break_minutes
            ? ` · descanso ${employee.break_minutes} min`
            : ""}
        </div>
      </div>

      {diff ? (
        <p className="mt-2 text-xs text-[var(--muted)]" title={diff}>
          Cambia frente al general: {diff}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={`/personal/${employee.id}`}
          className="rounded-lg bg-[var(--ink)] px-3 py-1.5 text-sm text-white"
        >
          Abrir carpeta
        </Link>
        <button
          type="button"
          className="rounded-lg px-3 py-1.5 text-sm text-red-700"
          disabled={pending}
          onClick={() => {
            if (!confirm("¿Desactivar empleado?")) return;
            startTransition(async () => {
              await softDeleteEmployeeAction(employee.id);
            });
          }}
        >
          Desactivar
        </button>
      </div>
    </article>
  );
}
