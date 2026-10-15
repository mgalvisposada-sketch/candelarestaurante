"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  resetEmployeeAttendanceAction,
  saveAttendanceDayAction,
  seedPayrollAttendanceAction,
} from "../payroll-ops-actions";
import { formatDateCO } from "@/lib/dates";
import { netShiftMinutes, timeFromDb } from "@/lib/payroll";
import type { AttendanceDayKind } from "@/lib/payroll";

const inputClass =
  "w-full rounded border border-[var(--line)] bg-white px-2 py-1.5 text-sm outline-none ring-[var(--accent)] focus:ring-2";

const DAY_LABELS = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"] as const;

const KIND_LABELS: Record<AttendanceDayKind, string> = {
  LABORADO: "Laborado",
  DESCANSO: "Descanso",
  FESTIVO: "Festivo",
  FESTIVO_LABORADO: "Fest. laborado",
};

export type AttendanceRow = {
  id: string;
  employee_id: string;
  work_date: string;
  day_kind: AttendanceDayKind;
  entry_time: string | null;
  exit_time: string | null;
  break_minutes: number;
  notes: string | null;
};

export type AttendanceEmployee = {
  id: string;
  full_name: string;
};

function formatHours(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

function weekdayLabel(iso: string): string {
  const dow = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return DAY_LABELS[dow] ?? "—";
}

function rowBg(kind: AttendanceDayKind): string {
  if (kind === "DESCANSO") return "bg-cyan-50";
  if (kind === "FESTIVO") return "bg-emerald-50";
  if (kind === "FESTIVO_LABORADO") return "bg-amber-50";
  return "";
}

export function AttendanceGridClient({
  periodId,
  locked,
  employees,
  rows,
}: {
  periodId: string;
  locked: boolean;
  employees: AttendanceEmployee[];
  rows: AttendanceRow[];
}) {
  const router = useRouter();
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [drafts, setDrafts] = useState<Record<string, Partial<AttendanceRow>>>(
    {},
  );

  const empRows = useMemo(() => {
    return rows
      .filter((r) => r.employee_id === employeeId)
      .sort((a, b) => a.work_date.localeCompare(b.work_date));
  }, [rows, employeeId]);

  function merged(row: AttendanceRow): AttendanceRow {
    const d = drafts[row.id];
    return d ? { ...row, ...d } : row;
  }

  function setDraft(id: string, patch: Partial<AttendanceRow>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  function saveRow(row: AttendanceRow) {
    const m = merged(row);
    const fd = new FormData();
    fd.set("period_id", periodId);
    fd.set("employee_id", m.employee_id);
    fd.set("work_date", m.work_date);
    fd.set("day_kind", m.day_kind);
    fd.set("entry_time", m.entry_time ? timeFromDb(m.entry_time) : "");
    fd.set("exit_time", m.exit_time ? timeFromDb(m.exit_time) : "");
    fd.set("break_minutes", String(m.break_minutes ?? 0));
    fd.set("notes", m.notes ?? "");
    setError(null);
    setOk(null);
    startTransition(async () => {
      const r = await saveAttendanceDayAction(fd);
      if (!r.ok) setError(r.error ?? "Error al guardar");
      else {
        setOk(`Guardado ${formatDateCO(m.work_date)}`);
        setDrafts((prev) => {
          const next = { ...prev };
          delete next[row.id];
          return next;
        });
        router.refresh();
      }
    });
  }

  let acumulado = 0;

  return (
    <section className="space-y-4 rounded-xl border border-[var(--line)] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            1 · Asistencia
          </p>
          <h2 className="mt-1 font-medium">Planilla de la quincena</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Fuente de verdad para horas, recargos y extras. El horario Candela
            solo precarga; ajuste lo real antes de calcular.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!locked ? (
            <>
              <button
                type="button"
                disabled={pending}
                className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm"
                onClick={() => {
                  setError(null);
                  setOk(null);
                  startTransition(async () => {
                    const r = await seedPayrollAttendanceAction(periodId);
                    if (!r.ok) setError(r.error ?? "Error");
                    else {
                      setOk(
                        r.inserted
                          ? `Precargados ${r.inserted} día(s)`
                          : "Planilla ya estaba completa",
                      );
                      router.refresh();
                    }
                  });
                }}
              >
                Precargar faltantes
              </button>
              {employeeId ? (
                <button
                  type="button"
                  disabled={pending}
                  className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm"
                  onClick={() => {
                    if (
                      !confirm(
                        "¿Restablecer toda la planilla de este empleado desde Horario Candela? Se pierden ajustes.",
                      )
                    )
                      return;
                    setError(null);
                    setOk(null);
                    startTransition(async () => {
                      const r = await resetEmployeeAttendanceAction(
                        periodId,
                        employeeId,
                      );
                      if (!r.ok) setError(r.error ?? "Error");
                      else {
                        setOk("Planilla restablecida desde Candela");
                        setDrafts({});
                        router.refresh();
                      }
                    });
                  }}
                >
                  Restablecer empleado
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-cyan-200" /> Descanso
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-emerald-200" /> Festivo
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-amber-200" /> Fest. laborado
        </span>
      </div>

      {employees.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          No hay empleados de nómina activos para esta planilla.
        </p>
      ) : (
        <>
          <label className="block max-w-md text-sm">
            <span className="mb-1.5 block text-[var(--muted)]">Empleado</span>
            <select
              className={inputClass}
              value={employeeId}
              onChange={(e) => {
                setEmployeeId(e.target.value);
                setDrafts({});
              }}
            >
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name}
                </option>
              ))}
            </select>
          </label>

          {empRows.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              Sin filas. Pulse «Precargar faltantes».
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--line)] text-left text-xs uppercase tracking-wide text-[var(--muted)]">
                    <th className="px-2 py-2">Fecha</th>
                    <th className="px-2 py-2">Día</th>
                    <th className="px-2 py-2">Tipo</th>
                    <th className="px-2 py-2">Ingreso</th>
                    <th className="px-2 py-2">Salida</th>
                    <th className="px-2 py-2">Descanso</th>
                    <th className="px-2 py-2">Total</th>
                    <th className="px-2 py-2">Acum.</th>
                    {!locked ? <th className="px-2 py-2" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {empRows.map((row) => {
                    const m = merged(row);
                    const rest =
                      m.day_kind === "DESCANSO" || m.day_kind === "FESTIVO";
                    const totalMins =
                      !rest && m.entry_time && m.exit_time
                        ? netShiftMinutes(
                            timeFromDb(m.entry_time),
                            timeFromDb(m.exit_time),
                            m.break_minutes,
                          )
                        : 0;
                    acumulado += totalMins;
                    const dirty = Boolean(drafts[row.id]);
                    return (
                      <tr
                        key={row.id}
                        className={`border-b border-[var(--line)] ${rowBg(m.day_kind)}`}
                      >
                        <td className="whitespace-nowrap px-2 py-1.5">
                          {formatDateCO(m.work_date)}
                        </td>
                        <td className="px-2 py-1.5">{weekdayLabel(m.work_date)}</td>
                        <td className="px-2 py-1.5">
                          {locked ? (
                            KIND_LABELS[m.day_kind]
                          ) : (
                            <select
                              className={inputClass}
                              value={m.day_kind}
                              onChange={(e) =>
                                setDraft(row.id, {
                                  day_kind: e.target
                                    .value as AttendanceDayKind,
                                })
                              }
                            >
                              {(
                                Object.keys(KIND_LABELS) as AttendanceDayKind[]
                              ).map((k) => (
                                <option key={k} value={k}>
                                  {KIND_LABELS[k]}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          {locked || rest ? (
                            <span className="text-[var(--muted)]">
                              {m.entry_time ? timeFromDb(m.entry_time) : "—"}
                            </span>
                          ) : (
                            <input
                              type="time"
                              className={inputClass}
                              value={
                                m.entry_time ? timeFromDb(m.entry_time) : ""
                              }
                              onChange={(e) =>
                                setDraft(row.id, {
                                  entry_time: e.target.value || null,
                                })
                              }
                            />
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          {locked || rest ? (
                            <span className="text-[var(--muted)]">
                              {m.exit_time ? timeFromDb(m.exit_time) : "—"}
                            </span>
                          ) : (
                            <input
                              type="time"
                              className={inputClass}
                              value={
                                m.exit_time ? timeFromDb(m.exit_time) : ""
                              }
                              onChange={(e) =>
                                setDraft(row.id, {
                                  exit_time: e.target.value || null,
                                })
                              }
                            />
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          {locked || rest ? (
                            <span className="text-[var(--muted)]">
                              {rest ? "—" : `${m.break_minutes}m`}
                            </span>
                          ) : (
                            <input
                              type="number"
                              min={0}
                              max={480}
                              className={`${inputClass} w-20`}
                              value={m.break_minutes}
                              onChange={(e) =>
                                setDraft(row.id, {
                                  break_minutes: Number(e.target.value || 0),
                                })
                              }
                            />
                          )}
                        </td>
                        <td className="px-2 py-1.5 font-medium">
                          {rest ? "—" : formatHours(totalMins)}
                        </td>
                        <td className="px-2 py-1.5 text-[var(--muted)]">
                          {formatHours(acumulado)}
                        </td>
                        {!locked ? (
                          <td className="px-2 py-1.5">
                            <button
                              type="button"
                              disabled={pending || !dirty}
                              className="rounded bg-[var(--solid)] px-2 py-1 text-xs text-[var(--on-solid)] disabled:opacity-40"
                              onClick={() => saveRow(row)}
                            >
                              Guardar
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {ok ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {ok}
        </p>
      ) : null}
    </section>
  );
}
