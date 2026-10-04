"use client";

import { useState, useTransition } from "react";
import {
  approvePaymentRequestAction,
  createInternalPaymentRequestAction,
  createInvoicePaymentRequestAction,
  payPaymentRequestAction,
  rejectPaymentRequestAction,
  softDeletePaymentRequestAction,
} from "./actions";
import { Badge } from "@/components/ui/primitives";
import { formatCOP } from "@/lib/money";
import { formatDateCO, todayInBogota } from "@/lib/dates";

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

function sourceLabel(source: string) {
  if (source === "FACTURA_PROVEEDOR") return "Factura proveedor";
  if (source === "GASTO") return "Gasto";
  return "Solicitud interna";
}

function statusTone(status: string) {
  if (status === "PAGADA" || status === "EN_COLA_PAGO" || status === "APROBADA")
    return "ok" as const;
  if (status === "RECHAZADA" || status === "ANULADA") return "danger" as const;
  return "warn" as const;
}

function priorityTone(priority: string) {
  if (priority === "CRITICA") return "danger" as const;
  if (priority === "ALTA") return "warn" as const;
  return "neutral" as const;
}

function PrioritySelect({ defaultValue = "NORMAL" }: { defaultValue?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block text-[var(--muted)]">Prioridad</span>
      <select name="priority" defaultValue={defaultValue} className={inputClass}>
        <option value="CRITICA">Crítica</option>
        <option value="ALTA">Alta</option>
        <option value="NORMAL">Normal</option>
        <option value="BAJA">Baja</option>
      </select>
    </label>
  );
}

export function CreateInternalRequestForm({
  suppliers,
}: {
  suppliers: SupplierOption[];
}) {
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
        Nueva solicitud
      </button>
    );
  }

  return (
    <form
      className="space-y-4 rounded-xl border border-[var(--line)] bg-white p-5"
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const r = await createInternalPaymentRequestAction(fd);
          if (!r.ok) setError(r.error ?? "Error");
          else setOpen(false);
        });
      }}
    >
      <div className="flex justify-between">
        <h3 className="font-medium">Solicitud interna de pago</h3>
        <button type="button" className="text-sm text-[var(--muted)]" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-sm md:col-span-2">
          <span className="mb-1.5 block text-[var(--muted)]">Concepto *</span>
          <input name="concept" required className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Monto *</span>
          <input name="amount" required className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Fecha solicitud</span>
          <input
            type="date"
            name="requested_at"
            defaultValue={todayInBogota()}
            required
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Vence</span>
          <input type="date" name="due_date" className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Proveedor (opcional)</span>
          <select name="supplier_id" className={inputClass}>
            <option value="">—</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <PrioritySelect />
        <label className="block text-sm md:col-span-2">
          <span className="mb-1.5 block text-[var(--muted)]">Notas</span>
          <textarea name="notes" rows={2} className={inputClass} />
        </label>
        <label className="flex items-center gap-2 text-sm md:col-span-2">
          <input type="checkbox" name="create_expense" value="true" />
          Crear gasto administrativo al aprobar
        </label>
      </div>
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[var(--ink)] px-5 py-2.5 text-sm text-white disabled:opacity-60"
      >
        {pending ? "Guardando…" : "Enviar a revisión"}
      </button>
    </form>
  );
}

export function CreateInvoiceRequestForm({
  suppliers,
}: {
  suppliers: SupplierOption[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-[var(--line)] px-4 py-2.5 text-sm"
      >
        Registrar factura
      </button>
    );
  }

  return (
    <form
      className="space-y-4 rounded-xl border border-[var(--line)] bg-white p-5"
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const r = await createInvoicePaymentRequestAction(fd);
          if (!r.ok) setError(r.error ?? "Error");
          else setOpen(false);
        });
      }}
    >
      <div className="flex justify-between">
        <h3 className="font-medium">Factura de proveedor</h3>
        <button type="button" className="text-sm text-[var(--muted)]" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-sm md:col-span-2">
          <span className="mb-1.5 block text-[var(--muted)]">Proveedor *</span>
          <select name="supplier_id" required className={inputClass}>
            <option value="">Seleccione…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm md:col-span-2">
          <span className="mb-1.5 block text-[var(--muted)]">Concepto *</span>
          <input name="concept" required className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Monto *</span>
          <input name="amount" required className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Tipo documento</span>
          <select name="document_type" defaultValue="FACTURA" className={inputClass}>
            <option value="FACTURA">Factura</option>
            <option value="CUENTA_DE_COBRO">Cuenta de cobro</option>
            <option value="NOTA">Nota</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Número</span>
          <input name="document_number" className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Fecha emisión</span>
          <input type="date" name="issue_date" defaultValue={todayInBogota()} className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Vence</span>
          <input type="date" name="due_date" className={inputClass} />
        </label>
        <input type="hidden" name="requested_at" value={todayInBogota()} />
        <PrioritySelect />
        <label className="block text-sm md:col-span-2">
          <span className="mb-1.5 block text-[var(--muted)]">Notas</span>
          <textarea name="notes" rows={2} className={inputClass} />
        </label>
      </div>
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[var(--ink)] px-5 py-2.5 text-sm text-white disabled:opacity-60"
      >
        {pending ? "Guardando…" : "Enviar a aprobación"}
      </button>
    </form>
  );
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
      className="mt-3 grid gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3 md:grid-cols-4"
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const r = await payPaymentRequestAction(requestId, fd);
          if (!r.ok) setError(r.error ?? "Error");
        });
      }}
    >
      <label className="block text-sm md:col-span-2">
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
      <label className="block text-sm">
        <span className="mb-1 block text-[var(--muted)]">Fecha</span>
        <input
          type="date"
          name="payment_date"
          defaultValue={todayInBogota()}
          required
          className={inputClass}
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-[var(--muted)]">Monto</span>
        <input name="amount" defaultValue={String(defaultAmount)} className={inputClass} />
      </label>
      <label className="block text-sm md:col-span-3">
        <span className="mb-1 block text-[var(--muted)]">Referencia</span>
        <input name="payment_reference" className={inputClass} />
      </label>
      <div className="flex items-end">
        <button
          type="submit"
          disabled={pending || bankAccounts.length === 0}
          className="w-full rounded-lg bg-[var(--ink)] px-3 py-2 text-sm text-white disabled:opacity-60"
        >
          {pending ? "Pagando…" : "Registrar pago"}
        </button>
      </div>
      {error ? (
        <p className="md:col-span-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}
      {bankAccounts.length === 0 ? (
        <p className="md:col-span-4 text-sm text-[var(--muted)]">
          Configure una cuenta en Tesorería para poder pagar.
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
        className="rounded-lg px-3 py-1.5 text-sm text-red-700"
        onClick={() => setOpen(true)}
      >
        Rechazar
      </button>
    );
  }

  return (
    <form
      className="mt-2 flex flex-wrap items-end gap-2"
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const r = await rejectPaymentRequestAction(requestId, fd);
          if (!r.ok) setError(r.error ?? "Error");
          else setOpen(false);
        });
      }}
    >
      <input
        name="rejection_reason"
        required
        placeholder="Motivo del rechazo"
        className={`${inputClass} min-w-[220px]`}
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700"
      >
        Confirmar rechazo
      </button>
      <button type="button" className="text-sm text-[var(--muted)]" onClick={() => setOpen(false)}>
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
  canCreate,
}: {
  request: PaymentRequestRow;
  supplierName?: string;
  bankAccounts: BankAccountOption[];
  canApprove: boolean;
  canPay: boolean;
  canCreate: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const inReview = request.status === "EN_REVISION" || request.status === "BORRADOR";
  const inPayQueue = request.status === "EN_COLA_PAGO" || request.status === "APROBADA";

  return (
    <article className="rounded-xl border border-[var(--line)] bg-white px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">{request.concept}</p>
          <p className="text-sm text-[var(--muted)]">
            {sourceLabel(request.source)}
            {supplierName ? ` · ${supplierName}` : ""}
            {request.document_number
              ? ` · ${request.document_type ?? "Doc"} ${request.document_number}`
              : ""}
            {" · "}
            {formatDateCO(request.requested_at)}
            {request.due_date ? ` · vence ${formatDateCO(request.due_date)}` : ""}
          </p>
          {request.notes ? (
            <p className="mt-1 text-sm text-[var(--muted)]">{request.notes}</p>
          ) : null}
          {request.rejection_reason ? (
            <p className="mt-1 text-sm text-red-700">Rechazo: {request.rejection_reason}</p>
          ) : null}
          {request.paid_at ? (
            <p className="mt-1 text-sm text-[var(--muted)]">
              Pagada {formatDateCO(request.paid_at)}
              {request.payment_reference ? ` · ref. ${request.payment_reference}` : ""}
            </p>
          ) : null}
        </div>
        <div className="text-right">
          <p className="font-medium">{formatCOP(request.amount)}</p>
          <div className="mt-1 flex flex-wrap justify-end gap-1">
            <Badge tone={statusTone(request.status)}>{request.status}</Badge>
            <Badge tone={priorityTone(request.priority)}>{request.priority}</Badge>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {inReview && canApprove ? (
          <>
            <button
              type="button"
              disabled={pending}
              className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm"
              onClick={() =>
                startTransition(async () => {
                  await approvePaymentRequestAction(request.id);
                })
              }
            >
              Aprobar → cola tesorería
            </button>
            <RejectForm requestId={request.id} />
          </>
        ) : null}
        {inReview && canCreate ? (
          <button
            type="button"
            disabled={pending}
            className="rounded-lg px-3 py-1.5 text-sm text-red-700"
            onClick={() => {
              if (!confirm("¿Anular esta solicitud?")) return;
              startTransition(async () => {
                await softDeletePaymentRequestAction(request.id);
              });
            }}
          >
            Anular
          </button>
        ) : null}
      </div>

      {inPayQueue && canPay ? (
        <PayForm
          requestId={request.id}
          defaultAmount={request.amount}
          bankAccounts={bankAccounts}
        />
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
  canCreate,
}: {
  review: PaymentRequestRow[];
  payQueue: PaymentRequestRow[];
  history: PaymentRequestRow[];
  suppliers: SupplierOption[];
  bankAccounts: BankAccountOption[];
  canApprove: boolean;
  canPay: boolean;
  canCreate: boolean;
}) {
  const supplierMap = new Map(suppliers.map((s) => [s.id, s.name]));

  const sections = [
    { key: "review", title: "Por aprobar", items: review },
    { key: "pay", title: "Por pagar (tesorería)", items: payQueue },
    { key: "history", title: "Histórico", items: history },
  ] as const;

  return (
    <div className="space-y-8">
      {sections.map((section) => (
        <section key={section.key} className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="font-medium">{section.title}</h3>
            <span className="text-sm text-[var(--muted)]">{section.items.length}</span>
          </div>
          {section.items.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[var(--line)] px-4 py-6 text-sm text-[var(--muted)]">
              Sin solicitudes en esta cola.
            </p>
          ) : (
            section.items.map((r) => (
              <RequestCard
                key={r.id}
                request={r}
                supplierName={r.supplier_id ? supplierMap.get(r.supplier_id) : undefined}
                bankAccounts={bankAccounts}
                canApprove={canApprove}
                canPay={canPay}
                canCreate={canCreate}
              />
            ))
          )}
        </section>
      ))}
    </div>
  );
}
