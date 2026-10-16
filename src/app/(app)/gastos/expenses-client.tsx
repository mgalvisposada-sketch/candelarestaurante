"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createExpenseAction,
  createExpenseCategoryAction,
  createShiftLiquidationExpenseAction,
  createTipLiquidationExpenseAction,
  softDeleteExpenseAction,
  quickCreateExpenseSupplierAction,
} from "./actions";
import { notifyPendingActionsChanged } from "@/components/layout/pending-actions-inbox";
import { Badge } from "@/components/ui/primitives";
import {
  QuickCreateField,
  QuickCreateSelect,
} from "@/components/ui/quick-create";
import { formatCOP } from "@/lib/money";
import { formatDateCO, todayInBogota } from "@/lib/dates";
import {
  dayNumber,
  daysInQuincena,
  neighboringQuincenas,
  parseQuincenaKey,
  quincenaFromDate,
  shiftWeekdayLabel,
} from "@/lib/payroll/quincena";

export type CategoryRow = { id: string; code: string; name: string };
export type SupplierOption = { id: string; name: string };
export type ShiftEmployeeOption = {
  id: string;
  full_name: string;
  position_title: string | null;
  daily_rate: number | null;
};
export type ExpenseRow = {
  id: string;
  expense_date: string;
  concept: string;
  amount: number | string;
  tax_amount: number | string;
  total_amount: number | string;
  nature: string;
  criticality: string;
  status: string;
  category_id: string | null;
  supplier_id: string | null;
  shared_service: boolean;
  expense_kind?: string | null;
  employee_id?: string | null;
  period_year?: number | null;
  period_month?: number | null;
  period_half?: number | null;
  shift_dates?: string[] | null;
};

const inputClass =
  "w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] outline-none ring-[var(--accent)] focus:ring-2";

function statusTone(s: string) {
  if (s === "PAGADO" || s === "APROBADO") return "ok" as const;
  if (s === "ANULADO") return "danger" as const;
  return "warn" as const;
}

export function CreateExpenseForm({
  categories: initialCategories,
  suppliers: initialSuppliers,
  embedded = false,
}: {
  categories: CategoryRow[];
  suppliers: SupplierOption[];
  embedded?: boolean;
}) {
  const [open, setOpen] = useState(embedded);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [categories, setCategories] = useState(initialCategories);
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [supplierId, setSupplierId] = useState("");
  const [categoryId, setCategoryId] = useState("");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-[var(--solid)] px-4 py-2.5 text-sm font-medium text-[var(--on-solid)]"
      >
        Nueva factura / cuenta de cobro
      </button>
    );
  }
  return (
    <form
      className={
        embedded
          ? "space-y-4"
          : "space-y-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5"
      }
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const r = await createExpenseAction(fd);
          if (!r.ok) setError(r.error ?? "Error");
          else {
            if (!embedded) setOpen(false);
            notifyPendingActionsChanged();
          }
        });
      }}
    >
      {!embedded ? (
        <div className="flex justify-between gap-3">
          <div>
            <h3 className="font-medium">Gasto operativo</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Arriendo, gas, seguridad u otros que no sean compra de insumos. Genera
              una solicitud de pago; el pago se hace allí.
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 text-sm text-[var(--muted)]"
            onClick={() => setOpen(false)}
          >
            Cancelar
          </button>
        </div>
      ) : (
        <p className="text-xs text-[var(--muted)]">
          Arriendo, gas, seguridad u otros que no sean compra de insumos. Genera
          una solicitud de pago; el pago se hace allí.
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <QuickCreateSelect
          name="supplier_id"
          label="Proveedor"
          value={supplierId}
          onChange={setSupplierId}
          options={suppliers.map((s) => ({ id: s.id, label: s.name }))}
          createLabel="Nuevo proveedor"
          createTitle="Alta rápida de proveedor de gastos"
          hint={
            suppliers.length === 0
              ? "Crea uno aquí o márcalo en Proveedores → maestro."
              : undefined
          }
          onCreate={async (fd) => {
            const r = await quickCreateExpenseSupplierAction(fd);
            if (!r.ok || !r.id) {
              return { ok: false, error: r.error ?? "No se pudo crear" };
            }
            const label = r.name ?? String(fd.get("name") ?? "Proveedor");
            setSuppliers((prev) =>
              prev.some((s) => s.id === r.id)
                ? prev
                : [...prev, { id: r.id!, name: label }],
            );
            return { ok: true, id: r.id, label };
          }}
        >
          <QuickCreateField name="name" label="Nombre" required placeholder="Ej. Seguridad Nacional" />
          <QuickCreateField name="tax_id" label="NIT / documento" placeholder="Opcional" />
        </QuickCreateSelect>

        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Tipo documento</span>
          <select name="document_type" defaultValue="FACTURA" className={inputClass}>
            <option value="FACTURA">Factura</option>
            <option value="CUENTA_DE_COBRO">Cuenta de cobro</option>
            <option value="NOTA">Nota</option>
            <option value="OTRO">Otro</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Número</span>
          <input name="document_number" className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Fecha *</span>
          <input
            type="date"
            name="expense_date"
            required
            defaultValue={todayInBogota()}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Vencimiento</span>
          <input type="date" name="due_date" className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Monto a pagar *</span>
          <input name="amount" required className={inputClass} />
        </label>
        <label className="block text-sm md:col-span-2">
          <span className="mb-1.5 block text-[var(--muted)]">Concepto *</span>
          <input name="concept" required className={inputClass} />
        </label>

        <QuickCreateSelect
          name="category_id"
          label="Categoría"
          value={categoryId}
          onChange={setCategoryId}
          options={categories.map((c) => ({
            id: c.id,
            label: `${c.code} — ${c.name}`,
          }))}
          createLabel="Nueva categoría"
          createTitle="Alta rápida de categoría de gasto"
          onCreate={async (fd) => {
            const r = await createExpenseCategoryAction(fd);
            if (!r.ok || !r.id) {
              return { ok: false, error: r.error ?? "No se pudo crear" };
            }
            const code = String(fd.get("code") ?? "").trim().toUpperCase();
            const name = String(fd.get("name") ?? "").trim();
            const label = `${code} — ${name}`;
            setCategories((prev) =>
              prev.some((c) => c.id === r.id)
                ? prev
                : [...prev, { id: r.id!, code, name }],
            );
            return { ok: true, id: r.id, label };
          }}
        >
          <QuickCreateField name="code" label="Código" required placeholder="SEG" />
          <QuickCreateField name="name" label="Nombre" required placeholder="Seguridad" />
        </QuickCreateSelect>

        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Prioridad pago</span>
          <select name="priority" defaultValue="NORMAL" className={inputClass}>
            <option value="CRITICA">Crítica</option>
            <option value="ALTA">Alta</option>
            <option value="NORMAL">Normal</option>
            <option value="BAJA">Baja</option>
          </select>
        </label>
        <label className="block text-sm md:col-span-2">
          <span className="mb-1.5 block text-[var(--muted)]">Notas</span>
          <textarea name="notes" rows={2} className={inputClass} />
        </label>
      </div>
      {error ? (
        <p className="rounded-lg bg-[var(--accent-soft)] px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[var(--solid)] px-5 py-2.5 text-sm text-[var(--on-solid)]"
      >
        {pending ? "Guardando…" : "Guardar y enviar a solicitudes"}
      </button>
    </form>
  );
}

export function CreateShiftLiquidationForm({
  categories: initialCategories,
  employees,
  liquidatedDatesByEmployee = {},
  embedded = false,
}: {
  categories: CategoryRow[];
  employees: ShiftEmployeeOption[];
  /** ISO dates ya liquidados por prestador (gastos activos). */
  liquidatedDatesByEmployee?: Record<string, string[]>;
  embedded?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(embedded);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const current = useMemo(() => quincenaFromDate(todayInBogota()), []);
  const [categories, setCategories] = useState(initialCategories);
  const [categoryId, setCategoryId] = useState("");
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? "");
  const [quincenaKey, setQuincenaKey] = useState(current.key);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const quincenaChoices = useMemo(
    () => neighboringQuincenas(current, 3, 1),
    [current],
  );
  const meta = useMemo(
    () => parseQuincenaKey(quincenaKey) ?? current,
    [quincenaKey, current],
  );
  const days = useMemo(() => daysInQuincena(meta), [meta]);
  const lockedDates = useMemo(() => {
    const all = liquidatedDatesByEmployee[employeeId] ?? [];
    return new Set(all.map(String));
  }, [liquidatedDatesByEmployee, employeeId]);
  const availableDays = useMemo(
    () => days.filter((d) => !lockedDates.has(d)),
    [days, lockedDates],
  );
  const employee = employees.find((e) => e.id === employeeId) ?? null;
  const rate = employee?.daily_rate ?? 0;
  const selectedAvailable = useMemo(
    () => [...selected].filter((d) => !lockedDates.has(d)),
    [selected, lockedDates],
  );
  const estimated = selectedAvailable.length * (rate || 0);
  const lockedInQuincena = days.filter((d) => lockedDates.has(d)).length;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 py-2.5 text-sm font-medium text-[var(--ink)]"
      >
        Liquidación por turno
      </button>
    );
  }

  return (
    <form
      className={
        embedded
          ? "space-y-4"
          : "space-y-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5"
      }
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const r = await createShiftLiquidationExpenseAction(fd);
          if (!r.ok) setError(r.error ?? "Error");
          else {
            if (!embedded) setOpen(false);
            setSelected(new Set());
            notifyPendingActionsChanged();
            router.refresh();
          }
        });
      }}
    >
      <div className="flex justify-between gap-3">
        <div>
          {!embedded ? (
            <h3 className="font-medium">Liquidación por turno</h3>
          ) : null}
          <p className={embedded ? "text-xs text-[var(--muted)]" : "mt-1 text-xs text-[var(--muted)]"}>
            Marque los días del prestador, cree el gasto asociado a esa persona y
            envíelo a Solicitudes de pago (aval gerencia → pago caja/banco).
            Los días ya liquidados quedan bloqueados.
          </p>
        </div>
        {!embedded ? (
          <button
            type="button"
            className="shrink-0 text-sm text-[var(--muted)]"
            onClick={() => {
              setOpen(false);
              setError(null);
            }}
          >
            Cancelar
          </button>
        ) : null}
      </div>

      <input type="hidden" name="period_year" value={meta.year} />
      <input type="hidden" name="period_month" value={meta.month} />
      <input type="hidden" name="period_half" value={meta.half} />
      {selectedAvailable.map((d) => (
        <input key={d} type="hidden" name="dates" value={d} />
      ))}

      {employees.length === 0 ? (
        <p className="rounded-lg bg-[var(--gold-soft)] px-3 py-2 text-sm text-[var(--warn)]">
          No hay empleados activos con contrato por turno.
        </p>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1.5 block text-[var(--muted)]">Prestador *</span>
              <select
                name="employee_id"
                required
                value={employeeId}
                onChange={(e) => {
                  setEmployeeId(e.target.value);
                  setSelected(new Set());
                  setError(null);
                }}
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
              <span className="mb-1.5 block text-[var(--muted)]">Quincena *</span>
              <select
                value={quincenaKey}
                onChange={(e) => {
                  setQuincenaKey(e.target.value);
                  setSelected(new Set());
                  setError(null);
                }}
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
            <label className="block text-sm">
              <span className="mb-1.5 block text-[var(--muted)]">Fecha gasto *</span>
              <input
                type="date"
                name="expense_date"
                required
                defaultValue={todayInBogota()}
                className={inputClass}
              />
            </label>
            <QuickCreateSelect
              name="category_id"
              label="Categoría"
              value={categoryId}
              onChange={setCategoryId}
              options={categories.map((c) => ({
                id: c.id,
                label: `${c.code} — ${c.name}`,
              }))}
              createLabel="Nueva categoría"
              createTitle="Alta rápida de categoría de gasto"
              onCreate={async (fd) => {
                const r = await createExpenseCategoryAction(fd);
                if (!r.ok || !r.id) {
                  return { ok: false, error: r.error ?? "No se pudo crear" };
                }
                const code = String(fd.get("code") ?? "").trim().toUpperCase();
                const name = String(fd.get("name") ?? "").trim();
                const label = `${code} — ${name}`;
                setCategories((prev) =>
                  prev.some((c) => c.id === r.id)
                    ? prev
                    : [...prev, { id: r.id!, code, name }],
                );
                return { ok: true, id: r.id, label };
              }}
            >
              <QuickCreateField name="code" label="Código" required placeholder="PERS" />
              <QuickCreateField name="name" label="Nombre" required placeholder="Personal turno" />
            </QuickCreateSelect>
            <label className="block text-sm">
              <span className="mb-1.5 block text-[var(--muted)]">Prioridad</span>
              <select name="priority" defaultValue="NORMAL" className={inputClass}>
                <option value="CRITICA">Crítica</option>
                <option value="ALTA">Alta</option>
                <option value="NORMAL">Normal</option>
                <option value="BAJA">Baja</option>
              </select>
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="mb-1.5 block text-[var(--muted)]">Notas</span>
              <textarea name="notes" rows={2} className={inputClass} />
            </label>
          </div>

          <p className="text-sm text-[var(--muted)]">{meta.rangeLabel}</p>
          {lockedInQuincena > 0 ? (
            <p className="text-xs text-[var(--muted)]">
              {lockedInQuincena} día{lockedInQuincena === 1 ? "" : "s"} ya
              liquidado{lockedInQuincena === 1 ? "" : "s"} (bloqueados).
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelected(new Set(availableDays))}
              disabled={availableDays.length === 0}
              className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Marcar disponibles
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm"
            >
              Limpiar
            </button>
          </div>

          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-7">
            {days.map((iso) => {
              const locked = lockedDates.has(iso);
              const on = !locked && selected.has(iso);
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={locked}
                  onClick={() => {
                    if (locked) return;
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (next.has(iso)) next.delete(iso);
                      else next.add(iso);
                      return next;
                    });
                  }}
                  className={`rounded-lg border px-2 py-2 text-center text-sm transition-colors ${
                    locked
                      ? "cursor-not-allowed border-[var(--line)] bg-[var(--line)]/40 text-[var(--muted)] opacity-70"
                      : on
                        ? "border-emerald-700 bg-emerald-700 text-white"
                        : "border-[var(--line)] bg-[var(--bg)]/40 text-[var(--ink)]"
                  }`}
                  title={
                    locked
                      ? `${formatDateCO(iso)} · ya liquidado`
                      : formatDateCO(iso)
                  }
                >
                  <span className="block text-[10px] uppercase opacity-80">
                    {shiftWeekdayLabel(iso)}
                  </span>
                  <span className="block text-base font-medium">
                    {dayNumber(iso)}
                  </span>
                  {locked ? (
                    <span className="mt-0.5 block text-[9px] uppercase tracking-wide">
                      Liquidado
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <p className="text-sm text-[var(--muted)]">
            {selectedAvailable.length} día
            {selectedAvailable.length === 1 ? "" : "s"}
            {rate > 0
              ? ` · ${formatCOP(estimated)}`
              : " · configure tarifa en el empleado"}
            {availableDays.length === 0
              ? " · sin días disponibles en esta quincena"
              : ""}
          </p>
        </>
      )}

      {error ? (
        <p className="rounded-lg bg-[var(--accent-soft)] px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={
          pending || employees.length === 0 || selectedAvailable.length === 0
        }
        className="rounded-lg bg-[var(--solid)] px-5 py-2.5 text-sm text-[var(--on-solid)] disabled:opacity-50"
      >
        {pending ? "Guardando…" : "Crear gasto y enviar a aval"}
      </button>
    </form>
  );
}

export function CreateTipLiquidationForm({
  categories: initialCategories,
  liquidatedDates = [],
  embedded = false,
}: {
  categories: CategoryRow[];
  /** ISO dates ya cubiertos por liquidaciones de propina activas. */
  liquidatedDates?: string[];
  embedded?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(embedded);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const current = useMemo(() => quincenaFromDate(todayInBogota()), []);
  const [categories, setCategories] = useState(initialCategories);
  const [categoryId, setCategoryId] = useState("");
  const [quincenaKey, setQuincenaKey] = useState(current.key);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [amount, setAmount] = useState("");

  const quincenaChoices = useMemo(
    () => neighboringQuincenas(current, 3, 1),
    [current],
  );
  const meta = useMemo(
    () => parseQuincenaKey(quincenaKey) ?? current,
    [quincenaKey, current],
  );
  const days = useMemo(() => daysInQuincena(meta), [meta]);
  const lockedDates = useMemo(
    () => new Set(liquidatedDates.map(String)),
    [liquidatedDates],
  );
  const availableDays = useMemo(
    () => days.filter((d) => !lockedDates.has(d)),
    [days, lockedDates],
  );
  const selectedAvailable = useMemo(
    () => [...selected].filter((d) => !lockedDates.has(d)),
    [selected, lockedDates],
  );
  const lockedInQuincena = days.filter((d) => lockedDates.has(d)).length;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 py-2.5 text-sm font-medium text-[var(--ink)]"
      >
        Liquidación de propina
      </button>
    );
  }

  return (
    <form
      className={
        embedded
          ? "space-y-4"
          : "space-y-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5"
      }
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const r = await createTipLiquidationExpenseAction(fd);
          if (!r.ok) setError(r.error ?? "Error");
          else {
            if (!embedded) setOpen(false);
            setSelected(new Set());
            setAmount("");
            notifyPendingActionsChanged();
            router.refresh();
          }
        });
      }}
    >
      <div className="flex justify-between gap-3">
        <div>
          {!embedded ? (
            <h3 className="font-medium">Liquidación de propina</h3>
          ) : null}
          <p
            className={
              embedded
                ? "text-xs text-[var(--muted)]"
                : "mt-1 text-xs text-[var(--muted)]"
            }
          >
            Registra el valor a entregar al personal (normalmente sale de caja) y
            marca los días que cubre esta liquidación. Esos días quedan bloqueados
            para no liquidarlos dos veces.
          </p>
        </div>
        {!embedded ? (
          <button
            type="button"
            className="shrink-0 text-sm text-[var(--muted)]"
            onClick={() => {
              setOpen(false);
              setError(null);
            }}
          >
            Cancelar
          </button>
        ) : null}
      </div>

      {selectedAvailable.map((d) => (
        <input key={d} type="hidden" name="dates" value={d} />
      ))}

      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Quincena *</span>
          <select
            value={quincenaKey}
            onChange={(e) => {
              setQuincenaKey(e.target.value);
              setSelected(new Set());
              setError(null);
            }}
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
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Fecha gasto *</span>
          <input
            type="date"
            name="expense_date"
            required
            defaultValue={todayInBogota()}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">
            Monto a liquidar *
          </span>
          <input
            name="amount"
            required
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Ej. 450000"
            className={inputClass}
          />
        </label>
        <QuickCreateSelect
          name="category_id"
          label="Categoría"
          value={categoryId}
          onChange={setCategoryId}
          options={categories.map((c) => ({
            id: c.id,
            label: `${c.code} — ${c.name}`,
          }))}
          createLabel="Nueva categoría"
          createTitle="Alta rápida de categoría de gasto"
          onCreate={async (fd) => {
            const r = await createExpenseCategoryAction(fd);
            if (!r.ok || !r.id) {
              return { ok: false, error: r.error ?? "No se pudo crear" };
            }
            const code = String(fd.get("code") ?? "").trim().toUpperCase();
            const name = String(fd.get("name") ?? "").trim();
            const label = `${code} — ${name}`;
            setCategories((prev) =>
              prev.some((c) => c.id === r.id)
                ? prev
                : [...prev, { id: r.id!, code, name }],
            );
            return { ok: true, id: r.id, label };
          }}
        >
          <QuickCreateField name="code" label="Código" required placeholder="PROP" />
          <QuickCreateField name="name" label="Nombre" required placeholder="Propinas" />
        </QuickCreateSelect>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Prioridad</span>
          <select name="priority" defaultValue="NORMAL" className={inputClass}>
            <option value="CRITICA">Crítica</option>
            <option value="ALTA">Alta</option>
            <option value="NORMAL">Normal</option>
            <option value="BAJA">Baja</option>
          </select>
        </label>
        <label className="block text-sm md:col-span-2">
          <span className="mb-1.5 block text-[var(--muted)]">Notas</span>
          <textarea
            name="notes"
            rows={2}
            className={inputClass}
            placeholder="Opcional: quién recibe, observaciones de caja…"
          />
        </label>
      </div>

      <p className="text-sm text-[var(--muted)]">{meta.rangeLabel}</p>
      {lockedInQuincena > 0 ? (
        <p className="text-xs text-[var(--muted)]">
          {lockedInQuincena} día{lockedInQuincena === 1 ? "" : "s"} ya
          liquidado{lockedInQuincena === 1 ? "" : "s"} (bloqueados).
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSelected(new Set(availableDays))}
          disabled={availableDays.length === 0}
          className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm disabled:opacity-50"
        >
          Marcar disponibles
        </button>
        <button
          type="button"
          onClick={() => setSelected(new Set())}
          className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm"
        >
          Limpiar
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-7">
        {days.map((iso) => {
          const locked = lockedDates.has(iso);
          const on = !locked && selected.has(iso);
          return (
            <button
              key={iso}
              type="button"
              disabled={locked}
              onClick={() => {
                if (locked) return;
                setSelected((prev) => {
                  const next = new Set(prev);
                  if (next.has(iso)) next.delete(iso);
                  else next.add(iso);
                  return next;
                });
              }}
              className={`rounded-lg border px-2 py-2 text-center text-sm transition-colors ${
                locked
                  ? "cursor-not-allowed border-[var(--line)] bg-[var(--line)]/40 text-[var(--muted)] opacity-70"
                  : on
                    ? "border-amber-700 bg-amber-700 text-white"
                    : "border-[var(--line)] bg-[var(--bg)]/40 text-[var(--ink)]"
              }`}
              title={
                locked
                  ? `${formatDateCO(iso)} · ya liquidado`
                  : formatDateCO(iso)
              }
            >
              <span className="block text-[10px] uppercase opacity-80">
                {shiftWeekdayLabel(iso)}
              </span>
              <span className="block text-base font-medium">
                {dayNumber(iso)}
              </span>
              {locked ? (
                <span className="mt-0.5 block text-[9px] uppercase tracking-wide">
                  Liquidado
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <p className="text-sm text-[var(--muted)]">
        {selectedAvailable.length} día
        {selectedAvailable.length === 1 ? "" : "s"} seleccionado
        {selectedAvailable.length === 1 ? "" : "s"}
        {availableDays.length === 0
          ? " · sin días disponibles en esta quincena"
          : ""}
      </p>

      {error ? (
        <p className="rounded-lg bg-[var(--accent-soft)] px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={
          pending || selectedAvailable.length === 0 || !amount.trim()
        }
        className="rounded-lg bg-[var(--solid)] px-5 py-2.5 text-sm text-[var(--on-solid)] disabled:opacity-50"
      >
        {pending ? "Guardando…" : "Crear gasto y enviar a aval"}
      </button>
    </form>
  );
}

export function ExpenseList({
  expenses,
  categories,
  suppliers,
}: {
  expenses: ExpenseRow[];
  categories: CategoryRow[];
  suppliers: SupplierOption[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const catMap = new Map(categories.map((c) => [c.id, c.name]));
  const supplierMap = new Map(suppliers.map((s) => [s.id, s.name]));

  return (
    <div className="space-y-3">
      {error ? (
        <p className="rounded-lg bg-[var(--accent-soft)] px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}
      {expenses.map((e) => (
        <article
          key={e.id}
          className="rounded-xl border border-[var(--line)] bg-white px-4 py-3"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{e.concept}</p>
                {e.expense_kind === "LIQUIDACION_TURNO" ? (
                  <Badge tone="info">Por turno</Badge>
                ) : null}
                {e.expense_kind === "LIQUIDACION_PROPINA" ? (
                  <Badge tone="warn">Propina</Badge>
                ) : null}
              </div>
              <p className="text-sm text-[var(--muted)]">
                {formatDateCO(e.expense_date)}
                {e.supplier_id && supplierMap.get(e.supplier_id)
                  ? ` · ${supplierMap.get(e.supplier_id)}`
                  : ""}
                {" · "}
                {catMap.get(e.category_id ?? "") ?? "Sin categoría"}
                {Array.isArray(e.shift_dates) && e.shift_dates.length > 0
                  ? ` · ${e.shift_dates.length} día(s)`
                  : ""}
              </p>
            </div>
            <div className="text-right">
              <p className="font-medium">{formatCOP(e.total_amount)}</p>
              <Badge tone={statusTone(e.status)}>{e.status}</Badge>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {e.status !== "PAGADO" && e.status !== "ANULADO" ? (
              <Link
                href="/solicitudes-pago"
                className="text-xs font-medium text-[var(--accent)] underline"
              >
                Gestionar pago →
              </Link>
            ) : null}
            {e.status !== "PAGADO" && e.status !== "ANULADO" ? (
              <button
                type="button"
                disabled={pending}
                className="text-xs text-red-700 disabled:opacity-60"
                onClick={() => {
                  if (!confirm("¿Anular este gasto y su solicitud de pago?")) return;
                  setError(null);
                  startTransition(async () => {
                    const r = await softDeleteExpenseAction(e.id);
                    if (!r.ok) setError(r.error ?? "Error");
                  });
                }}
              >
                Anular
              </button>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}
