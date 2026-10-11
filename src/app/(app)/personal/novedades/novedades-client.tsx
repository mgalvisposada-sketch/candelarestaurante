"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  annulNoveltyAction,
  createNoveltyAction,
  reviewNoveltyAction,
  syncShiftDaysAction,
} from "../payroll-ops-actions";
import { notifyPendingActionsChanged } from "@/components/layout/pending-actions-inbox";
import { Badge } from "@/components/ui/primitives";
import { formatCOP } from "@/lib/money";
import { formatDateCO, todayInBogota } from "@/lib/dates";
import { biweeklyRange } from "@/lib/payroll/schedule";
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

type QuincenaMeta = {
  key: string;
  year: number;
  month: number;
  half: 1 | 2;
  label: string;
  rangeLabel: string;
  sortKey: number;
};

function quincenaFromDate(isoDate: string): QuincenaMeta {
  const [yRaw, mRaw, dRaw] = isoDate.split("-");
  const year = Number(yRaw);
  const month = Number(mRaw);
  const day = Number(dRaw);
  const half: 1 | 2 = day <= 15 ? 1 : 2;
  const range = biweeklyRange(year, month, half);
  return {
    key: `${year}-${String(month).padStart(2, "0")}-${half}`,
    year,
    month,
    half,
    label: `${half === 1 ? "1ª" : "2ª"} quincena ${String(month).padStart(2, "0")}/${year}`,
    rangeLabel: `${formatDateCO(range.startIso)} → ${formatDateCO(range.endIso)}`,
    sortKey: year * 100 + month * 2 + half,
  };
}

function currentQuincenaKey(): string {
  return quincenaFromDate(todayInBogota()).key;
}

function parseQuincenaKey(key: string): QuincenaMeta | null {
  const m = key.match(/^(\d{4})-(\d{2})-([12])$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const half = Number(m[3]) as 1 | 2;
  const range = biweeklyRange(year, month, half);
  return {
    key,
    year,
    month,
    half,
    label: `${half === 1 ? "1ª" : "2ª"} quincena ${String(month).padStart(2, "0")}/${year}`,
    rangeLabel: `${formatDateCO(range.startIso)} → ${formatDateCO(range.endIso)}`,
    sortKey: year * 100 + month * 2 + half,
  };
}

function daysInQuincena(meta: QuincenaMeta): string[] {
  const range = biweeklyRange(meta.year, meta.month, meta.half);
  const days: string[] = [];
  const cursor = new Date(range.start);
  const end = new Date(range.end);
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function shiftWeekdayLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  return d.toLocaleDateString("es-CO", { weekday: "short", timeZone: "UTC" });
}

function dayNumber(isoDate: string): string {
  return isoDate.slice(8, 10);
}

function neighboringQuincenas(from: QuincenaMeta, before = 2, after = 1): QuincenaMeta[] {
  const out: QuincenaMeta[] = [];
  let year = from.year;
  let month = from.month;
  let half = from.half;

  for (let i = 0; i < before; i++) {
    if (half === 1) {
      half = 2;
      month -= 1;
      if (month < 1) {
        month = 12;
        year -= 1;
      }
    } else {
      half = 1;
    }
  }

  const total = before + 1 + after;
  for (let i = 0; i < total; i++) {
    const range = biweeklyRange(year, month, half);
    out.push({
      key: `${year}-${String(month).padStart(2, "0")}-${half}`,
      year,
      month,
      half,
      label: `${half === 1 ? "1ª" : "2ª"} quincena ${String(month).padStart(2, "0")}/${year}`,
      rangeLabel: `${formatDateCO(range.startIso)} → ${formatDateCO(range.endIso)}`,
      sortKey: year * 100 + month * 2 + half,
    });
    if (half === 1) half = 2;
    else {
      half = 1;
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
  }
  return out.sort((a, b) => b.sortKey - a.sortKey);
}

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
  const [quincenaFilter, setQuincenaFilter] = useState<string>(() =>
    currentQuincenaKey(),
  );
  const [type, setType] = useState<string>("LLEGADA_TARDE");
  const [employeeId, setEmployeeId] = useState<string>("");

  const shiftEmployees = useMemo(
    () => employees.filter((e) => e.employment_type === "POR_TURNO"),
    [employees],
  );

  const quincenaOptions = useMemo(() => {
    const map = new Map<string, QuincenaMeta>();
    const current = quincenaFromDate(todayInBogota());
    map.set(current.key, current);
    for (const n of novelties) {
      const q = quincenaFromDate(n.novelty_date);
      map.set(q.key, q);
    }
    return [...map.values()].sort((a, b) => b.sortKey - a.sortKey);
  }, [novelties]);

  const filtered = useMemo(() => {
    return novelties.filter((n) => {
      if (filter !== "ALL" && n.status !== filter) return false;
      if (quincenaFilter !== "ALL") {
        return quincenaFromDate(n.novelty_date).key === quincenaFilter;
      }
      return true;
    });
  }, [novelties, filter, quincenaFilter]);

  const groups = useMemo(() => {
    const map = new Map<string, { meta: QuincenaMeta; items: NoveltyRow[] }>();
    for (const n of filtered) {
      const meta = quincenaFromDate(n.novelty_date);
      const bucket = map.get(meta.key);
      if (bucket) bucket.items.push(n);
      else map.set(meta.key, { meta, items: [n] });
    }
    return [...map.values()].sort((a, b) => b.meta.sortKey - a.meta.sortKey);
  }, [filtered]);

  const isMoney = MONEY_TYPES.has(type);
  const isShiftDay = type === "TURNO_LABORADO";
  const selectedEmp = employees.find((e) => e.id === employeeId);
  const defaultShiftRate = selectedEmp?.daily_rate ?? null;
  const currentKey = currentQuincenaKey();

  return (
    <div className="space-y-6">
      {shiftEmployees.length > 0 ? (
        <ShiftCalendarSection
          employees={shiftEmployees}
          novelties={novelties}
          pending={pending}
          startTransition={startTransition}
        />
      ) : null}

      <form
        className="space-y-4 rounded-xl border border-[var(--line)] bg-white p-5"
        action={(fd) => {
          setError(null);
          setOk(null);
          startTransition(async () => {
            const r = await createNoveltyAction(fd);
            if (!r.ok) setError(r.error ?? "Error");
            else {
              setOk("Novedad enviada a aprobación del gerente");
              notifyPendingActionsChanged();
            }
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

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-[var(--muted)]">Quincena</span>
          <select
            value={quincenaFilter}
            onChange={(e) => setQuincenaFilter(e.target.value)}
            className={`${inputClass} w-auto min-w-[16rem]`}
          >
            <option value="ALL">Todas las quincenas</option>
            {quincenaOptions.map((q) => (
              <option key={q.key} value={q.key}>
                {q.label}
                {q.key === currentKey ? " · actual" : ""}
              </option>
            ))}
          </select>
        </div>
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
              {s === "ALL" ? "Todos los estados" : s}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {groups.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Sin novedades en este filtro.</p>
        ) : (
          groups.map(({ meta, items }) => (
            <QuincenaSection
              key={`${meta.key}-${quincenaFilter}`}
              meta={meta}
              items={items}
              isCurrent={meta.key === currentKey}
              initiallyOpen={
                quincenaFilter !== "ALL" || meta.key === currentKey
              }
              canApprove={canApprove}
              pending={pending}
              startTransition={startTransition}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ShiftCalendarSection({
  employees,
  novelties,
  pending,
  startTransition,
}: {
  employees: NoveltyEmployeeOption[];
  novelties: NoveltyRow[];
  pending: boolean;
  startTransition: (fn: () => void | Promise<void>) => void;
}) {
  const current = useMemo(() => quincenaFromDate(todayInBogota()), []);
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? "");
  const [quincenaKey, setQuincenaKey] = useState(current.key);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const quincenaChoices = useMemo(() => {
    const map = new Map<string, QuincenaMeta>();
    for (const q of neighboringQuincenas(current, 3, 1)) map.set(q.key, q);
    for (const n of novelties) {
      if (n.novelty_type !== "TURNO_LABORADO") continue;
      const q = quincenaFromDate(n.novelty_date);
      map.set(q.key, q);
    }
    return [...map.values()].sort((a, b) => b.sortKey - a.sortKey);
  }, [novelties, current]);

  const meta = useMemo(
    () => parseQuincenaKey(quincenaKey) ?? current,
    [quincenaKey, current],
  );
  const days = useMemo(() => daysInQuincena(meta), [meta]);
  const employee = employees.find((e) => e.id === employeeId) ?? null;
  const rate = employee?.daily_rate ?? 0;

  const savedDates = useMemo(() => {
    const set = new Set<string>();
    for (const n of novelties) {
      if (n.employee_id !== employeeId) continue;
      if (n.novelty_type !== "TURNO_LABORADO") continue;
      if (n.status !== "PENDIENTE" && n.status !== "APROBADA") continue;
      const q = quincenaFromDate(n.novelty_date);
      if (q.key !== meta.key) continue;
      set.add(n.novelty_date);
    }
    return set;
  }, [novelties, employeeId, meta.key]);

  useEffect(() => {
    setSelected(new Set(savedDates));
  }, [savedDates]);

  useEffect(() => {
    setError(null);
    setOk(null);
  }, [employeeId, meta.key]);

  useEffect(() => {
    if (!employees.some((e) => e.id === employeeId)) {
      setEmployeeId(employees[0]?.id ?? "");
    }
  }, [employees, employeeId]);

  const dirty = useMemo(() => {
    if (selected.size !== savedDates.size) return true;
    for (const d of selected) if (!savedDates.has(d)) return true;
    return false;
  }, [selected, savedDates]);

  const estimated = selected.size * (rate || 0);

  function toggleDay(iso: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(iso)) next.delete(iso);
      else next.add(iso);
      return next;
    });
    setError(null);
    setOk(null);
  }

  function selectAll() {
    setSelected(new Set(days));
    setError(null);
    setOk(null);
  }

  function clearAll() {
    setSelected(new Set());
    setError(null);
    setOk(null);
  }

  return (
    <section className="space-y-4 rounded-xl border border-[var(--line)] bg-white p-5">
      <div>
        <h3 className="font-medium">Turnos por quincena</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Marca los días trabajados del prestador. Se guardan ya aprobados y
          entran directo a la liquidación.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Prestador</span>
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className={inputClass}
          >
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.full_name}
                {e.daily_rate ? ` · ${formatCOP(e.daily_rate)}/turno` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Quincena</span>
          <select
            value={quincenaKey}
            onChange={(e) => setQuincenaKey(e.target.value)}
            className={inputClass}
          >
            {quincenaChoices.map((q) => (
              <option key={q.key} value={q.key}>
                {q.label}
                {q.key === current.key ? " · actual" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="text-sm text-[var(--muted)]">{meta.rangeLabel}</p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={selectAll}
          className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm"
        >
          Marcar todos
        </button>
        <button
          type="button"
          onClick={clearAll}
          className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm"
        >
          Limpiar
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-7">
        {days.map((iso) => {
          const on = selected.has(iso);
          const wasSaved = savedDates.has(iso);
          return (
            <button
              key={iso}
              type="button"
              onClick={() => toggleDay(iso)}
              className={`rounded-lg border px-2 py-2 text-center text-sm transition-colors ${
                on
                  ? "border-emerald-700 bg-emerald-700 text-white"
                  : "border-[var(--line)] bg-[var(--bg)]/40 text-[var(--ink)]"
              }`}
              title={formatDateCO(iso)}
            >
              <span className="block text-[10px] uppercase opacity-80">
                {shiftWeekdayLabel(iso)}
              </span>
              <span className="block text-base font-medium">{dayNumber(iso)}</span>
              {wasSaved && !on ? (
                <span className="mt-0.5 block text-[10px] text-red-700">
                  se anula
                </span>
              ) : null}
              {!wasSaved && on ? (
                <span className="mt-0.5 block text-[10px] opacity-80">nuevo</span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-[var(--muted)]">
          {selected.size} día{selected.size === 1 ? "" : "s"}
          {rate > 0 ? ` · estimado ${formatCOP(estimated)}` : ""}
        </p>
        <button
          type="button"
          disabled={pending || !employeeId || !dirty}
          className="rounded-lg bg-[var(--ink)] px-5 py-2.5 text-sm text-white disabled:opacity-50"
          onClick={() => {
            setError(null);
            setOk(null);
            startTransition(async () => {
              const r = await syncShiftDaysAction({
                employee_id: employeeId,
                period_year: meta.year,
                period_month: meta.month,
                period_half: meta.half,
                dates: [...selected],
              });
              if (!r.ok) setError(r.error ?? "Error");
              else {
                setOk(r.message ?? "Turnos actualizados");
                notifyPendingActionsChanged();
              }
            });
          }}
        >
          {pending ? "Guardando…" : "Guardar turnos"}
        </button>
      </div>

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}
      {ok ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {ok}
        </p>
      ) : null}
    </section>
  );
}

function QuincenaSection({
  meta,
  items,
  isCurrent,
  initiallyOpen,
  canApprove,
  pending,
  startTransition,
}: {
  meta: QuincenaMeta;
  items: NoveltyRow[];
  isCurrent: boolean;
  initiallyOpen: boolean;
  canApprove: boolean;
  pending: boolean;
  startTransition: (fn: () => void | Promise<void>) => void;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const pendingCount = items.filter((n) => n.status === "PENDIENTE").length;

  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="rounded-xl border border-[var(--line)] bg-white"
    >
      <summary className="cursor-pointer list-none px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium">
              {meta.label}
              {isCurrent ? (
                <span className="ml-2 text-xs font-normal text-[var(--muted)]">
                  actual
                </span>
              ) : null}
            </p>
            <p className="text-sm text-[var(--muted)]">{meta.rangeLabel}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--muted)]">
            <span>
              {items.length} novedad{items.length === 1 ? "" : "es"}
            </span>
            {pendingCount > 0 ? (
              <Badge tone="warn">
                {pendingCount} pendiente{pendingCount === 1 ? "" : "s"}
              </Badge>
            ) : null}
          </div>
        </div>
      </summary>
      <div className="space-y-3 border-t border-[var(--line)] px-4 py-3">
        {items.map((n) => (
          <NoveltyCard
            key={n.id}
            novelty={n}
            canApprove={canApprove}
            pending={pending}
            startTransition={startTransition}
          />
        ))}
      </div>
    </details>
  );
}

function NoveltyCard({
  novelty: n,
  canApprove,
  pending,
  startTransition,
}: {
  novelty: NoveltyRow;
  canApprove: boolean;
  pending: boolean;
  startTransition: (fn: () => void | Promise<void>) => void;
}) {
  return (
    <article className="rounded-lg border border-[var(--line)] bg-[var(--bg)]/40 p-4">
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
                notifyPendingActionsChanged();
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
                notifyPendingActionsChanged();
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
  );
}
