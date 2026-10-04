"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  calculatePayrollPeriodAction,
  createPayrollPeriodAction,
  emitPayrollPeriodAction,
} from "../payroll-ops-actions";
import { Badge } from "@/components/ui/primitives";
import { formatCOP } from "@/lib/money";
import { formatDateCO } from "@/lib/dates";

const inputClass =
  "w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none ring-[var(--accent)] focus:ring-2";

export type PeriodRow = {
  id: string;
  period_year: number;
  period_month: number;
  period_half: number;
  period_start: string;
  period_end: string;
  status: string;
  calculated_at: string | null;
  emitted_at: string | null;
};

const STATUS_TONE: Record<string, "neutral" | "ok" | "warn" | "info"> = {
  BORRADOR: "neutral",
  CALCULADA: "info",
  EMITIDA: "ok",
  CERRADA: "warn",
};

export function CreatePeriodForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const now = new Date();

  return (
    <form
      className="space-y-4 rounded-xl border border-[var(--line)] bg-white p-5"
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const r = await createPayrollPeriodAction(fd);
          if (!r.ok) setError(r.error ?? "Error");
          else if (r.id) router.push(`/personal/liquidacion/${r.id}`);
        });
      }}
    >
      <h3 className="font-medium">Nueva liquidación quincenal</h3>
      <p className="text-sm text-[var(--muted)]">
        Cree el periodo; luego calcule con empleados activos + novedades aprobadas
        y emita el paquete a Contabilidad/RRHH, Tesorería y SST.
      </p>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Año</span>
          <input
            type="number"
            name="period_year"
            defaultValue={now.getFullYear()}
            required
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Mes</span>
          <input
            type="number"
            name="period_month"
            min={1}
            max={12}
            defaultValue={now.getMonth() + 1}
            required
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Quincena</span>
          <select
            name="period_half"
            defaultValue={now.getDate() <= 15 ? 1 : 2}
            className={inputClass}
          >
            <option value={1}>1ª (1–15)</option>
            <option value={2}>2ª (16–fin)</option>
          </select>
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
        {pending ? "Creando…" : "Crear quincena"}
      </button>
    </form>
  );
}

export function PeriodsList({ periods }: { periods: PeriodRow[] }) {
  if (periods.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">
        Aún no hay liquidaciones. Cree la primera quincena.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {periods.map((p) => (
        <Link
          key={p.id}
          href={`/personal/liquidacion/${p.id}`}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-white p-4 hover:border-[var(--ink)]"
        >
          <div>
            <p className="font-medium">
              {p.period_half === 1 ? "1ª" : "2ª"} quincena{" "}
              {String(p.period_month).padStart(2, "0")}/{p.period_year}
            </p>
            <p className="text-sm text-[var(--muted)]">
              {formatDateCO(p.period_start)} → {formatDateCO(p.period_end)}
            </p>
          </div>
          <Badge tone={STATUS_TONE[p.status] ?? "neutral"}>{p.status}</Badge>
        </Link>
      ))}
    </div>
  );
}

export type LineRow = {
  id: string;
  employee_id: string;
  employee_name: string;
  position_title: string | null;
  novelty_count: number;
  net_pay: number | string;
  employer_cost: number | string;
  earnings_total: number | string;
  deductions_total: number | string;
  snapshot: Record<string, unknown> | null;
};

export function PeriodDetailClient({
  period,
  lines,
}: {
  period: PeriodRow;
  lines: LineRow[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [openId, setOpenId] = useState<string | null>(null);

  const totalNet = lines.reduce((a, l) => a + Number(l.net_pay || 0), 0);
  const totalCost = lines.reduce((a, l) => a + Number(l.employer_cost || 0), 0);
  const totalNov = lines.reduce((a, l) => a + (l.novelty_count || 0), 0);
  const locked = period.status === "EMITIDA" || period.status === "CERRADA";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/personal/liquidacion"
            className="text-sm text-[var(--muted)] hover:text-[var(--ink)]"
          >
            ← Liquidaciones
          </Link>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
            {period.period_half === 1 ? "1ª" : "2ª"} quincena{" "}
            {String(period.period_month).padStart(2, "0")}/{period.period_year}
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {formatDateCO(period.period_start)} → {formatDateCO(period.period_end)}
          </p>
        </div>
        <Badge tone={STATUS_TONE[period.status] ?? "neutral"}>
          {period.status}
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-[var(--line)] bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
            Neto a pagar
          </p>
          <p className="mt-2 font-display text-2xl font-bold">
            {formatCOP(totalNet)}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--line)] bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
            Costo empresa
          </p>
          <p className="mt-2 font-display text-2xl font-bold">
            {formatCOP(totalCost)}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--line)] bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
            Empleados / novedades
          </p>
          <p className="mt-2 font-display text-2xl font-bold">
            {lines.length} / {totalNov}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {!locked ? (
          <button
            type="button"
            disabled={pending}
            className="rounded-lg bg-[var(--ink)] px-4 py-2 text-sm text-white"
            onClick={() => {
              setError(null);
              setOk(null);
              startTransition(async () => {
                const r = await calculatePayrollPeriodAction(period.id);
                if (!r.ok) setError(r.error ?? "Error");
                else setOk("Liquidación calculada");
              });
            }}
          >
            {period.status === "BORRADOR" ? "Calcular" : "Recalcular"}
          </button>
        ) : null}
        {period.status === "CALCULADA" ? (
          <button
            type="button"
            disabled={pending}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm text-white"
            onClick={() => {
              if (
                !confirm(
                  "¿Emitir paquete a Contabilidad/RRHH, Tesorería y SST? Quedará inmutable.",
                )
              )
                return;
              setError(null);
              setOk(null);
              startTransition(async () => {
                const r = await emitPayrollPeriodAction(period.id);
                if (!r.ok) setError(r.error ?? "Error");
                else
                  setOk(
                    "Paquete emitido. Listo para control y ejecución departamental.",
                  );
              });
            }}
          >
            Emitir a departamentos
          </button>
        ) : null}
      </div>

      {period.status === "EMITIDA" ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Paquete emitido
          {period.emitted_at ? ` el ${formatDateCO(period.emitted_at)}` : ""}.
          Use este detalle como fuente para Contabilidad/RRHH, Tesorería y SST.
        </p>
      ) : null}
      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}
      {ok ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{ok}</p>
      ) : null}

      <div className="space-y-2">
        {lines.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            Sin líneas. Pulse Calcular para liquidar empleados activos.
          </p>
        ) : (
          lines.map((l) => {
            const snap = l.snapshot as {
              earnings?: { total?: number };
              deductions?: { total?: number };
              novelties?: { count?: number };
              notes?: string[];
            } | null;
            const open = openId === l.id;
            return (
              <article
                key={l.id}
                className="rounded-xl border border-[var(--line)] bg-white p-4"
              >
                <button
                  type="button"
                  className="flex w-full flex-wrap items-start justify-between gap-3 text-left"
                  onClick={() => setOpenId(open ? null : l.id)}
                >
                  <div>
                    <p className="font-medium">{l.employee_name}</p>
                    <p className="text-sm text-[var(--muted)]">
                      {l.position_title || "Sin cargo"} · {l.novelty_count}{" "}
                      novedad(es)
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    <p>
                      Neto: <strong>{formatCOP(l.net_pay)}</strong>
                    </p>
                    <p className="text-[var(--muted)]">
                      Costo: {formatCOP(l.employer_cost)}
                    </p>
                  </div>
                </button>
                {open && snap ? (
                  <div className="mt-3 space-y-1 border-t border-[var(--line)] pt-3 text-sm">
                    <p>Devengos: {formatCOP(snap.earnings?.total ?? l.earnings_total)}</p>
                    <p>
                      Deducciones:{" "}
                      {formatCOP(snap.deductions?.total ?? l.deductions_total)}
                    </p>
                    {(snap.notes ?? []).slice(0, 4).map((n) => (
                      <p key={n} className="text-xs text-[var(--muted)]">
                        · {n}
                      </p>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
