"use client";

import { useState, useTransition } from "react";
import {
  createApDocumentAction,
  createSupplierAction,
  registerApPaymentAction,
  softDeleteSupplierAction,
  updateApDocumentAction,
  updateSupplierAction,
} from "./actions";
import { Badge } from "@/components/ui/primitives";
import { formatCOP, money, apDocumentBalance } from "@/lib/money";
import { formatDateCO, todayInBogota } from "@/lib/dates";
import type { VerificationStatus } from "@/types/domain";

export type SupplierRow = {
  id: string;
  name: string;
  tax_id: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  category: string | null;
  bank_account_info: string | null;
  notes: string | null;
  is_active: boolean;
};

export type ApDocRow = {
  id: string;
  supplier_id: string;
  document_type: string;
  document_number: string | null;
  issue_date: string | null;
  due_date: string | null;
  concept: string | null;
  original_amount: number | string;
  paid_amount: number | string;
  status: string;
  priority: string;
  verification_status: VerificationStatus;
  observation: string | null;
  comments: string | null;
  source: string | null;
};

const inputClass =
  "w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none ring-[var(--accent)] focus:ring-2";

function vTone(s: VerificationStatus) {
  if (s === "CONFIRMADO") return "ok" as const;
  if (s === "DECLARADO") return "warn" as const;
  return "danger" as const;
}

function pTone(p: string) {
  if (p === "CRITICA") return "danger" as const;
  if (p === "ALTA") return "warn" as const;
  return "neutral" as const;
}

export function CreateSupplierForm() {
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
        Agregar proveedor
      </button>
    );
  }
  return (
    <form
      className="space-y-4 rounded-xl border border-[var(--line)] bg-white p-5"
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const r = await createSupplierAction(fd);
          if (!r.ok) setError(r.error ?? "Error");
          else setOpen(false);
        });
      }}
    >
      <div className="flex justify-between">
        <h3 className="font-medium">Nuevo proveedor</h3>
        <button type="button" className="text-sm text-[var(--muted)]" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
      <SupplierFields />
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      <button type="submit" disabled={pending} className="rounded-lg bg-[var(--ink)] px-5 py-2.5 text-sm text-white disabled:opacity-60">
        {pending ? "Guardando…" : "Guardar proveedor"}
      </button>
    </form>
  );
}

function SupplierFields({ s }: { s?: SupplierRow }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <label className="block text-sm md:col-span-2">
        <span className="mb-1 block text-[var(--muted)]">Nombre / razón social *</span>
        <input name="name" required defaultValue={s?.name ?? ""} className={inputClass} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-[var(--muted)]">NIT / documento</span>
        <input name="tax_id" defaultValue={s?.tax_id ?? ""} className={inputClass} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-[var(--muted)]">Categoría</span>
        <input name="category" defaultValue={s?.category ?? ""} placeholder="Arriendo, servicios, insumos…" className={inputClass} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-[var(--muted)]">Contacto</span>
        <input name="contact_name" defaultValue={s?.contact_name ?? ""} className={inputClass} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-[var(--muted)]">Teléfono</span>
        <input name="phone" defaultValue={s?.phone ?? ""} className={inputClass} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-[var(--muted)]">Email</span>
        <input name="email" type="email" defaultValue={s?.email ?? ""} className={inputClass} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-[var(--muted)]">Cuenta bancaria</span>
        <input name="bank_account_info" defaultValue={s?.bank_account_info ?? ""} className={inputClass} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-[var(--muted)]">Estado</span>
        <select name="is_active" defaultValue={s?.is_active === false ? "false" : "true"} className={inputClass}>
          <option value="true">Activo</option>
          <option value="false">Inactivo</option>
        </select>
      </label>
      <label className="block text-sm md:col-span-2">
        <span className="mb-1 block text-[var(--muted)]">Observaciones</span>
        <textarea name="notes" rows={2} defaultValue={s?.notes ?? ""} className={inputClass} />
      </label>
    </div>
  );
}

export function CreateApDocumentForm({ suppliers }: { suppliers: SupplierRow[] }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (suppliers.length === 0) return null;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-[var(--line)] px-4 py-2.5 text-sm font-medium">
        Agregar factura / cuenta de cobro
      </button>
    );
  }
  return (
    <form
      className="space-y-4 rounded-xl border border-[var(--line)] bg-white p-5"
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const r = await createApDocumentAction(fd);
          if (!r.ok) setError(r.error ?? "Error");
          else setOpen(false);
        });
      }}
    >
      <div className="flex justify-between">
        <h3 className="font-medium">Documento CxP (saldo inicial o nuevo)</h3>
        <button type="button" className="text-sm text-[var(--muted)]" onClick={() => setOpen(false)}>Cancelar</button>
      </div>
      <ApDocFields suppliers={suppliers} />
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      <button type="submit" disabled={pending} className="rounded-lg bg-[var(--ink)] px-5 py-2.5 text-sm text-white disabled:opacity-60">
        {pending ? "Guardando…" : "Guardar documento"}
      </button>
    </form>
  );
}

function ApDocFields({
  suppliers,
  doc,
}: {
  suppliers: SupplierRow[];
  doc?: ApDocRow;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <label className="block text-sm md:col-span-2">
        <span className="mb-1 block text-[var(--muted)]">Proveedor *</span>
        <select name="supplier_id" required defaultValue={doc?.supplier_id ?? ""} className={inputClass}>
          <option value="" disabled>Seleccione</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-[var(--muted)]">Tipo *</span>
        <select name="document_type" defaultValue={doc?.document_type ?? "FACTURA"} className={inputClass}>
          <option value="FACTURA">Factura</option>
          <option value="CUENTA_DE_COBRO">Cuenta de cobro</option>
          <option value="NOTA">Nota</option>
          <option value="OTRO">Otro</option>
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-[var(--muted)]">Número</span>
        <input name="document_number" defaultValue={doc?.document_number ?? ""} className={inputClass} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-[var(--muted)]">Fecha</span>
        <input type="date" name="issue_date" defaultValue={doc?.issue_date ?? ""} className={inputClass} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-[var(--muted)]">Vencimiento</span>
        <input type="date" name="due_date" defaultValue={doc?.due_date ?? ""} className={inputClass} />
      </label>
      <label className="block text-sm md:col-span-2">
        <span className="mb-1 block text-[var(--muted)]">Concepto</span>
        <input name="concept" defaultValue={doc?.concept ?? ""} className={inputClass} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-[var(--muted)]">Valor original *</span>
        <input name="original_amount" required defaultValue={doc ? String(doc.original_amount) : ""} className={inputClass} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-[var(--muted)]">Ya pagado (saldo inicial)</span>
        <input name="paid_amount" defaultValue={doc ? String(doc.paid_amount) : "0"} className={inputClass} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-[var(--muted)]">Prioridad</span>
        <select name="priority" defaultValue={doc?.priority ?? "POR_VALIDAR"} className={inputClass}>
          <option value="CRITICA">CRITICA</option>
          <option value="ALTA">ALTA</option>
          <option value="NORMAL">NORMAL</option>
          <option value="NEGOCIABLE">NEGOCIABLE</option>
          <option value="POR_VALIDAR">POR_VALIDAR</option>
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-[var(--muted)]">Verificación</span>
        <select name="verification_status" defaultValue={doc?.verification_status ?? "PENDIENTE"} className={inputClass}>
          <option value="PENDIENTE">PENDIENTE</option>
          <option value="DECLARADO">DECLARADO</option>
          <option value="CONFIRMADO">CONFIRMADO</option>
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-[var(--muted)]">Fuente</span>
        <input name="source" defaultValue={doc?.source ?? ""} className={inputClass} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-[var(--muted)]">Observación</span>
        <input name="observation" defaultValue={doc?.observation ?? ""} className={inputClass} />
      </label>
      <label className="block text-sm md:col-span-2">
        <span className="mb-1 block text-[var(--muted)]">Comentarios</span>
        <textarea name="comments" rows={2} defaultValue={doc?.comments ?? ""} className={inputClass} />
      </label>
    </div>
  );
}

export function SupplierCard({
  supplier,
  documents,
}: {
  supplier: SupplierRow;
  documents: ApDocRow[];
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const total = documents.reduce(
    (acc, d) => acc.plus(apDocumentBalance(d.original_amount, d.paid_amount)),
    money(0),
  );

  return (
    <div className="rounded-xl border border-[var(--line)] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-xl font-semibold">{supplier.name}</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {[supplier.tax_id, supplier.category, supplier.contact_name].filter(Boolean).join(" · ") || "Sin detalle"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase text-[var(--muted)]">Saldo</p>
          <p className="font-display text-2xl">{formatCOP(total)}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => setEditing((v) => !v)} className="rounded-md border border-[var(--line)] px-3 py-1.5 text-xs font-medium">
          {editing ? "Cerrar" : "Editar proveedor"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!confirm("¿Desactivar proveedor?")) return;
            startTransition(async () => {
              const r = await softDeleteSupplierAction(supplier.id);
              if (!r.ok) setError(r.error ?? "Error");
            });
          }}
          className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700"
        >
          Desactivar
        </button>
      </div>

      {editing ? (
        <form
          className="mt-4 space-y-3 border-t border-[var(--line)] pt-4"
          action={(fd) => {
            setError(null);
            startTransition(async () => {
              const r = await updateSupplierAction(supplier.id, fd);
              if (!r.ok) setError(r.error ?? "Error");
              else setEditing(false);
            });
          }}
        >
          <SupplierFields s={supplier} />
          <button type="submit" disabled={pending} className="rounded-md bg-[var(--ink)] px-3 py-1.5 text-xs text-white">Guardar</button>
        </form>
      ) : null}

      <div className="mt-5 space-y-3 border-t border-[var(--line)] pt-4">
        <h4 className="text-sm font-medium">Documentos ({documents.length})</h4>
        {documents.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Sin facturas. Agrega documentos CxP arriba.</p>
        ) : (
          documents.map((doc) => (
            <ApDocCard key={doc.id} doc={doc} suppliers={[supplier]} />
          ))
        )}
      </div>
      {error ? <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
    </div>
  );
}

function ApDocCard({ doc, suppliers }: { doc: ApDocRow; suppliers: SupplierRow[] }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const balance = apDocumentBalance(doc.original_amount, doc.paid_amount);

  return (
    <div className="rounded-lg border border-[var(--line)] bg-slate-50 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-sm">
            {doc.document_type} {doc.document_number || ""}
          </p>
          <p className="text-xs text-[var(--muted)]">
            Vence {formatDateCO(doc.due_date)} · {doc.concept || "Sin concepto"}
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          <Badge tone={pTone(doc.priority)}>{doc.priority}</Badge>
          <Badge tone={vTone(doc.verification_status)}>{doc.verification_status}</Badge>
          <Badge tone="neutral">{doc.status}</Badge>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-sm">
        <span>Original: {formatCOP(doc.original_amount)}</span>
        <span>Pagado: {formatCOP(doc.paid_amount)}</span>
        <span className="font-medium">Saldo: {formatCOP(balance)}</span>
      </div>
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={() => setOpen((v) => !v)} className="text-xs font-medium underline">
          {open ? "Cerrar" : "Editar / pagar"}
        </button>
      </div>
      {open ? (
        <div className="mt-3 space-y-4 border-t border-[var(--line)] pt-3">
          <form
            className="space-y-2"
            action={(fd) => {
              setError(null);
              startTransition(async () => {
                const r = await updateApDocumentAction(doc.id, fd);
                if (!r.ok) setError(r.error ?? "Error");
              });
            }}
          >
            <ApDocFields suppliers={suppliers} doc={doc} />
            <button type="submit" disabled={pending} className="rounded-md bg-[var(--ink)] px-3 py-1.5 text-xs text-white">Guardar documento</button>
          </form>
          <form
            className="grid gap-2 rounded-md bg-white p-3 md:grid-cols-3"
            action={(fd) => {
              setError(null);
              startTransition(async () => {
                const r = await registerApPaymentAction(doc.id, fd);
                if (!r.ok) setError(r.error ?? "Error");
              });
            }}
          >
            <p className="text-xs text-[var(--muted)] md:col-span-3">Registrar pago</p>
            <input type="date" name="payment_date" required defaultValue={todayInBogota()} className={inputClass} />
            <input name="amount" required placeholder="Monto" className={inputClass} />
            <input name="reference" placeholder="Referencia" className={inputClass} />
            <button type="submit" disabled={pending} className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs text-white md:col-span-3">
              Aplicar pago
            </button>
          </form>
          {error ? <p className="text-xs text-red-700">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
