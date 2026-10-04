"use client";

import { useMemo, useState, useTransition } from "react";
import {
  annulNoveltyAction,
  createNoveltyAction,
  reviewNoveltyAction,
} from "../payroll-ops-actions";
import { Badge } from "@/components/ui/primitives";
import { formatCOP } from "@/lib/money";
import { formatDateCO } from "@/lib/dates";
import { NOVELTY_TYPES } from "@/validations/novelties";

const inputClass =
  "w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none ring-[var(--accent)] focus:ring-2";

const TYPE_LABELS: Record<string, string> = {
  LLEGADA_TARDE: "Llegada tarde",
  SALIDA_TEMPRANA: "Salida temprana",
  PERMISO_REMUNERADO: "Permiso remunerado",
  PERMISO_NO_REMUNERADO: "Permiso no remunerado",
  AUSENCIA: "Ausencia / falta",
  HORA_EXTRA: "Hora extra",
  TURNO_LABORADO: "Turno / día laborado",
  ANTICIPO: "Anticipo",
  DESCUENTO_AUTORIZADO: "Descuento autorizado",
  BONO_OCASIONAL: "Bono ocasional",
};

const STATUS_TONE: Record<string, "neutral" | "ok" | "warn" | "danger" | "info"> = {
  PENDIENTE: "warn",
  APROBADA: "ok",
  RECHAZADA: "danger",
  ANULADA: "neutral",
  BORRADOR: "info",
};

const MONEY_TYPES = new Set([
  "ANTICIPO",
  "DESCUENTO_AUTORIZADO",
  "BONO_OCASIONAL",
]);

export type NoveltyRow = {
  id: string;
  employee_id: string;
  novelty_date: string;
  novelty_type: string;
  status: string;
  minutes: number | null;
  amount: number | string | null;
  start_time: string | null;
  end_time: string | null;
  notes: string | null;
  review_notes: string | null;
  employee_name?: string;
};

export type NoveltyEmployeeOption = {
  id: string;
  full_name: string;
  employment_type?: string | null;
  daily_rate?: number | null;
};

export function NovedadesClient({
  novelties,
  employees,
  canApprove,
}: {
  novelties: NoveltyRow[];
  employees: NoveltyEmployeeOption[];
  canApprove: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [filter, setFilter] = useState<string>("ALL");
  const [type, setType] = useState<string>("LLEGADA_TARDE");
  const [employeeId, setEmployeeId] = useState<string>("");

  const filtered = useMemo(() => {
    if (filter === "ALL") return novelties;
    return novelties.filter((n) => n.status === filter);
  }, [novelties, filter]);

  const isMoney = MONEY_TYPES.has(type);
  const isShiftDay = type === "TURNO_LABORADO";
  const selectedEmp = employees.find((e) => e.id === employeeId);
  const defaultShiftRate = selectedEmp?.daily_rate ?? null;

  return (
    <div className="space-y-6">
      <form
        className="space-y-4 rounded-xl border border-[var(--line)] bg-white p-5"
        action={(fd) => {
          setError(null);
          setOk(null);
          startTransition(async () => {
            const r = await createNoveltyAction(fd);
            if (!r.ok) setError(r.error ?? "Error");
            else setOk("Novedad enviada a aprobación del gerente");
          });
        }}
      >
        <div>
          <h3 className="font-medium">Reportar novedad</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            El administrador del local registra; el gerente aprueba antes de que
            entre a la liquidación quincenal.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="block text-sm md:col-span-1">
            <span className="mb-1.5 block text-[var(--muted)]">Empleado</span>
            <select
              name="employee_id"
              required
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className={inputClass}
            >
              <option value="">Seleccione…</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name}
                  {e.employment_type === "POR_TURNO" && e.daily_rate
                    ? ` · turno ${e.daily_rate}`
                    : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-[var(--muted)]">Fecha</span>
            <input type="date" name="novelty_date" required className={inputClass} />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-[var(--muted)]">Tipo</span>
            <select
              name="novelty_type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className={inputClass}
            >
              {NOVELTY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t] ?? t}
                </option>
              ))}
            </select>
          </label>
          {isShiftDay ? (
            <label className="block text-sm md:col-span-2">
              <span className="mb-1.5 block text-[var(--muted)]">
                Valor del turno (opcional)
              </span>
              <input
                name="amount"
                defaultValue={defaultShiftRate ?? ""}
                key={`shift-${employeeId}-${defaultShiftRate ?? "x"}`}
                className={inputClass}
                placeholder="Vacío = tarifa del empleado"
              />
              <span className="mt-1 block text-xs text-[var(--muted)]">
                Para prestadores «Por turno / día». Luego el gerente aprueba y entra
                a la liquidación.
              </span>
            </label>
          ) : isMoney ? (
            <label className="block text-sm">
              <span className="mb-1.5 block text-[var(--muted)]">Monto</span>
              <input name="amount" required className={inputClass} />
            </label>
          ) : type === "PERMISO_REMUNERADO" ? (
            <label className="block text-sm">
              <span className="mb-1.5 block text-[var(--muted)]">Minutos (opcional)</span>
              <input name="minutes" type="number" className={inputClass} />
            </label>
          ) : (
            <>
              <label className="block text-sm">
                <span className="mb-1.5 block text-[var(--muted)]">Minutos</span>
                <input name="minutes" type="number" className={inputClass} />
              </label>
              {type === "HORA_EXTRA" ? (
                <>
                  <label className="block text-sm">
                    <span className="mb-1.5 block text-[var(--muted)]">Desde</span>
                    <input type="time" name="start_time" className={inputClass} />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1.5 block text-[var(--muted)]">Hasta</span>
                    <input type="time" name="end_time" className={inputClass} />
                  </label>
                </>
              ) : null}
            </>
          )}
          <label className="block text-sm md:col-span-3">
            <span className="mb-1.5 block text-[var(--muted)]">Nota / soporte</span>
            <input name="notes" className={inputClass} placeholder="Motivo, autorización, referencia…" />
          </label>
          <input type="hidden" name="support_note" value="" />
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
          {pending ? "Enviando…" : "Enviar a aprobación"}
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        {["ALL", "PENDIENTE", "APROBADA", "RECHAZADA", "ANULADA"].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              filter === s
                ? "bg-[var(--ink)] text-white"
                : "text-[var(--muted)]"
            }`}
          >
            {s === "ALL" ? "Todas" : s}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Sin novedades en este filtro.</p>
        ) : (
          filtered.map((n) => (
            <article
              key={n.id}
              className="rounded-xl border border-[var(--line)] bg-white p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {n.employee_name ?? "Empleado"} ·{" "}
                    {TYPE_LABELS[n.novelty_type] ?? n.novelty_type}
                  </p>
                  <p className="text-sm text-[var(--muted)]">
                    {formatDateCO(n.novelty_date)}
                    {n.minutes != null ? ` · ${n.minutes} min` : ""}
                    {n.amount != null ? ` · ${formatCOP(n.amount)}` : ""}
                    {n.notes ? ` · ${n.notes}` : ""}
                  </p>
                  {n.review_notes ? (
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Revisión: {n.review_notes}
                    </p>
                  ) : null}
                </div>
                <Badge tone={STATUS_TONE[n.status] ?? "neutral"}>{n.status}</Badge>
              </div>
              {n.status === "PENDIENTE" && canApprove ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm text-white"
                    onClick={() => {
                      startTransition(async () => {
                        await reviewNoveltyAction(n.id, "APROBADA");
                      });
                    }}
                  >
                    Aprobar
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm"
                    onClick={() => {
                      const note = prompt("Motivo del rechazo (opcional)") ?? "";
                      startTransition(async () => {
                        await reviewNoveltyAction(n.id, "RECHAZADA", note);
                      });
                    }}
                  >
                    Rechazar
                  </button>
                </div>
              ) : null}
              {n.status === "APROBADA" && canApprove ? (
                <button
                  type="button"
                  disabled={pending}
                  className="mt-3 text-sm text-red-700"
                  onClick={() => {
                    startTransition(async () => {
                      await annulNoveltyAction(n.id);
                    });
                  }}
                >
                  Anular
                </button>
              ) : null}
            </article>
          ))
        )}
      </div>
    </div>
  );
}
