"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  createSupplierAction,
  softDeleteApDocumentAction,
  softDeleteSupplierAction,
  updateApDocumentAction,
  updateSupplierAction,
} from "./actions";
import {
  createProductCategoryAction,
  softDeleteProductCategoryAction,
} from "../compras/inventory-actions";
import { Badge } from "@/components/ui/primitives";
import { formatCOP, money, apDocumentBalance } from "@/lib/money";
import { formatDateCO } from "@/lib/dates";
import { compareSuppliersByPriority } from "@/lib/suppliers/priority";
import type { VerificationStatus } from "@/types/domain";

export type ProductCategoryOption = {
  id: string;
  code: string;
  name: string;
};

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
  is_purchase_supplier: boolean;
  purchase_payment_terms?: "CREDITO" | "PREPAGO" | null;
  is_expense_supplier: boolean;
  category_ids: string[];
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

export type ProveedoresCaps = {
  canCreateSupplier: boolean;
  canEditSupplier: boolean;
  canManageCategories: boolean;
  canCreateAp: boolean;
  canEditAp: boolean;
  canPay: boolean;
};

export function CreateCategoryMasterForm({
  canManage = true,
  embedded = false,
}: {
  canManage?: boolean;
  embedded?: boolean;
}) {
  const [open, setOpen] = useState(embedded);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (!canManage) return null;
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-[var(--line)] px-4 py-2.5 text-sm"
      >
        Nueva categoría
      </button>
    );
  }
  return (
    <form
      className={
        embedded
          ? "space-y-3"
          : "space-y-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4"
      }
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const r = await createProductCategoryAction(fd);
          if (!r.ok) setError(r.error ?? "Error");
          else if (!embedded) setOpen(false);
        });
      }}
    >
      <p className="text-sm text-[var(--muted)]">
        Maestro único de categorías (proveedores e inventario de compras).
      </p>
      <input name="code" placeholder="Código (ej. CARNES)" required className={inputClass} />
      <input name="name" placeholder="Nombre" required className={inputClass} />
      <input name="description" placeholder="Descripción" className={inputClass} />
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="rounded-lg bg-[var(--solid)] px-3 py-2 text-sm text-[var(--on-solid)]">
          Guardar categoría
        </button>
        {!embedded ? (
          <button
            type="button"
            className="text-sm text-[var(--muted)]"
            onClick={() => setOpen(false)}
          >
            Cancelar
          </button>
        ) : null}
      </div>
    </form>
  );
}

function CategoryMasterChip({
  category,
  canManage,
}: {
  category: ProductCategoryOption;
  canManage: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <span className="inline-flex max-w-full flex-col gap-1">
      <span className="inline-flex items-center gap-2 rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm">
        <span className="min-w-0">
          <strong>{category.code}</strong> — {category.name}
        </span>
        {canManage ? (
          <button
            type="button"
            disabled={pending}
            className="shrink-0 text-xs text-red-700 disabled:opacity-60"
            onClick={() => {
              if (
                !confirm(
                  `¿Eliminar categoría ${category.code}? Solo si no tiene productos.`,
                )
              ) {
                return;
              }
              setError(null);
              startTransition(async () => {
                const r = await softDeleteProductCategoryAction(category.id);
                if (!r.ok) setError(r.error ?? "Error");
              });
            }}
          >
            Eliminar
          </button>
        ) : null}
      </span>
      {error ? <span className="text-xs text-red-700">{error}</span> : null}
    </span>
  );
}

export function CategoryMasterList({
  categories,
  canManage = false,
}: {
  categories: ProductCategoryOption[];
  canManage?: boolean;
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {categories.map((c) => (
        <CategoryMasterChip key={c.id} category={c} canManage={canManage} />
      ))}
    </div>
  );
}

export function CreateSupplierForm({
  categories,
  canCreate = true,
  embedded = false,
}: {
  categories: ProductCategoryOption[];
  canCreate?: boolean;
  embedded?: boolean;
}) {
  const [open, setOpen] = useState(embedded);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (!canCreate) return null;
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-[var(--solid)] px-4 py-2.5 text-sm font-medium text-[var(--on-solid)]"
      >
        Agregar proveedor
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
          const r = await createSupplierAction(fd);
          if (!r.ok) setError(r.error ?? "Error");
          else if (!embedded) setOpen(false);
        });
      }}
    >
      {!embedded ? (
        <div className="flex justify-between">
          <h3 className="font-medium">Nuevo proveedor</h3>
          <button
            type="button"
            className="text-sm text-[var(--muted)]"
            onClick={() => setOpen(false)}
          >
            Cancelar
          </button>
        </div>
      ) : null}
      <SupplierFields categories={categories} />
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      <button type="submit" disabled={pending} className="rounded-lg bg-[var(--solid)] px-5 py-2.5 text-sm text-[var(--on-solid)] disabled:opacity-60">
        {pending ? "Guardando…" : "Guardar proveedor"}
      </button>
    </form>
  );
}

function CategoryPicker({
  categories,
  selectedIds = [],
}: {
  categories: ProductCategoryOption[];
  selectedIds?: string[];
}) {
  const selected = new Set(selectedIds);
  if (categories.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--line)] px-3 py-3 text-sm text-[var(--muted)]">
        No hay categorías maestras. Cree al menos una con “Nueva categoría” para asignarla al proveedor de insumos.
      </div>
    );
  }
  return (
    <fieldset>
      <legend className="mb-2 text-sm text-[var(--muted)]">
        Categorías de insumo que comercializa *
      </legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {categories.map((c) => (
          <label
            key={c.id}
            className="flex items-center gap-2 rounded-lg border border-[var(--line)] px-3 py-2 text-sm"
          >
            <input
              type="checkbox"
              name="category_ids"
              value={c.id}
              defaultChecked={selected.has(c.id)}
            />
            <span>
              <span className="font-medium">{c.code}</span> — {c.name}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function SupplierFields({
  s,
  categories,
}: {
  s?: SupplierRow;
  categories: ProductCategoryOption[];
}) {
  const [isPurchase, setIsPurchase] = useState(s?.is_purchase_supplier ?? false);
  const [isExpense, setIsExpense] = useState(s?.is_expense_supplier ?? false);

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
        <span className="mb-1 block text-[var(--muted)]">Contacto</span>
        <input name="contact_name" defaultValue={s?.contact_name ?? ""} className={inputClass} />
      </label>
      <label className="flex items-start gap-3 rounded-lg border border-[var(--line)] px-3 py-3 text-sm md:col-span-2">
        <input
          type="checkbox"
          name="is_purchase_supplier"
          value="true"
          checked={isPurchase}
          onChange={(e) => setIsPurchase(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          <span className="font-medium">Proveedor de insumos (compras)</span>
          <span className="mt-0.5 block text-[var(--muted)]">
            Vende productos de inventario. Solo estos aparecen en Compras (con categoría).
          </span>
        </span>
      </label>
      {isPurchase ? (
        <>
          <div className="md:col-span-2">
            <CategoryPicker categories={categories} selectedIds={s?.category_ids ?? []} />
          </div>
          <label className="block text-sm md:col-span-2">
            <span className="mb-1 block text-[var(--muted)]">
              Condición de pago (insumos) *
            </span>
            <select
              name="purchase_payment_terms"
              defaultValue={s?.purchase_payment_terms ?? "PREPAGO"}
              className={inputClass}
            >
              <option value="PREPAGO">
                Prepago — pagar antes de que despachen
              </option>
              <option value="CREDITO">
                Crédito — recibir primero, pagar después
              </option>
            </select>
            <span className="mt-1 block text-xs text-[var(--muted)]">
              La mayoría de proveedores es prepago: factura → pago → recepción.
              Solo marque crédito si realmente despachan sin pago previo.
            </span>
          </label>
        </>
      ) : null}
      <label className="flex items-start gap-3 rounded-lg border border-[var(--line)] px-3 py-3 text-sm md:col-span-2">
        <input
          type="checkbox"
          name="is_expense_supplier"
          value="true"
          checked={isExpense}
          onChange={(e) => setIsExpense(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          <span className="font-medium">Proveedor de gastos (opex)</span>
          <span className="mt-0.5 block text-[var(--muted)]">
            Servicios u otros no inventario (arriendo, gas, seguridad…). Solo estos
            aparecen al registrar en Gastos. Puede marcar ambos si aplica.
          </span>
        </span>
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

function docSortKey(d: ApDocRow): string {
  return d.issue_date || d.due_date || "";
}

function documentTypeLabel(type: string): string {
  if (type === "FACTURA") return "Factura";
  if (type === "CUENTA_DE_COBRO") return "Cuenta de cobro";
  if (type === "NOTA") return "Nota";
  return type || "Documento";
}

function statusTone(status: string) {
  if (status === "PAGADA") return "ok" as const;
  if (status === "PARCIAL") return "warn" as const;
  if (status === "ANULADA") return "neutral" as const;
  return "danger" as const;
}

function statusLabel(status: string): string {
  if (status === "ABIERTA") return "Por pagar";
  if (status === "PARCIAL") return "Parcial";
  if (status === "PAGADA") return "Pagada";
  if (status === "ANULADA") return "Anulada";
  return status;
}

export function SupplierMasterList({
  suppliers,
  categories,
  balanceBySupplier,
  billedBySupplier = {},
  docsCountBySupplier,
  documentsBySupplier = {},
  caps,
}: {
  suppliers: SupplierRow[];
  categories: ProductCategoryOption[];
  balanceBySupplier: Record<string, number>;
  billedBySupplier?: Record<string, number>;
  docsCountBySupplier: Record<string, number>;
  documentsBySupplier?: Record<string, ApDocRow[]>;
  caps: ProveedoresCaps;
}) {
  const [query, setQuery] = useState("");
  const categoryNameById = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = !q
      ? [...suppliers]
      : suppliers.filter((s) => {
          const categoryNames = s.category_ids
            .map((id) => categoryNameById.get(id) ?? "")
            .join(" ");
          const haystack = [
            s.name,
            s.tax_id,
            s.contact_name,
            s.phone,
            s.email,
            s.category,
            s.notes,
            categoryNames,
            s.is_purchase_supplier ? "insumos" : "",
            s.is_expense_supplier ? "gastos administrativo" : "",
            s.is_active ? "activo" : "inactivo",
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return haystack.includes(q);
        });

    return matches.sort((a, b) =>
      compareSuppliersByPriority(a, b, balanceBySupplier, billedBySupplier),
    );
  }, [
    suppliers,
    query,
    categoryNameById,
    balanceBySupplier,
    billedBySupplier,
  ]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-medium">
            {filtered.length === suppliers.length
              ? `${suppliers.length} ${suppliers.length === 1 ? "proveedor" : "proveedores"}`
              : `${filtered.length} de ${suppliers.length} proveedores`}
          </h3>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            Con deuda arriba (se actualiza al pagar). Sin deuda: de más a menos
            comprado
          </p>
        </div>
        <label className="block min-w-[220px] flex-1 sm:max-w-sm">
          <span className="mb-1 block text-sm text-[var(--muted)]">Buscar</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nombre, NIT, contacto, categoría…"
            className={inputClass}
            autoComplete="off"
          />
        </label>
      </div>
      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--line)] bg-white px-4 py-3 text-sm text-[var(--muted)]">
          Ningún proveedor coincide con «{query.trim()}».
        </p>
      ) : (
        filtered.map((s) => (
          <SupplierMasterCard
            key={s.id}
            supplier={s}
            categories={categories}
            openBalance={balanceBySupplier[s.id] ?? 0}
            billedTotal={billedBySupplier[s.id] ?? 0}
            openDocsCount={docsCountBySupplier[s.id] ?? 0}
            documents={documentsBySupplier[s.id] ?? []}
            caps={caps}
          />
        ))
      )}
    </div>
  );
}

type BillingFilter = "todas" | "abiertas" | "pagadas";

function SupplierBillingHistory({ documents }: { documents: ApDocRow[] }) {
  const [filter, setFilter] = useState<BillingFilter>("todas");
  const [expanded, setExpanded] = useState(false);

  const activeDocs = useMemo(
    () => documents.filter((d) => d.status !== "ANULADA"),
    [documents],
  );

  const totals = useMemo(() => {
    let billed = money(0);
    let paid = money(0);
    let open = money(0);
    for (const d of activeDocs) {
      billed = billed.plus(money(d.original_amount));
      paid = paid.plus(money(d.paid_amount));
      open = open.plus(apDocumentBalance(d.original_amount, d.paid_amount));
    }
    return { billed, paid, open };
  }, [activeDocs]);

  const filtered = useMemo(() => {
    const list =
      filter === "abiertas"
        ? activeDocs.filter(
            (d) =>
              d.status === "ABIERTA" ||
              d.status === "PARCIAL" ||
              apDocumentBalance(d.original_amount, d.paid_amount).gt(0),
          )
        : filter === "pagadas"
          ? activeDocs.filter((d) => d.status === "PAGADA")
          : [...documents];

    return list.sort((a, b) => {
      const ka = docSortKey(a);
      const kb = docSortKey(b);
      if (ka && kb) return kb.localeCompare(ka);
      if (ka) return -1;
      if (kb) return 1;
      return 0;
    });
  }, [activeDocs, documents, filter]);

  const openCount = activeDocs.filter(
    (d) =>
      d.status === "ABIERTA" ||
      d.status === "PARCIAL" ||
      apDocumentBalance(d.original_amount, d.paid_amount).gt(0),
  ).length;
  const paidCount = activeDocs.filter((d) => d.status === "PAGADA").length;

  const filters: { id: BillingFilter; label: string; count: number }[] = [
    { id: "todas", label: "Todas", count: documents.length },
    { id: "abiertas", label: "Abiertas", count: openCount },
    { id: "pagadas", label: "Pagadas", count: paidCount },
  ];

  return (
    <div className="mt-4 border-t border-[var(--line)] pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 text-left"
        >
          <h4 className="text-sm font-medium">Historial de facturación</h4>
          <Badge tone="neutral">
            {documents.length}{" "}
            {documents.length === 1 ? "doc." : "docs."}
          </Badge>
          <span className="text-xs text-[var(--muted)]">
            {expanded ? "Ocultar" : "Ver"}
          </span>
        </button>
        {activeDocs.length > 0 ? (
          <div className="flex flex-wrap gap-3 text-xs text-[var(--muted)]">
            <span>
              Facturado{" "}
              <strong className="text-[var(--ink)]">
                {formatCOP(totals.billed)}
              </strong>
            </span>
            <span>
              Pagado{" "}
              <strong className="text-[var(--ink)]">
                {formatCOP(totals.paid)}
              </strong>
            </span>
            <span>
              Saldo{" "}
              <strong className="text-[var(--ink)]">
                {formatCOP(totals.open)}
              </strong>
            </span>
          </div>
        ) : null}
      </div>

      {expanded ? (
        <div className="mt-3 space-y-3">
          {documents.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[var(--line)] bg-neutral-50 px-3 py-3 text-sm text-[var(--muted)]">
              Sin facturas ni gastos registrados. Insumos llegan desde Compras;
              gastos operativos desde Gastos / Solicitudes de pago.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5">
                {filters.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFilter(f.id)}
                    className={
                      filter === f.id
                        ? "rounded-md bg-[var(--solid)] px-2.5 py-1 text-xs font-medium text-[var(--on-solid)]"
                        : "rounded-md border border-[var(--line)] px-2.5 py-1 text-xs text-[var(--muted)]"
                    }
                  >
                    {f.label} ({f.count})
                  </button>
                ))}
              </div>

              {filtered.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">
                  No hay documentos en este filtro.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-[var(--line)]">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-[var(--muted)]">
                      <tr>
                        <th className="px-3 py-2 font-medium">Fecha</th>
                        <th className="px-3 py-2 font-medium">Documento</th>
                        <th className="px-3 py-2 font-medium">Concepto</th>
                        <th className="px-3 py-2 font-medium text-right">
                          Original
                        </th>
                        <th className="px-3 py-2 font-medium text-right">
                          Pagado
                        </th>
                        <th className="px-3 py-2 font-medium text-right">
                          Saldo
                        </th>
                        <th className="px-3 py-2 font-medium">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--line)]">
                      {filtered.map((doc) => {
                        const balance = apDocumentBalance(
                          doc.original_amount,
                          doc.paid_amount,
                        );
                        const title = [
                          documentTypeLabel(doc.document_type),
                          doc.document_number,
                        ]
                          .filter(Boolean)
                          .join(" ");
                        return (
                          <tr key={doc.id} className="bg-white align-top">
                            <td className="whitespace-nowrap px-3 py-2.5 text-[var(--muted)]">
                              {formatDateCO(doc.issue_date || doc.due_date)}
                              {doc.due_date && doc.issue_date !== doc.due_date ? (
                                <span className="mt-0.5 block text-[11px]">
                                  Vence {formatDateCO(doc.due_date)}
                                </span>
                              ) : null}
                            </td>
                            <td className="px-3 py-2.5">
                              <span className="font-medium">{title}</span>
                              <span className="mt-1 flex flex-wrap gap-1">
                                {doc.source === "GASTO" ? (
                                  <Badge tone="neutral">Gasto</Badge>
                                ) : null}
                                {doc.priority && doc.priority !== "NORMAL" ? (
                                  <Badge tone={pTone(doc.priority)}>
                                    {doc.priority}
                                  </Badge>
                                ) : null}
                              </span>
                            </td>
                            <td className="max-w-[220px] px-3 py-2.5 text-[var(--muted)]">
                              <span className="line-clamp-2">
                                {doc.concept || "—"}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                              {formatCOP(doc.original_amount)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-[var(--muted)]">
                              {formatCOP(doc.paid_amount)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium tabular-nums">
                              {formatCOP(balance)}
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex flex-col items-start gap-1">
                                <Badge tone={statusTone(doc.status)}>
                                  {statusLabel(doc.status)}
                                </Badge>
                                {doc.verification_status !== "CONFIRMADO" ? (
                                  <Badge tone={vTone(doc.verification_status)}>
                                    {doc.verification_status}
                                  </Badge>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function SupplierMasterCard({
  supplier,
  openBalance,
  billedTotal = 0,
  openDocsCount,
  documents = [],
  categories,
  caps,
}: {
  supplier: SupplierRow;
  openBalance: number | string;
  billedTotal?: number | string;
  openDocsCount: number;
  documents?: ApDocRow[];
  categories: ProductCategoryOption[];
  caps: ProveedoresCaps;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const categoryLabels = categories
    .filter((c) => supplier.category_ids.includes(c.id))
    .map((c) => c.name)
    .join(", ");
  const hasDebt = money(openBalance).gt(0);

  return (
    <article
      className={
        hasDebt
          ? "rounded-xl border border-[var(--line)] border-l-4 border-l-amber-500 bg-white p-5"
          : "rounded-xl border border-[var(--line)] bg-white p-5"
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-xl font-semibold">{supplier.name}</h3>
            {!supplier.is_active ? <Badge tone="neutral">Inactivo</Badge> : null}
            {hasDebt ? <Badge tone="warn">Se le debe</Badge> : null}
            {supplier.is_purchase_supplier ? (
              <Badge tone="ok">Insumos</Badge>
            ) : null}
            {supplier.is_purchase_supplier ? (
              <Badge
                tone={
                  supplier.purchase_payment_terms === "CREDITO" ? "ok" : "warn"
                }
              >
                {supplier.purchase_payment_terms === "CREDITO"
                  ? "Crédito"
                  : "Prepago"}
              </Badge>
            ) : null}
            {supplier.is_expense_supplier ? (
              <Badge tone="ok">Gastos</Badge>
            ) : null}
            {!supplier.is_purchase_supplier && !supplier.is_expense_supplier ? (
              <Badge tone="neutral">Sin tipo</Badge>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {[
              supplier.tax_id,
              categoryLabels || supplier.category,
              supplier.contact_name,
              supplier.phone,
              supplier.email,
            ]
              .filter(Boolean)
              .join(" · ") || "Sin detalle de contacto"}
          </p>
          {supplier.bank_account_info ? (
            <p className="mt-1 text-sm text-[var(--muted)]">
              Cuenta: {supplier.bank_account_info}
            </p>
          ) : null}
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
            Saldo CxP abierto
          </p>
          <p className="font-display text-2xl">{formatCOP(openBalance)}</p>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            Facturado {formatCOP(billedTotal)}
            {openDocsCount > 0
              ? ` · ${openDocsCount} ${openDocsCount === 1 ? "abierto" : "abiertos"}`
              : null}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {caps.canEditSupplier ? (
          <>
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm"
            >
              {editing ? "Cerrar" : "Editar"}
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
              className="rounded-lg px-3 py-1.5 text-sm text-red-700"
            >
              Desactivar
            </button>
          </>
        ) : null}
        <Link
          href="/proveedores/cxp"
          className="ml-auto text-sm text-[var(--accent)]"
        >
          Ver cuentas por pagar →
        </Link>
      </div>

      {editing && caps.canEditSupplier ? (
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
          <SupplierFields s={supplier} categories={categories} />
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-[var(--solid)] px-4 py-2 text-sm text-[var(--on-solid)]"
          >
            Guardar
          </button>
        </form>
      ) : null}
      {error ? (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <SupplierBillingHistory documents={documents} />
    </article>
  );
}

/** Agrupa documentos CxP de un proveedor (sin editar el maestro). */
export function SupplierCxpGroup({
  supplier,
  documents,
  allSuppliers,
  caps,
}: {
  supplier: SupplierRow;
  documents: ApDocRow[];
  allSuppliers: SupplierRow[];
  caps: ProveedoresCaps;
}) {
  const total = documents.reduce(
    (acc, d) => acc.plus(apDocumentBalance(d.original_amount, d.paid_amount)),
    money(0),
  );

  return (
    <section className="overflow-hidden rounded-xl border border-[var(--line)] bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-l-4 border-l-[var(--ink)] bg-neutral-50 px-4 py-3">
        <div>
          <h3 className="font-medium">{supplier.name}</h3>
          <p className="text-sm text-[var(--muted)]">
            {documents.length}{" "}
            {documents.length === 1 ? "documento" : "documentos"}
            {supplier.tax_id ? ` · NIT ${supplier.tax_id}` : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase text-[var(--muted)]">Saldo</p>
          <p className="font-display text-xl">{formatCOP(total)}</p>
        </div>
      </div>
      <div className="space-y-3 p-4">
        {documents.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Sin documentos abiertos.</p>
        ) : (
          documents.map((doc) => (
            <ApDocCard
              key={doc.id}
              doc={doc}
              suppliers={allSuppliers}
              canEdit={caps.canEditAp}
            />
          ))
        )}
      </div>
    </section>
  );
}

function ApDocCard({
  doc,
  suppliers,
  canEdit = false,
}: {
  doc: ApDocRow;
  suppliers: SupplierRow[];
  canEdit?: boolean;
}) {
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
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Link
          href="/solicitudes-pago"
          className="text-xs font-medium text-[var(--accent)] underline"
        >
          Gestionar pago →
        </Link>
        {canEdit ? (
          <>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="text-xs font-medium underline"
            >
              {open ? "Cerrar" : "Editar"}
            </button>
            <button
              type="button"
              disabled={pending}
              className="text-xs text-red-700 disabled:opacity-60"
              onClick={() => {
                const label = `${doc.document_type} ${doc.document_number || ""}`.trim();
                if (
                  !confirm(
                    `¿Eliminar ${label || "este documento CxP"}? Se quita de cuentas por pagar y se anula su solicitud de pago.`,
                  )
                ) {
                  return;
                }
                setError(null);
                startTransition(async () => {
                  const r = await softDeleteApDocumentAction(doc.id);
                  if (!r.ok) setError(r.error ?? "Error");
                });
              }}
            >
              Eliminar
            </button>
          </>
        ) : null}
      </div>
      {error && !open ? (
        <p className="mt-2 text-xs text-red-700">{error}</p>
      ) : null}
      {open && canEdit ? (
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
            <button type="submit" disabled={pending} className="rounded-md bg-[var(--solid)] px-3 py-1.5 text-xs text-[var(--on-solid)]">Guardar documento</button>
          </form>
          {error ? <p className="text-xs text-red-700">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
