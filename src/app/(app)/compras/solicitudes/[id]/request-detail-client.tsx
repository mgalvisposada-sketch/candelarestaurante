"use client";

import { useMemo, useState, useTransition } from "react";
import {
  acceptPurchaseInvoiceAction,
  addPurchaseRequestItemAction,
  approvePurchaseRequestAction,
  receivePurchaseItemsAction,
  rejectPurchaseRequestAction,
  removePurchaseRequestItemAction,
  submitPurchaseRequestAction,
} from "../../purchase-actions";
import { Badge } from "@/components/ui/primitives";
import { formatDateCO, todayInBogota } from "@/lib/dates";
import { formatCOP } from "@/lib/money";

export type ProductOption = {
  id: string;
  name: string;
  unit: string;
  category_id: string;
  category_name: string;
};
export type SupplierOption = {
  id: string;
  name: string;
  lead_time_days: number | null;
};
export type CategorySupplierLink = {
  supplier_id: string;
  category_id: string;
  lead_time_days: number | null;
};
export type ItemRow = {
  id: string;
  product_id: string;
  category_id: string;
  quantity_requested: number | string;
  quantity_approved: number | string | null;
  quantity_received: number | string;
  unit: string;
  suggested_supplier_id: string | null;
  approved_supplier_id: string | null;
  unit_cost_estimate: number | string | null;
  expected_delivery_date: string | null;
  status: string;
  notes: string | null;
  product_name?: string;
  category_name?: string;
};
export type RequestDetail = {
  id: string;
  title: string;
  status: string;
  notes: string | null;
  location_label: string | null;
  requested_at: string;
  needed_by: string | null;
  rejection_reason: string | null;
  payment_request_id: string | null;
};

const inputClass =
  "w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none ring-[var(--accent)] focus:ring-2";

function suppliersForCategory(
  categoryId: string,
  suppliers: SupplierOption[],
  links: CategorySupplierLink[],
) {
  const allowed = new Set(
    links.filter((l) => l.category_id === categoryId).map((l) => l.supplier_id),
  );
  return suppliers.filter((s) => allowed.has(s.id));
}

export function AddItemForm({
  requestId,
  products,
  suppliers,
  links,
}: {
  requestId: string;
  products: ProductOption[];
  suppliers: SupplierOption[];
  links: CategorySupplierLink[];
}) {
  const [productId, setProductId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const product = products.find((p) => p.id === productId);
  const options = useMemo(
    () =>
      product
        ? suppliersForCategory(product.category_id, suppliers, links)
        : suppliers,
    [product, suppliers, links],
  );
  const defaultSupplier = options[0]?.id ?? "";

  return (
    <form
      className="space-y-3 rounded-xl border border-[var(--line)] bg-white p-4"
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const r = await addPurchaseRequestItemAction(requestId, fd);
          if (!r.ok) setError(r.error ?? "Error");
          else setProductId("");
        });
      }}
    >
      <h3 className="font-medium">Agregar producto</h3>
      <div className="grid gap-3 md:grid-cols-4">
        <label className="block text-sm md:col-span-2">
          <span className="mb-1 block text-[var(--muted)]">Producto</span>
          <select
            name="product_id"
            required
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className={inputClass}
          >
            <option value="">Seleccione…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.category_name})
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-[var(--muted)]">Cantidad</span>
          <input name="quantity_requested" required defaultValue="1" className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-[var(--muted)]">Proveedor sugerido</span>
          <select
            name="suggested_supplier_id"
            key={`${productId}-${defaultSupplier}`}
            defaultValue={defaultSupplier}
            className={inputClass}
          >
            <option value="">—</option>
            {options.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.lead_time_days != null ? ` (${s.lead_time_days}d)` : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      {product ? (
        <p className="text-sm text-[var(--muted)]">
          Categoría: {product.category_name}.
          {options.length === 0
            ? " No hay proveedores de insumos con esa categoría asignada."
            : " Solo se muestran proveedores de insumos con esa categoría."}
        </p>
      ) : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[var(--ink)] px-4 py-2 text-sm text-white disabled:opacity-60"
      >
        {pending ? "Agregando…" : "Agregar"}
      </button>
    </form>
  );
}

export function RequestDetailClient({
  request,
  items,
  products,
  suppliers,
  links,
  canCreate,
  canApprove,
  canReceive,
}: {
  request: RequestDetail;
  items: ItemRow[];
  products: ProductOption[];
  suppliers: SupplierOption[];
  links: CategorySupplierLink[];
  canCreate: boolean;
  canApprove: boolean;
  canReceive: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const supplierMap = new Map(suppliers.map((s) => [s.id, s.name]));

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-[var(--line)] bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-medium">{request.title}</h2>
            <p className="text-sm text-[var(--muted)]">
              {formatDateCO(request.requested_at)}
              {request.location_label ? ` · ${request.location_label}` : ""}
              {request.needed_by ? ` · necesaria ${formatDateCO(request.needed_by)}` : ""}
            </p>
            {request.notes ? (
              <p className="mt-2 text-sm text-[var(--muted)]">{request.notes}</p>
            ) : null}
            {request.rejection_reason ? (
              <p className="mt-2 text-sm text-red-700">Rechazo: {request.rejection_reason}</p>
            ) : null}
            {request.payment_request_id ? (
              <p className="mt-2 text-sm">
                Factura enviada a{" "}
                <a className="text-[var(--accent)]" href="/solicitudes-pago">
                  Solicitudes de pago
                </a>
              </p>
            ) : null}
          </div>
          <Badge
            tone={
              ["RECHAZADA", "ANULADA"].includes(request.status)
                ? "danger"
                : ["PEDIDA", "RECIBIDA", "FACTURA_ACEPTADA"].includes(request.status)
                  ? "ok"
                  : "warn"
            }
          >
            {request.status}
          </Badge>
        </div>
      </div>

      {request.status === "BORRADOR" && canCreate ? (
        <AddItemForm
          requestId={request.id}
          products={products}
          suppliers={suppliers}
          links={links}
        />
      ) : null}

      <section className="space-y-3">
        <h3 className="font-medium">Ítems ({items.length})</h3>
        {items.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Sin productos aún.</p>
        ) : (
          items.map((item) => (
            <article
              key={item.id}
              className="rounded-xl border border-[var(--line)] bg-white px-4 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{item.product_name ?? item.product_id}</p>
                  <p className="text-sm text-[var(--muted)]">
                    {item.category_name} · solicitado {item.quantity_requested} {item.unit}
                    {item.quantity_approved != null
                      ? ` · aprobado ${item.quantity_approved}`
                      : ""}
                    {Number(item.quantity_received) > 0
                      ? ` · recibido ${item.quantity_received}`
                      : ""}
                  </p>
                  <p className="text-sm text-[var(--muted)]">
                    Sugerido:{" "}
                    {item.suggested_supplier_id
                      ? supplierMap.get(item.suggested_supplier_id) ?? "—"
                      : "—"}
                    {item.approved_supplier_id
                      ? ` · aprobado: ${supplierMap.get(item.approved_supplier_id) ?? "—"}`
                      : ""}
                    {item.expected_delivery_date
                      ? ` · entrega est. ${formatDateCO(item.expected_delivery_date)}`
                      : ""}
                  </p>
                </div>
                <Badge tone="neutral">{item.status}</Badge>
              </div>
              {request.status === "BORRADOR" && canCreate ? (
                <button
                  type="button"
                  disabled={pending}
                  className="mt-2 text-sm text-red-700"
                  onClick={() =>
                    startTransition(async () => {
                      await removePurchaseRequestItemAction(request.id, item.id);
                    })
                  }
                >
                  Quitar
                </button>
              ) : null}
            </article>
          ))
        )}
      </section>

      {request.status === "BORRADOR" && canCreate ? (
        <button
          type="button"
          disabled={pending || items.length === 0}
          className="rounded-lg bg-[var(--ink)] px-5 py-2.5 text-sm text-white disabled:opacity-60"
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const r = await submitPurchaseRequestAction(request.id);
              if (!r.ok) setError(r.error ?? "Error");
            })
          }
        >
          Enviar a compras
        </button>
      ) : null}

      {request.status === "ENVIADA" && canApprove ? (
        <form
          className="space-y-4 rounded-xl border border-[var(--line)] bg-white p-5"
          action={(fd) => {
            setError(null);
            startTransition(async () => {
              const r = await approvePurchaseRequestAction(request.id, fd);
              if (!r.ok) setError(r.error ?? "Error");
            });
          }}
        >
          <h3 className="font-medium">Gestión de compras</h3>
          <p className="text-sm text-[var(--muted)]">
            Confirme o cambie el proveedor por ítem. Si no indica fecha, se calcula con el lead time del proveedor.
          </p>
          {items.map((item) => {
            const options = suppliersForCategory(item.category_id, suppliers, links);
            return (
              <div key={item.id} className="grid gap-2 rounded-lg border border-[var(--line)] p-3 md:grid-cols-4">
                <p className="md:col-span-4 text-sm font-medium">
                  {item.product_name} · {item.quantity_requested} {item.unit}
                </p>
                <label className="block text-sm md:col-span-2">
                  <span className="mb-1 block text-[var(--muted)]">Proveedor aprobado</span>
                  <select
                    name={`item_${item.id}_approved_supplier_id`}
                    defaultValue={item.suggested_supplier_id ?? options[0]?.id ?? ""}
                    required
                    className={inputClass}
                  >
                    {options.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-[var(--muted)]">Cant. aprobada</span>
                  <input
                    name={`item_${item.id}_quantity_approved`}
                    defaultValue={String(item.quantity_requested)}
                    className={inputClass}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-[var(--muted)]">Entrega estimada</span>
                  <input
                    type="date"
                    name={`item_${item.id}_expected_delivery_date`}
                    className={inputClass}
                  />
                </label>
              </div>
            );
          })}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-[var(--ink)] px-5 py-2.5 text-sm text-white"
            >
              Aprobar y marcar pedida
            </button>
          </div>
        </form>
      ) : null}

      {request.status === "ENVIADA" && canApprove ? (
        <form
          className="flex flex-wrap items-end gap-2"
          action={(fd) => {
            setError(null);
            startTransition(async () => {
              const r = await rejectPurchaseRequestAction(request.id, fd);
              if (!r.ok) setError(r.error ?? "Error");
            });
          }
          }
        >
          <input
            name="rejection_reason"
            required
            placeholder="Motivo de rechazo"
            className={`${inputClass} min-w-[240px]`}
          />
          <button type="submit" disabled={pending} className="rounded-lg px-4 py-2 text-sm text-red-700">
            Rechazar
          </button>
        </form>
      ) : null}

      {["PEDIDA", "RECIBIDA_PARCIAL"].includes(request.status) && canReceive ? (
        <form
          className="space-y-3 rounded-xl border border-[var(--line)] bg-white p-5"
          action={(fd) => {
            setError(null);
            startTransition(async () => {
              const r = await receivePurchaseItemsAction(request.id, fd);
              if (!r.ok) setError(r.error ?? "Error");
            });
          }}
        >
          <h3 className="font-medium">Recepción de mercancía</h3>
          <p className="text-sm text-[var(--muted)]">
            Indique cuántas unidades llegaron ahora. Se suma al stock del inventario.
          </p>
          {items.map((item) => {
            const pendingQty =
              Number(item.quantity_approved ?? item.quantity_requested) -
              Number(item.quantity_received || 0);
            return (
              <label key={item.id} className="grid gap-2 md:grid-cols-3 items-end">
                <div className="md:col-span-2 text-sm">
                  <p className="font-medium">{item.product_name}</p>
                  <p className="text-[var(--muted)]">
                    Pendiente: {Math.max(pendingQty, 0)} {item.unit}
                    {item.expected_delivery_date
                      ? ` · est. ${formatDateCO(item.expected_delivery_date)}`
                      : ""}
                  </p>
                </div>
                <input
                  name={`item_${item.id}_quantity_received`}
                  placeholder="0"
                  className={inputClass}
                />
              </label>
            );
          })}
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-[var(--ink)] px-5 py-2.5 text-sm text-white"
          >
            Registrar recepción
          </button>
        </form>
      ) : null}

      {["RECIBIDA", "RECIBIDA_PARCIAL"].includes(request.status) &&
      (canApprove || canReceive) ? (
        <form
          className="space-y-3 rounded-xl border border-[var(--line)] bg-white p-5"
          action={(fd) => {
            setError(null);
            startTransition(async () => {
              const r = await acceptPurchaseInvoiceAction(request.id, fd);
              if (!r.ok) setError(r.error ?? "Error");
            });
          }}
        >
          <h3 className="font-medium">Aceptar factura</h3>
          <p className="text-sm text-[var(--muted)]">
            Crea documento CxP y envía la solicitud a cola de pago en tesorería.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-sm md:col-span-2">
              <span className="mb-1 block text-[var(--muted)]">Proveedor factura</span>
              <select name="supplier_id" required className={inputClass} defaultValue={items[0]?.approved_supplier_id ?? items[0]?.suggested_supplier_id ?? ""}>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--muted)]">Monto</span>
              <input name="amount" required className={inputClass} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--muted)]">Número factura</span>
              <input name="document_number" className={inputClass} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--muted)]">Emisión</span>
              <input type="date" name="issue_date" defaultValue={todayInBogota()} className={inputClass} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--muted)]">Vence</span>
              <input type="date" name="due_date" className={inputClass} />
            </label>
          </div>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-[var(--ink)] px-5 py-2.5 text-sm text-white"
          >
            Aceptar factura → cola de pago
          </button>
        </form>
      ) : null}

      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      {request.status === "FACTURA_ACEPTADA" ? (
        <p className="text-sm text-[var(--muted)]">
          Factura aceptada. El pago se gestiona en Solicitudes de pago
          {items[0]?.unit_cost_estimate != null
            ? ` · ref. ${formatCOP(items[0].unit_cost_estimate)}`
            : ""}
          .
        </p>
      ) : null}
    </div>
  );
}
