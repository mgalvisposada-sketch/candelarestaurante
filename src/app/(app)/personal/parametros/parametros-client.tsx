"use client";

import { useState, useTransition } from "react";
import {
  savePayrollLegalParamsAction,
  upsertPayrollScheduleAction,
} from "../actions";
import {
  softDeleteJobPositionAction,
  upsertJobPositionAction,
} from "../payroll-ops-actions";
import { formatTimeHm } from "@/lib/payroll";
import { Badge } from "@/components/ui/primitives";

const inputClass =
  "w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none ring-[var(--accent)] focus:ring-2";

export type ScheduleRow = {
  id: string;
  name: string;
  ordinary_entry_time: string;
  ordinary_exit_time: string;
  break_minutes: number;
  works_monday: boolean;
  works_tuesday: boolean;
  works_wednesday: boolean;
  works_thursday: boolean;
  works_friday: boolean;
  works_saturday: boolean;
  works_sunday: boolean;
};

export type LegalParamsRow = {
  id: string;
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
  max_weekly_hours: number | string;
  night_start_time: string;
  night_end_time: string;
  surcharge_night_ordinary: number | string;
  surcharge_sunday_holiday: number | string;
  surcharge_extra_day: number | string;
  surcharge_extra_night: number | string;
  surcharge_extra_day_sunday: number | string;
  surcharge_extra_night_sunday: number | string;
  smmlv: number | string;
  transport_aid: number | string;
  transport_aid_max_salaries: number | string;
  employee_health_pct: number | string;
  employee_pension_pct: number | string;
  solidarity_pension_threshold_smmlv: number | string;
  solidarity_pension_pct: number | string;
  apply_solidarity_pension: boolean;
  employer_health_pct: number | string;
  employer_pension_pct: number | string;
  arl_pct_level_i: number | string;
  arl_pct_level_ii: number | string;
  arl_pct_level_iii: number | string;
  arl_pct_level_iv: number | string;
  arl_pct_level_v: number | string;
  sena_pct: number | string;
  icbf_pct: number | string;
  compensation_fund_pct: number | string;
  parafiscal_exemption_max_smmlv: number | string;
  apply_parafiscales: boolean;
  apply_parafiscal_exemption: boolean;
  provision_prima_pct: number | string;
  provision_cesantias_pct: number | string;
  provision_interest_cesantias_pct: number | string;
  provision_vacaciones_pct: number | string;
  round_to_peso: boolean;
};

const DAYS: Array<{ key: keyof ScheduleRow; label: string }> = [
  { key: "works_monday", label: "Lun" },
  { key: "works_tuesday", label: "Mar" },
  { key: "works_wednesday", label: "Mié" },
  { key: "works_thursday", label: "Jue" },
  { key: "works_friday", label: "Vie" },
  { key: "works_saturday", label: "Sáb" },
  { key: "works_sunday", label: "Dom" },
];

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  step,
  hint,
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  type?: string;
  step?: string;
  hint?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block text-[var(--muted)]">{label}</span>
      <input
        name={name}
        type={type}
        step={step}
        defaultValue={defaultValue ?? ""}
        className={inputClass}
      />
      {hint ? (
        <span className="mt-1 block text-xs leading-relaxed text-[var(--muted)]">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

function Check({
  label,
  name,
  defaultChecked,
  hint,
}: {
  label: string;
  name: string;
  defaultChecked?: boolean;
  hint?: string;
}) {
  return (
    <label className="flex gap-2 text-sm">
      <input
        type="checkbox"
        name={name}
        value="true"
        defaultChecked={defaultChecked}
        className="mt-0.5 rounded border-[var(--line)]"
      />
      <span>
        <span className="font-medium">{label}</span>
        {hint ? (
          <span className="mt-0.5 block text-xs leading-relaxed text-[var(--muted)]">
            {hint}
          </span>
        ) : null}
      </span>
    </label>
  );
}

export function HorarioCandelaForm({ schedule }: { schedule: ScheduleRow | null }) {
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-5 rounded-xl border border-[var(--line)] bg-white p-5"
      action={(fd) => {
        setError(null);
        setOk(null);
        startTransition(async () => {
          const r = await upsertPayrollScheduleAction(fd, schedule?.id);
          if (!r.ok) setError(r.error ?? "Error");
          else setOk("Horario Candela guardado. Empleados sin personalización se sincronizaron.");
        });
      }}
    >
      <div>
        <h3 className="font-medium">Horario Candela</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Define los días que el restaurante abre y la jornada ordinaria plantilla.
          Impacta la simulación quincenal y la futura liquidación con novedades.
        </p>
      </div>

      <Field label="Nombre" name="name" defaultValue={schedule?.name ?? "Horario Candela"} />

      <div className="grid gap-3 md:grid-cols-3">
        <Field
          label="Entrada ordinaria"
          name="ordinary_entry_time"
          type="time"
          defaultValue={formatTimeHm(schedule?.ordinary_entry_time ?? "10:00")}
        />
        <Field
          label="Salida ordinaria"
          name="ordinary_exit_time"
          type="time"
          defaultValue={formatTimeHm(schedule?.ordinary_exit_time ?? "22:00")}
        />
        <Field
          label="Descanso (minutos)"
          name="break_minutes"
          type="number"
          defaultValue={schedule?.break_minutes ?? 60}
        />
      </div>

      <div>
        <p className="mb-2 text-sm text-[var(--muted)]">Días que se labora</p>
        <div className="flex flex-wrap gap-4">
          {DAYS.map((d) => (
            <Check
              key={d.key}
              label={d.label}
              name={d.key}
              defaultChecked={Boolean(schedule?.[d.key] ?? d.key !== "works_sunday")}
            />
          ))}
        </div>
      </div>

      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      {ok ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{ok}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[var(--ink)] px-5 py-2.5 text-sm text-white"
      >
        {pending ? "Guardando…" : "Guardar horario"}
      </button>
    </form>
  );
}

export function ParametrosOrdinariosForm({
  params,
}: {
  params: LegalParamsRow | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const p = params;

  return (
    <form
      className="space-y-8 rounded-xl border border-[var(--line)] bg-white p-5"
      action={(fd) => {
        setError(null);
        setOk(null);
        startTransition(async () => {
          const r = await savePayrollLegalParamsAction(fd, p?.id);
          if (!r.ok) setError(r.error ?? "Error");
          else
            setOk(
              "Nueva vigencia de parámetros guardada. Las simulaciones usarán estos valores.",
            );
        });
      }}
    >
      <div>
        <h3 className="font-medium">Parámetros ordinarios (Colombia)</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Al guardar se crea una nueva vigencia. Ajuste SMMLV, recargos, deducciones
          y aportes según la norma vigente.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Field
          label="Vigente desde"
          name="effective_from"
          type="date"
          defaultValue={p?.effective_from ?? new Date().toISOString().slice(0, 10)}
        />
        <Field label="Notas" name="notes" defaultValue={p?.notes ?? ""} />
      </div>

      <section className="space-y-3">
        <h4 className="text-sm font-medium uppercase tracking-wide text-[var(--muted)]">
          Jornada y recargos (%)
        </h4>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Horas máx. semanales" name="max_weekly_hours" type="number" step="0.01" defaultValue={p?.max_weekly_hours ?? 42} />
          <Field label="Inicio nocturno" name="night_start_time" type="time" defaultValue={formatTimeHm(p?.night_start_time ?? "19:00")} />
          <Field label="Fin nocturno" name="night_end_time" type="time" defaultValue={formatTimeHm(p?.night_end_time ?? "06:00")} />
          <Field label="Recargo nocturno ordinario" name="surcharge_night_ordinary" type="number" step="0.01" defaultValue={p?.surcharge_night_ordinary ?? 35} />
          <Field label="Recargo dominical/festivo" name="surcharge_sunday_holiday" type="number" step="0.01" defaultValue={p?.surcharge_sunday_holiday ?? 90} />
          <Field label="Extra diurna" name="surcharge_extra_day" type="number" step="0.01" defaultValue={p?.surcharge_extra_day ?? 25} />
          <Field label="Extra nocturna" name="surcharge_extra_night" type="number" step="0.01" defaultValue={p?.surcharge_extra_night ?? 75} />
          <Field label="Extra diurna dominical" name="surcharge_extra_day_sunday" type="number" step="0.01" defaultValue={p?.surcharge_extra_day_sunday ?? 115} />
          <Field label="Extra nocturna dominical" name="surcharge_extra_night_sunday" type="number" step="0.01" defaultValue={p?.surcharge_extra_night_sunday ?? 165} />
        </div>
      </section>

      <section className="space-y-3">
        <h4 className="text-sm font-medium uppercase tracking-wide text-[var(--muted)]">
          Referencias legales
        </h4>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="SMMLV" name="smmlv" defaultValue={p?.smmlv ?? 1750905} />
          <Field label="Auxilio de transporte" name="transport_aid" defaultValue={p?.transport_aid ?? 249095} />
          <Field label="Tope auxilio (× SMMLV)" name="transport_aid_max_salaries" type="number" step="0.01" defaultValue={p?.transport_aid_max_salaries ?? 2} />
        </div>
      </section>

      <section className="space-y-3">
        <h4 className="text-sm font-medium uppercase tracking-wide text-[var(--muted)]">
          Deducciones del trabajador (%)
        </h4>
        <p className="text-xs leading-relaxed text-[var(--muted)]">
          Se descuentan del salario del empleado. Salud y pensión aplican a casi todos;
          la solidaridad solo a quienes ganan mucho.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Salud trabajador" name="employee_health_pct" type="number" step="0.01" defaultValue={p?.employee_health_pct ?? 4} />
          <Field label="Pensión trabajador" name="employee_pension_pct" type="number" step="0.01" defaultValue={p?.employee_pension_pct ?? 4} />
          <Field
            label="A partir de cuántos SMMLV cobra solidaridad"
            name="solidarity_pension_threshold_smmlv"
            type="number"
            step="0.01"
            defaultValue={p?.solidarity_pension_threshold_smmlv ?? 4}
            hint="Ej. 4 = solo si el salario es ≥ 4 mínimos (~$7.003.620 en 2026). Un mesero normal no paga esto."
          />
          <Field
            label="% extra de solidaridad pensional"
            name="solidarity_pension_pct"
            type="number"
            step="0.01"
            defaultValue={p?.solidarity_pension_pct ?? 1}
            hint="Cuánto se descuenta adicional al trabajador cuando supera el umbral (por ley suele ser 1%)."
          />
        </div>
        <Check
          label="Calcular solidaridad pensional"
          name="apply_solidarity_pension"
          defaultChecked={p?.apply_solidarity_pension ?? true}
          hint="Déjalo encendido. Solo afecta empleados de alto salario; el resto no ve ningún descuento extra."
        />
      </section>

      <section className="space-y-3">
        <h4 className="text-sm font-medium uppercase tracking-wide text-[var(--muted)]">
          Aportes empresa (%)
        </h4>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Salud patronal" name="employer_health_pct" type="number" step="0.01" defaultValue={p?.employer_health_pct ?? 8.5} />
          <Field label="Pensión patronal" name="employer_pension_pct" type="number" step="0.01" defaultValue={p?.employer_pension_pct ?? 12} />
          <Field label="ARL nivel I" name="arl_pct_level_i" type="number" step="0.001" defaultValue={p?.arl_pct_level_i ?? 0.522} />
          <Field label="ARL nivel II" name="arl_pct_level_ii" type="number" step="0.001" defaultValue={p?.arl_pct_level_ii ?? 1.044} />
          <Field label="ARL nivel III" name="arl_pct_level_iii" type="number" step="0.001" defaultValue={p?.arl_pct_level_iii ?? 2.436} />
          <Field label="ARL nivel IV" name="arl_pct_level_iv" type="number" step="0.001" defaultValue={p?.arl_pct_level_iv ?? 4.35} />
          <Field label="ARL nivel V" name="arl_pct_level_v" type="number" step="0.001" defaultValue={p?.arl_pct_level_v ?? 6.96} />
        </div>
      </section>

      <section className="space-y-3">
        <h4 className="text-sm font-medium uppercase tracking-wide text-[var(--muted)]">
          Parafiscales (pago de la empresa)
        </h4>
        <p className="text-xs leading-relaxed text-[var(--muted)]">
          Aportes que paga Candela, no el empleado: Caja de compensación, SENA e ICBF.
          En la mayoría de salarios de restaurante aplica una exoneración legal (abajo).
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="SENA" name="sena_pct" type="number" step="0.01" defaultValue={p?.sena_pct ?? 2} />
          <Field label="ICBF" name="icbf_pct" type="number" step="0.01" defaultValue={p?.icbf_pct ?? 3} />
          <Field
            label="Caja de compensación"
            name="compensation_fund_pct"
            type="number"
            step="0.01"
            defaultValue={p?.compensation_fund_pct ?? 4}
            hint="Siempre se paga si están activos los parafiscales (no entra en la exoneración)."
          />
          <Field
            label="Tope de exoneración (× SMMLV)"
            name="parafiscal_exemption_max_smmlv"
            type="number"
            step="0.01"
            defaultValue={p?.parafiscal_exemption_max_smmlv ?? 10}
            hint="Ej. 10 = si el empleado gana menos de 10 mínimos, Candela se ahorra salud patronal, SENA e ICBF."
          />
        </div>
        <div className="space-y-3 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4">
          <Check
            label="Sí, calcular parafiscales"
            name="apply_parafiscales"
            defaultChecked={p?.apply_parafiscales ?? true}
            hint="Encendido = Candela aporta Caja (y SENA/ICBF cuando no hay exoneración). Déjalo encendido en operación normal."
          />
          <Check
            label="Usar exoneración legal (art. 114-1)"
            name="apply_parafiscal_exemption"
            defaultChecked={p?.apply_parafiscal_exemption ?? true}
            hint="Encendido = para empleados bajo el tope, no se cobra a Candela la salud patronal ni SENA/ICBF. La Caja sí se paga. Recomendado para el restaurante."
          />
        </div>
      </section>

      <section className="space-y-3">
        <h4 className="text-sm font-medium uppercase tracking-wide text-[var(--muted)]">
          Provisiones (%)
        </h4>
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Prima" name="provision_prima_pct" type="number" step="0.01" defaultValue={p?.provision_prima_pct ?? 8.33} />
          <Field label="Cesantías" name="provision_cesantias_pct" type="number" step="0.01" defaultValue={p?.provision_cesantias_pct ?? 8.33} />
          <Field label="Intereses cesantías" name="provision_interest_cesantias_pct" type="number" step="0.01" defaultValue={p?.provision_interest_cesantias_pct ?? 1} />
          <Field label="Vacaciones" name="provision_vacaciones_pct" type="number" step="0.01" defaultValue={p?.provision_vacaciones_pct ?? 4.17} />
        </div>
        <Check label="Redondear a peso" name="round_to_peso" defaultChecked={p?.round_to_peso ?? true} />
      </section>

      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      {ok ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{ok}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[var(--ink)] px-5 py-2.5 text-sm text-white"
      >
        {pending ? "Guardando…" : "Guardar nueva vigencia"}
      </button>
    </form>
  );
}

export type JobPositionRow = {
  id: string;
  code: string | null;
  name: string;
  arl_risk_level: "I" | "II" | "III" | "IV" | "V";
  default_break_minutes: number;
  notes: string | null;
  is_active: boolean;
};

const ARL_LABELS: Record<string, string> = {
  I: "I — 0,522%",
  II: "II — 1,044%",
  III: "III — 2,436%",
  IV: "IV — 4,350%",
  V: "V — 6,960%",
};

export function CargosCandelaForm({
  positions,
}: {
  positions: JobPositionRow[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-[var(--line)] bg-white p-5">
        <h3 className="font-medium">Cargos Candela</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Maestro de cargos del restaurante con clase de riesgo ARL sugerida.
          Al crear un empleado, el cargo prellena el nivel ARL. La clasificación
          legal oficial de la empresa es por CIIU (Dec. 768/2022; expendio a la
          mesa 5611 suele ser clase III); el cargo afina casos como domiciliario.
        </p>
      </div>

      <ul className="space-y-2">
        {positions.map((p) => (
          <li
            key={p.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm"
          >
            <div>
              <p className="font-medium">
                {p.name}{" "}
                {p.code ? (
                  <span className="text-[var(--muted)]">({p.code})</span>
                ) : null}
              </p>
              <p className="text-[var(--muted)]">
                ARL {ARL_LABELS[p.arl_risk_level] ?? p.arl_risk_level}
                {p.notes ? ` · ${p.notes}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={p.is_active ? "ok" : "neutral"}>
                {p.is_active ? "Activo" : "Inactivo"}
              </Badge>
              <button
                type="button"
                className="text-red-700"
                disabled={pending}
                onClick={() => {
                  if (!confirm("¿Desactivar cargo?")) return;
                  startTransition(async () => {
                    await softDeleteJobPositionAction(p.id);
                  });
                }}
              >
                Quitar
              </button>
            </div>
          </li>
        ))}
      </ul>

      <form
        className="space-y-4 rounded-xl border border-[var(--line)] bg-white p-5"
        action={(fd) => {
          setError(null);
          setOk(null);
          startTransition(async () => {
            const r = await upsertJobPositionAction(fd);
            if (!r.ok) setError(r.error ?? "Error");
            else setOk("Cargo guardado");
          });
        }}
      >
        <h4 className="font-medium">Agregar cargo</h4>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Nombre" name="name" />
          <Field label="Código" name="code" />
          <label className="block text-sm">
            <span className="mb-1.5 block text-[var(--muted)]">Clase ARL</span>
            <select name="arl_risk_level" defaultValue="III" className={inputClass}>
              {(["I", "II", "III", "IV", "V"] as const).map((l) => (
                <option key={l} value={l}>
                  {ARL_LABELS[l]}
                </option>
              ))}
            </select>
          </label>
          <Field
            label="Descanso default (min)"
            name="default_break_minutes"
            type="number"
            defaultValue={60}
          />
          <label className="block text-sm md:col-span-2">
            <span className="mb-1.5 block text-[var(--muted)]">Notas</span>
            <input name="notes" className={inputClass} />
          </label>
        </div>
        {error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
        ) : null}
        {ok ? (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{ok}</p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-[var(--ink)] px-5 py-2.5 text-sm text-white"
        >
          {pending ? "Guardando…" : "Guardar cargo"}
        </button>
      </form>
    </div>
  );
}
