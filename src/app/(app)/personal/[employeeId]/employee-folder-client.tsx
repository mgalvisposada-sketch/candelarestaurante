"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  createEmployeeBonusAction,
  softDeleteEmployeeBonusAction,
  updateEmployeeAction,
  updateEmployeeScheduleAction,
} from "../actions";
import { Badge } from "@/components/ui/primitives";
import { formatCOP } from "@/lib/money";
import { formatTimeHm, scheduleDiffSummary, simulateBiweekly } from "@/lib/payroll";
import type {
  BiweeklySimulation,
  LegalParamsInput,
  PayrollScheduleInput,
} from "@/lib/payroll";
import { EMPLOYMENT_TYPES } from "@/validations/hr";
import { isIndefiniteContract } from "@/lib/hr-documents";
import {
  EmployeeDocumentsSection,
  EmployeeVacationsSection,
  type EmployeeDocRow,
  type VacationRow,
} from "./employee-hr-panel";

const inputClass =
  "w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none ring-[var(--accent)] focus:ring-2";

const EMPLOYMENT_LABELS: Record<string, string> = {
  INDEFINIDO: "Indefinido",
  TERMINO_FIJO: "Término fijo",
  OBRA_LABOR: "Obra o labor",
  APRENDIZAJE: "Aprendizaje",
  PRESTACION_SERVICIOS: "Prestación de servicios",
  MEDIO_TIEMPO: "Medio tiempo",
};

export type FolderEmployee = {
  id: string;
  full_name: string;
  id_number: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  position_id: string | null;
  position_title: string | null;
  hire_date: string | null;
  contract_end_date: string | null;
  employment_type: string;
  basic_salary: number | string | null;
  salary_or_fee: number | string | null;
  monthly_company_cost: number | string | null;
  receives_transport_aid: boolean | null;
  arl_risk_level: "I" | "II" | "III" | "IV" | "V";
  eps: string | null;
  pension_fund: string | null;
  arl: string | null;
  compensation_fund: string | null;
  ordinary_entry_time: string | null;
  ordinary_exit_time: string | null;
  break_minutes: number | null;
  uses_custom_schedule: boolean;
  is_active: boolean;
};

export type BonusRow = {
  id: string;
  bonus_type: "FIJA" | "POR_META";
  name: string;
  amount: number | string | null;
  percent_of_salary: number | string | null;
  description: string | null;
  is_active: boolean;
};

function Line({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-[var(--muted)]">{label}</span>
      <span className="font-medium tabular-nums">{formatCOP(value)}</span>
    </div>
  );
}

export function EmployeeFolderClient({
  employee,
  bonuses,
  candelaSchedule,
  legal,
  positions = [],
  documents = [],
  vacations = [],
}: {
  employee: FolderEmployee;
  bonuses: BonusRow[];
  candelaSchedule: PayrollScheduleInput;
  legal: LegalParamsInput;
  positions?: Array<{ id: string; name: string; arl_risk_level: string }>;
  documents?: EmployeeDocRow[];
  vacations?: VacationRow[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [custom, setCustom] = useState(employee.uses_custom_schedule);
  const [employmentType, setEmploymentType] = useState(employee.employment_type);
  const indefinite = isIndefiniteContract(employmentType);

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [half, setHalf] = useState<1 | 2>(now.getDate() <= 15 ? 1 : 2);

  const salary = Number(employee.basic_salary ?? employee.salary_or_fee ?? 0);

  const simulation: BiweeklySimulation | null = useMemo(() => {
    if (!salary || !legal.smmlv) return null;
    return simulateBiweekly({
      year,
      month,
      half,
      basicSalary: salary,
      employmentType: employee.employment_type as never,
      receivesTransportAid: employee.receives_transport_aid,
      arlRiskLevel: employee.arl_risk_level,
      schedule: {
        ordinary_entry_time:
          employee.ordinary_entry_time ?? candelaSchedule.ordinary_entry_time,
        ordinary_exit_time:
          employee.ordinary_exit_time ?? candelaSchedule.ordinary_exit_time,
        break_minutes:
          employee.break_minutes ?? candelaSchedule.break_minutes,
        uses_custom_schedule: employee.uses_custom_schedule,
      },
      candelaSchedule,
      legal,
      bonuses: bonuses.map((b) => ({
        bonus_type: b.bonus_type,
        name: b.name,
        amount: b.amount != null ? Number(b.amount) : null,
        percent_of_salary:
          b.percent_of_salary != null ? Number(b.percent_of_salary) : null,
        is_active: b.is_active,
      })),
      includeGoalBonuses: true,
    });
  }, [employee, bonuses, candelaSchedule, legal, year, month, half, salary]);

  const diff = scheduleDiffSummary(
    {
      ordinary_entry_time:
        employee.ordinary_entry_time ?? candelaSchedule.ordinary_entry_time,
      ordinary_exit_time:
        employee.ordinary_exit_time ?? candelaSchedule.ordinary_exit_time,
      break_minutes: employee.break_minutes ?? candelaSchedule.break_minutes,
      uses_custom_schedule: employee.uses_custom_schedule,
    },
    candelaSchedule,
  );

  const transportDefault =
    employee.receives_transport_aid === null
      ? "auto"
      : employee.receives_transport_aid
        ? "true"
        : "false";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/personal" className="text-sm text-[var(--muted)] hover:text-[var(--ink)]">
            ← Empleados
          </Link>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
            {employee.full_name}
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {employee.position_title || "Sin cargo"} ·{" "}
            {EMPLOYMENT_LABELS[employee.employment_type] ??
              employee.employment_type}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={employee.is_active ? "ok" : "neutral"}>
            {employee.is_active ? "Activo" : "Inactivo"}
          </Badge>
          {employee.uses_custom_schedule ? (
            <Badge tone="info">Horario personalizado</Badge>
          ) : (
            <Badge tone="neutral">Horario Candela</Badge>
          )}
        </div>
      </div>

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}
      {ok ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{ok}</p>
      ) : null}

      {/* Datos y contrato */}
      <section className="space-y-4 rounded-xl border border-[var(--line)] bg-white p-5">
        <h2 className="font-medium">Datos y contrato</h2>
        <form
          className="grid gap-3 md:grid-cols-2"
          action={(fd) => {
            setError(null);
            setOk(null);
            startTransition(async () => {
              const r = await updateEmployeeAction(employee.id, fd);
              if (!r.ok) setError(r.error ?? "Error");
              else setOk("Empleado actualizado");
            });
          }}
        >
          <label className="block text-sm md:col-span-2">
            <span className="mb-1.5 block text-[var(--muted)]">Nombre</span>
            <input name="full_name" required defaultValue={employee.full_name} className={inputClass} />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-[var(--muted)]">Documento</span>
            <input name="id_number" defaultValue={employee.id_number ?? ""} className={inputClass} />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-[var(--muted)]">Cargo Candela</span>
            <select
              name="position_id"
              defaultValue={employee.position_id ?? ""}
              className={inputClass}
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
            <input name="position_title" defaultValue={employee.position_title ?? ""} className={inputClass} />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-[var(--muted)]">Email</span>
            <input name="email" type="email" defaultValue={employee.email ?? ""} className={inputClass} />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-[var(--muted)]">Teléfono</span>
            <input name="phone" defaultValue={employee.phone ?? ""} className={inputClass} />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="mb-1.5 block text-[var(--muted)]">Dirección</span>
            <input name="address" defaultValue={employee.address ?? ""} className={inputClass} />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-[var(--muted)]">Ingreso</span>
            <input type="date" name="hire_date" defaultValue={employee.hire_date ?? ""} className={inputClass} />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-[var(--muted)]">Tipo de contrato</span>
            <select
              name="employment_type"
              value={employmentType}
              onChange={(e) => setEmploymentType(e.target.value)}
              className={inputClass}
            >
              {EMPLOYMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {EMPLOYMENT_LABELS[t] ?? t}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-[var(--muted)]">Fin de contrato</span>
            <input
              type="date"
              name="contract_end_date"
              disabled={indefinite}
              defaultValue={
                indefinite ? "" : (employee.contract_end_date ?? "")
              }
              className={inputClass}
            />
            {indefinite ? (
              <span className="mt-1 block text-xs text-[var(--muted)]">
                Contrato indefinido: no lleva fecha de terminación.
              </span>
            ) : (
              <span className="mt-1 block text-xs text-[var(--muted)]">
                Obligatoria en término fijo, obra/labor o aprendizaje.
              </span>
            )}
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-[var(--muted)]">Salario básico</span>
            <input name="basic_salary" defaultValue={salary || ""} className={inputClass} />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-[var(--muted)]">Auxilio transporte</span>
            <select name="receives_transport_aid" defaultValue={transportDefault} className={inputClass}>
              <option value="auto">Automático (≤ 2 SMMLV)</option>
              <option value="true">Sí</option>
              <option value="false">No</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-[var(--muted)]">Nivel ARL</span>
            <select name="arl_risk_level" defaultValue={employee.arl_risk_level} className={inputClass}>
              {["I", "II", "III", "IV", "V"].map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-[var(--muted)]">EPS</span>
            <input name="eps" defaultValue={employee.eps ?? ""} className={inputClass} />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-[var(--muted)]">Fondo de pensión</span>
            <input name="pension_fund" defaultValue={employee.pension_fund ?? ""} className={inputClass} />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-[var(--muted)]">ARL</span>
            <input name="arl" defaultValue={employee.arl ?? ""} className={inputClass} />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-[var(--muted)]">Caja de compensación</span>
            <input name="compensation_fund" defaultValue={employee.compensation_fund ?? ""} className={inputClass} />
          </label>
          <input type="hidden" name="is_active" value={employee.is_active ? "true" : "false"} />
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-[var(--ink)] px-4 py-2 text-sm text-white md:col-span-2"
          >
            {pending ? "Guardando…" : "Guardar datos"}
          </button>
        </form>
      </section>

      <EmployeeDocumentsSection
        employeeId={employee.id}
        documents={documents}
      />

      <EmployeeVacationsSection
        employeeId={employee.id}
        vacations={vacations}
        hireDate={employee.hire_date}
        employmentType={employmentType}
        contractEndDate={indefinite ? null : employee.contract_end_date}
        basicSalary={salary}
        workdays={{
          monday: candelaSchedule.works_monday,
          tuesday: candelaSchedule.works_tuesday,
          wednesday: candelaSchedule.works_wednesday,
          thursday: candelaSchedule.works_thursday,
          friday: candelaSchedule.works_friday,
          saturday: candelaSchedule.works_saturday,
          sunday: candelaSchedule.works_sunday,
        }}
      />

      {/* Horario */}
      <section className="space-y-4 rounded-xl border border-[var(--line)] bg-white p-5">
        <div>
          <h2 className="font-medium">Horario</h2>
          {diff ? (
            <p className="mt-1 text-sm text-[var(--muted)]">
              Diferencias vs Horario Candela: {diff}
            </p>
          ) : (
            <p className="mt-1 text-sm text-[var(--muted)]">
              Usa la plantilla Candela (
              {formatTimeHm(candelaSchedule.ordinary_entry_time)} –{" "}
              {formatTimeHm(candelaSchedule.ordinary_exit_time)}, descanso{" "}
              {candelaSchedule.break_minutes} min).
            </p>
          )}
        </div>
        <form
          className="grid gap-3 md:grid-cols-2"
          action={(fd) => {
            fd.set("employee_id", employee.id);
            fd.set("uses_custom_schedule", custom ? "true" : "false");
            setError(null);
            setOk(null);
            startTransition(async () => {
              const r = await updateEmployeeScheduleAction(fd);
              if (!r.ok) setError(r.error ?? "Error");
              else setOk("Horario actualizado");
            });
          }}
        >
          <input type="hidden" name="employee_id" value={employee.id} />
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input
              type="checkbox"
              checked={custom}
              onChange={(e) => setCustom(e.target.checked)}
            />
            Usar horario personalizado (diferente al Candela)
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-[var(--muted)]">Entrada</span>
            <input
              type="time"
              name="ordinary_entry_time"
              disabled={!custom}
              defaultValue={formatTimeHm(
                employee.ordinary_entry_time ??
                  candelaSchedule.ordinary_entry_time,
              )}
              className={inputClass}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-[var(--muted)]">Salida</span>
            <input
              type="time"
              name="ordinary_exit_time"
              disabled={!custom}
              defaultValue={formatTimeHm(
                employee.ordinary_exit_time ??
                  candelaSchedule.ordinary_exit_time,
              )}
              className={inputClass}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-[var(--muted)]">Descanso (min)</span>
            <input
              type="number"
              name="break_minutes"
              disabled={!custom}
              defaultValue={
                employee.break_minutes ?? candelaSchedule.break_minutes
              }
              className={inputClass}
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-[var(--ink)] px-4 py-2 text-sm text-white md:col-span-2"
          >
            Guardar horario
          </button>
        </form>
      </section>

      {/* Bonos */}
      <section className="space-y-4 rounded-xl border border-[var(--line)] bg-white p-5">
        <h2 className="font-medium">Bonificaciones</h2>
        {bonuses.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Sin bonificaciones activas.</p>
        ) : (
          <ul className="space-y-2">
            {bonuses.map((b) => (
              <li
                key={b.id}
                className="flex flex-wrap items-start justify-between gap-2 border-b border-[var(--line)] pb-2 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {b.name}{" "}
                    <span className="text-[var(--muted)]">
                      ({b.bonus_type === "FIJA" ? "Fija" : "Por meta"})
                    </span>
                  </p>
                  <p className="text-[var(--muted)]">
                    {b.amount != null
                      ? formatCOP(b.amount)
                      : `${b.percent_of_salary}% del salario`}
                    {b.description ? ` — ${b.description}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  className="text-red-700"
                  disabled={pending}
                  onClick={() => {
                    startTransition(async () => {
                      await softDeleteEmployeeBonusAction(b.id, employee.id);
                    });
                  }}
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="grid gap-3 border-t border-[var(--line)] pt-4 md:grid-cols-2"
          action={(fd) => {
            fd.set("employee_id", employee.id);
            setError(null);
            setOk(null);
            startTransition(async () => {
              const r = await createEmployeeBonusAction(fd);
              if (!r.ok) setError(r.error ?? "Error");
              else setOk("Bonificación agregada");
            });
          }}
        >
          <input type="hidden" name="employee_id" value={employee.id} />
          <label className="block text-sm">
            <span className="mb-1.5 block text-[var(--muted)]">Nombre</span>
            <input name="name" required className={inputClass} />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-[var(--muted)]">Tipo</span>
            <select name="bonus_type" defaultValue="FIJA" className={inputClass}>
              <option value="FIJA">Fija</option>
              <option value="POR_META">Por cumplimiento de metas</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-[var(--muted)]">Monto mensual</span>
            <input name="amount" className={inputClass} />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-[var(--muted)]">% del salario</span>
            <input name="percent_of_salary" className={inputClass} />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="mb-1.5 block text-[var(--muted)]">Por qué / condiciones</span>
            <input name="description" className={inputClass} />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-[var(--ink)] px-4 py-2 text-sm text-white md:col-span-2"
          >
            Agregar bonificación
          </button>
        </form>
      </section>

      {/* Simulación */}
      <section className="space-y-4 rounded-xl border border-[var(--line)] bg-white p-5">
        <div>
          <h2 className="font-medium">Simulación liquidación quincenal</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Ordinaria según horario y parámetros legales. Aún no incluye novedades
            de turno.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-[var(--muted)]">Año</span>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className={inputClass}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-[var(--muted)]">Mes</span>
            <input
              type="number"
              min={1}
              max={12}
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className={inputClass}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-[var(--muted)]">Quincena</span>
            <select
              value={half}
              onChange={(e) => setHalf(Number(e.target.value) as 1 | 2)}
              className={inputClass}
            >
              <option value={1}>1ª (1–15)</option>
              <option value={2}>2ª (16–fin)</option>
            </select>
          </label>
        </div>

        {!simulation ? (
          <p className="text-sm text-[var(--muted)]">
            Defina salario básico y parámetros legales para simular.
          </p>
        ) : (
          <div className="space-y-5">
            <p className="text-sm">
              <strong>{simulation.periodLabel}</strong> ·{" "}
              {simulation.periodStart} → {simulation.periodEnd} ·{" "}
              {simulation.hours.workedDays} días laborables · hora ordinaria{" "}
              {formatCOP(simulation.ordinaryHourValue)}
            </p>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <h3 className="text-sm font-medium uppercase tracking-wide text-[var(--muted)]">
                  Devengos
                </h3>
                <Line label="Salario básico quincenal" value={simulation.earnings.basicSalary} />
                <Line label="Recargo nocturno" value={simulation.earnings.nightSurcharge} />
                <Line label="Recargo dominical" value={simulation.earnings.sundaySurcharge} />
                <Line label="Bonos fijos" value={simulation.earnings.fixedBonuses} />
                <Line label="Bonos por meta (est.)" value={simulation.earnings.goalBonuses} />
                <Line label="Horas extra" value={simulation.earnings.overtime} />
                <Line label="Bonos ocasionales" value={simulation.earnings.occasionalBonuses} />
                <Line label="Desc. tiempo no laborado" value={-simulation.earnings.unpaidTimeDiscount} />
                <Line label="Auxilio transporte" value={simulation.earnings.transportAid} />
                <Line label="Total devengos" value={simulation.earnings.total} />
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-medium uppercase tracking-wide text-[var(--muted)]">
                  Deducciones trabajador
                </h3>
                <Line label="Salud" value={simulation.deductions.health} />
                <Line label="Pensión" value={simulation.deductions.pension} />
                <Line label="Solidaridad" value={simulation.deductions.solidarity} />
                <Line label="Anticipos" value={simulation.deductions.advances} />
                <Line label="Descuentos autorizados" value={simulation.deductions.authorizedDiscounts} />
                <Line label="Total deducciones" value={simulation.deductions.total} />
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-medium uppercase tracking-wide text-[var(--muted)]">
                  Aportes empresa
                </h3>
                <Line label="Salud patronal" value={simulation.employer.health} />
                <Line label="Pensión patronal" value={simulation.employer.pension} />
                <Line label="ARL" value={simulation.employer.arl} />
                <Line label="SENA" value={simulation.employer.sena} />
                <Line label="ICBF" value={simulation.employer.icbf} />
                <Line label="Caja" value={simulation.employer.compensationFund} />
                <Line label="Total aportes" value={simulation.employer.totalContributions} />
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-medium uppercase tracking-wide text-[var(--muted)]">
                  Provisiones
                </h3>
                <Line label="Prima" value={simulation.provisions.prima} />
                <Line label="Cesantías" value={simulation.provisions.cesantias} />
                <Line label="Int. cesantías" value={simulation.provisions.interestCesantias} />
                <Line label="Vacaciones" value={simulation.provisions.vacaciones} />
                <Line label="Total provisiones" value={simulation.provisions.total} />
              </div>
            </div>

            <div className="grid gap-4 border-t border-[var(--line)] pt-4 md:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                  Neto a pagar
                </p>
                <p className="font-display text-3xl font-bold">
                  {formatCOP(simulation.netPay)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                  Costo empresa quincena
                </p>
                <p className="font-display text-3xl font-bold">
                  {formatCOP(simulation.employerCost)}
                </p>
              </div>
            </div>

            {simulation.notes.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5 text-xs text-[var(--muted)]">
                {simulation.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
