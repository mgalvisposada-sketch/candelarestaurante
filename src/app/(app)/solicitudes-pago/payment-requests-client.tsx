"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  approvePaymentRequestAction,
  payPaymentRequestAction,
  rejectPaymentRequestAction,
  softDeletePaymentRequestAction,
} from "./actions";
import { notifyPendingActionsChanged } from "@/components/layout/pending-actions-inbox";
import { Badge } from "@/components/ui/primitives";
import { formatCOP, money } from "@/lib/money";
import { formatDateCO, todayInBogota } from "@/lib/dates";
import { cn } from "@/lib/utils";

export type SupplierOption = { id: string; name: string };
export type BankAccountOption = {
  id: string;
  bank_name: string;
  masked_number: string | null;
};
export type PaymentRequestRow = {
  id: string;
  source: string;
  status: string;
  priority: string;
  concept: string;
  amount: number | string;
  requested_at: string;
  due_date: string | null;
  supplier_id: string | null;
  document_number: string | null;
  document_type: string | null;
  notes: string | null;
  rejection_reason: string | null;
  paid_at: string | null;
  payment_reference: string | null;
};

const inputClass =
  "w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none ring-[var(--accent)] focus:ring-2";

type QueueKey = "review" | "pay" | "history";

function sourceMeta(source: string) {
  if (source === "FACTURA_PROVEEDOR") {
    return { label: "Costo / CxP", tone: "info" as const, href: "/proveedores/cxp" };
  }
  if (source === "GASTO") {
    return { label: "Gasto", tone: "accent" as const, href: "/gastos" };
  }
  return { label: "Interna", tone: "neutral" as const, href: null };
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    BORRADOR: "Borrador",
    EN_REVISION: "Por aprobar",
    APROBADA: "Aprobada",
    EN_COLA_PAGO: "Por pagar",
    PAGADA: "Pagada",
    RECHAZADA: "Rechazada",
    ANULADA: "Anulada",
  };
  return map[status] ?? status;
}

function statusTone(status: string) {
  if (status === "PAGADA") return "ok" as const;
  if (status === "EN_COLA_PAGO" || status === "APROBADA") return "info" as const;
  if (status === "RECHAZADA" || status === "ANULADA") return "danger" as const;
  return "warn" as const;
}

function priorityLabel(priority: string) {
  const map: Record<string, string> = {
    CRITICA: "Crítica",
    ALTA: "Alta",
    NORMAL: "Normal",
    BAJA: "Baja",
  };
  return map[priority] ?? priority;
}

function priorityTone(priority: string) {
  if (priority === "CRITICA") return "danger" as const;
  if (priority === "ALTA") return "warn" as const;
  return "neutral" as const;
}

function isOverdue(dueDate: string | null, status: string) {
  if (!dueDate) return false;
  if (["PAGADA", "RECHAZADA", "ANULADA"].includes(status)) return false;
  return dueDate < todayInBogota();
}

function PayForm({
  requestId,
  defaultAmount,
  bankAccounts,
}: {
  requestId: string;
  defaultAmount: number | string;
  bankAccounts: BankAccountOption[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="mt-4 grid gap-3 rounded-lg border border-[var(--line)] bg-neutral-50/80 p-4 md:grid-cols-12"
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const r = await payPaymentRequestAction(requestId, fd);
          if (!r.ok) setError(r.error ?? "Error");
          else notifyPendingActionsChanged();
        });
      }}
    >
      <p className="md:col-span-12 text-xs font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
        Registrar pago
      </p>
      <label className="block text-sm md:col-span-5">
        <span className="mb-1 block text-[var(--muted)]">Cuenta *</span>
        <select name="bank_account_id" required className={inputClass}>
          <option value="">Seleccione…</option>
          {bankAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.bank_name}
              {a.masked_number ? ` · ${a.masked_number}` : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm md:col-span-3">
        <span className="mb-1 block text-[var(--muted)]">Fecha</span>
        <input
          type="date"
          name="payment_date"
          defaultValue={todayInBogota()}
          required
          className={inputClass}
        />
      </label>
      <label className="block text-sm md:col-span-4">
        <span className="mb-1 block text-[var(--muted)]">Monto</span>
        <input name="amount" defaultValue={String(defaultAmount)} className={inputClass} />
      </label>
      <label className="block text-sm md:col-span-8">
        <span className="mb-1 block text-[var(--muted)]">Referencia</span>
        <input
          name="payment_reference"
          placeholder="Nº transferencia o comprobante"
          className={inputClass}
        />
      </label>
      <div className="flex items-end md:col-span-4">
        <button
          type="submit"
          disabled={pending || bankAccounts.length === 0}
          className="w-full rounded-lg bg-[var(--ink)] px-3 py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Pagando…" : "Confirmar pago"}
        </button>
      </div>
      {error ? (
        <p className="md:col-span-12 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {bankAccounts.length === 0 ? (
        <p className="md:col-span-12 text-sm text-[var(--muted)]">
          Configure una cuenta en{" "}
          <Link href="/tesoreria" className="underline">
            Tesorería
          </Link>{" "}
          para poder pagar.
        </p>
      ) : null}
    </form>
  );
}

function RejectForm({ requestId }: { requestId: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
        onClick={() => setOpen(true)}
      >
        Rechazar
      </button>
    );
  }

  return (
    <form
      className="mt-3 flex w-full flex-wrap items-end gap-2 rounded-lg border border-red-100 bg-red-50/50 p-3"
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const r = await rejectPaymentRequestAction(requestId, fd);
          if (!r.ok) setError(r.error ?? "Error");
          else {
            setOpen(false);
            notifyPendingActionsChanged();
          }
        });
      }}
    >
      <label className="min-w-[220px] flex-1 text-sm">
        <span className="mb-1 block text-[var(--muted)]">Motivo del rechazo</span>
        <input
          name="rejection_reason"
          required
          placeholder="Indique el motivo"
          className={inputClass}
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-red-700 px-3 py-2 text-sm text-white disabled:opacity-60"
      >
        Confirmar rechazo
      </button>
      <button
        type="button"
        className="rounded-lg px-3 py-2 text-sm text-[var(--muted)]"
        onClick={() => setOpen(false)}
      >
        Cancelar
      </button>
      {error ? <p className="w-full text-sm text-red-700">{error}</p> : null}
    </form>
  );
}

function RequestCard({
  request,
  supplierName,
  bankAccounts,
  canApprove,
  canPay,
  queue,
}: {
  request: PaymentRequestRow;
  supplierName?: string;
  bankAccounts: BankAccountOption[];
  canApprove: boolean;
  canPay: boolean;
  queue: QueueKey;
}) {
  const [pending, startTransition] = useTransition();
  const [payOpen, setPayOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const source = sourceMeta(request.source);
  const overdue = isOverdue(request.due_date, request.status);
  const inReview = queue === "review";
  const inPayQueue = queue === "pay";

  return (
    <article
      className={cn(
        "rounded-xl border bg-white p-4 shadow-[0_1px_0_rgba(18,18,18,0.03)] transition",
        overdue ? "border-red-200" : "border-[var(--line)]",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={source.tone}>{source.label}</Badge>
            <Badge tone={priorityTone(request.priority)}>
              Prioridad {priorityLabel(request.priority)}
            </Badge>
            <Badge tone={statusTone(request.status)}>
              {statusLabel(request.status)}
            </Badge>
            {overdue ? <Badge tone="danger">Vencida</Badge> : null}
          </div>
          <h3 className="font-medium leading-snug text-[var(--ink)]">
            {request.concept}
          </h3>
          <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--muted)]">
            {supplierName ? (
              <div>
                <dt className="sr-only">Proveedor</dt>
                <dd>{supplierName}</dd>
              </div>
            ) : null}
            {request.document_number ? (
              <div>
                <dt className="sr-only">Documento</dt>
                <dd>
                  {request.document_type ?? "Doc"} {request.document_number}
                </dd>
              </div>
            ) : null}
            <div>
              <dt className="sr-only">Solicitada</dt>
              <dd>Solicitada {formatDateCO(request.requested_at)}</dd>
            </div>
            {request.due_date ? (
              <div className={overdue ? "font-medium text-red-700" : undefined}>
                <dt className="sr-only">Vence</dt>
                <dd>Vence {formatDateCO(request.due_date)}</dd>
              </div>
            ) : null}
          </dl>
          {request.notes ? (
            <p className="text-sm text-[var(--muted)]">{request.notes}</p>
          ) : null}
          {request.rejection_reason ? (
            <p className="rounded-md bg-red-50 px-2.5 py-1.5 text-sm text-red-800">
              Rechazo: {request.rejection_reason}
            </p>
          ) : null}
          {request.paid_at ? (
            <p className="text-sm text-[var(--muted)]">
              Pagada {formatDateCO(request.paid_at)}
              {request.payment_reference
                ? ` · ref. ${request.payment_reference}`
                : ""}
            </p>
          ) : null}
        </div>
        <div className="text-right">
          <p className="font-display text-2xl font-semibold tracking-tight">
            {formatCOP(request.amount)}
          </p>
          {source.href ? (
            <Link
              href={source.href}
              className="mt-1 inline-block text-xs text-[var(--muted)] underline"
            >
              Ver origen
            </Link>
          ) : null}
        </div>
      </div>

      {inReview && canApprove ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-3">
          <button
            type="button"
            disabled={pending}
            className="rounded-lg bg-[var(--ink)] px-3.5 py-2 text-sm font-medium text-white disabled:opacity-60"
            onClick={() => {
              setActionError(null);
              startTransition(async () => {
                const r = await approvePaymentRequestAction(request.id);
                if (!r.ok) setActionError(r.error ?? "Error");
                else notifyPendingActionsChanged();
              });
            }}
          >
            Aprobar → cola de pago
          </button>
          <RejectForm requestId={request.id} />
          <button
            type="button"
            disabled={pending}
            className="rounded-lg px-3 py-2 text-sm text-[var(--muted)] hover:text-red-700 disabled:opacity-60"
            onClick={() => {
              if (!confirm("¿Anular esta solicitud?")) return;
              setActionError(null);
              startTransition(async () => {
                const r = await softDeletePaymentRequestAction(request.id);
                if (!r.ok) setActionError(r.error ?? "Error");
                else notifyPendingActionsChanged();
              });
            }}
          >
            Anular
          </button>
          {actionError ? (
            <p className="w-full text-sm text-red-700">{actionError}</p>
          ) : null}
        </div>
      ) : null}

      {inPayQueue && canPay ? (
        <div className="mt-4 border-t border-[var(--line)] pt-3">
          {!payOpen ? (
            <button
              type="button"
              className="rounded-lg bg-[var(--accent)] px-3.5 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)]"
              onClick={() => setPayOpen(true)}
            >
              Pagar
            </button>
          ) : (
            <>
              <button
                type="button"
                className="mb-1 text-xs text-[var(--muted)] underline"
                onClick={() => setPayOpen(false)}
              >
                Cancelar pago
              </button>
              <PayForm
                requestId={request.id}
                defaultAmount={request.amount}
                bankAccounts={bankAccounts}
              />
            </>
          )}
        </div>
      ) : null}
    </article>
  );
}

export function PaymentRequestQueues({
  review,
  payQueue,
  history,
  suppliers,
  bankAccounts,
  canApprove,
  canPay,
}: {
  review: PaymentRequestRow[];
  payQueue: PaymentRequestRow[];
  history: PaymentRequestRow[];
  suppliers: SupplierOption[];
  bankAccounts: BankAccountOption[];
  canApprove: boolean;
  canPay: boolean;
}) {
  const supplierMap = new Map(suppliers.map((s) => [s.id, s.name]));
  const defaultTab: QueueKey =
    review.length > 0 ? "review" : payQueue.length > 0 ? "pay" : "history";
  const [tab, setTab] = useState<QueueKey>(defaultTab);

  const sections = useMemo(
    () =>
      [
        {
          key: "review" as const,
          title: "Por aprobar",
          hint: "Revisión antes de pasar a tesorería",
          items: review,
        },
        {
          key: "pay" as const,
          title: "Por pagar",
          hint: "Cola de tesorería lista para desembolsar",
          items: payQueue,
        },
        {
          key: "history" as const,
          title: "Histórico",
          hint: "Pagadas, rechazadas o anuladas",
          items: history,
        },
      ] as const,
    [review, payQueue, history],
  );

  const active = sections.find((s) => s.key === tab) ?? sections[0];
  const activeTotal = active.items.reduce(
    (acc, r) => acc.plus(money(r.amount)),
    money(0),
  );

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Colas de solicitudes"
        className="flex flex-wrap gap-1 rounded-xl border border-[var(--line)] bg-neutral-50 p-1"
      >
        {sections.map((section) => {
          const selected = section.key === tab;
          return (
            <button
              key={section.key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setTab(section.key)}
              className={cn(
                "flex min-w-[9rem] flex-1 items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition",
                selected
                  ? "bg-white font-medium text-[var(--ink)] shadow-sm"
                  : "text-[var(--muted)] hover:text-[var(--ink)]",
              )}
            >
              <span>{section.title}</span>
              <span
                className={cn(
                  "rounded-md px-1.5 py-0.5 text-xs tabular-nums",
                  selected ? "bg-neutral-100" : "bg-transparent",
                )}
              >
                {section.items.length}
              </span>
            </button>
          );
        })}
      </div>

      <section className="space-y-3" role="tabpanel">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="font-medium">{active.title}</h3>
            <p className="text-sm text-[var(--muted)]">{active.hint}</p>
          </div>
          {active.items.length > 0 ? (
            <p className="text-sm text-[var(--muted)]">
              {active.items.length}{" "}
              {active.items.length === 1 ? "solicitud" : "solicitudes"} ·{" "}
              <span className="font-medium text-[var(--ink)]">
                {formatCOP(activeTotal)}
              </span>
            </p>
          ) : null}
        </div>

        {active.items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--line)] bg-white/60 px-4 py-10 text-center text-sm text-[var(--muted)]">
            Sin solicitudes en esta cola.
          </p>
        ) : (
          <div className="space-y-3">
            {active.items.map((r) => (
              <RequestCard
                key={r.id}
                request={r}
                supplierName={
                  r.supplier_id ? supplierMap.get(r.supplier_id) : undefined
                }
                bankAccounts={bankAccounts}
                canApprove={canApprove}
                canPay={canPay}
                queue={active.key}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
