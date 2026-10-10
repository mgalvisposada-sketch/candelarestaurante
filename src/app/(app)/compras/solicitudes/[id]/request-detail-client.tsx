"use client";

import {
  useMemo,
  useState,
  useTransition,
  type Dispatch,
  type SetStateAction,
  type TransitionStartFunction,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  acceptPurchaseInvoiceAction,
  addPurchaseRequestItemsByCategoryAction,
  addSupplierPendingItemAction,
  approvePurchaseRequestAction,
  importSuggestedProductsAction,
  markPurchaseOrderedAction,
  receivePurchaseItemsAction,
  rejectPurchaseRequestAction,
  removePurchaseRequestItemAction,
  submitPurchaseRequestAction,
  undoReceivePurchaseItemAction,
  updatePurchaseRequestItemAction,
} from "../../purchase-actions";
import { purchaseRequestStatusLabel } from "@/lib/purchases/status-labels";
import {
  isPrepagoTerms,
  PURCHASE_PAYMENT_TERMS_LABELS,
  type PurchasePaymentTerms,
} from "@/lib/purchases/payment-terms";
import { createProductFromRequestAction } from "../../inventory-actions";
import { notifyPendingActionsChanged } from "@/components/layout/pending-actions-inbox";
import { Badge } from "@/components/ui/primitives";
import { formatDateCO, todayInBogota } from "@/lib/dates";
import { formatCOP } from "@/lib/money";
import { suggestedPurchaseQty } from "@/lib/inventory/cost";
import { parseBulkNumber } from "@/lib/inventory/bulk-paste";
import {
  groupItemsBySupplier,
  groupPurchaseItemsBySupplier,
} from "@/lib/purchases/supplier-orders";
import {
  formatPurchaseQty,
  roundPurchaseQty,
} from "@/lib/purchases/qty";
import {
  allocateInvoiceCharges,
  cargosTotal,
  chargesTotal,
  descuentosTotal,
  merchandiseSubtotal,
  roundMoney,
  type InvoiceCharge,
} from "@/lib/purchases/invoice-charges";

export type ProductOption = {
  id: string;
  name: string;
  unit: string;
  category_id: string;
  category_name: string;
  current_stock: number | string;
  min_stock: number | string;
  unit_cost: number | string;
};
export type UnitOption = {
  id: string;
  code: string;
  name: string;
};
export type CategoryOption = {
  id: string;
  name: string;
};
export type SupplierOption = {
  id: string;
  name: string;
  lead_time_days: number | null;
  purchase_payment_terms?: PurchasePaymentTerms | string | null;
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
  invoice_payment_request_id?: string | null;
  invoice_ap_document_id?: string | null;
  supplier_invoice_label?: string | null;
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
  is_urgent?: boolean | null;
  payment_mode?: string | null;
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
  products: initialProducts,
  categories: allCategories,
  units,
  suppliers,
  links,
  existingProductIds,
  canCreateProduct,
}: {
  requestId: string;
  products: ProductOption[];
  categories: CategoryOption[];
  units: UnitOption[];
  suppliers: SupplierOption[];
  links: CategorySupplierLink[];
  existingProductIds: Set<string>;
  canCreateProduct: boolean;
}) {
  const [categoryId, setCategoryId] = useState("");
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [rowSuppliers, setRowSuppliers] = useState<Record<string, string>>({});
  const [defaultSupplierId, setDefaultSupplierId] = useState("");
  const [localProducts, setLocalProducts] = useState<ProductOption[]>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const products = useMemo(() => {
    const map = new Map<string, ProductOption>();
    for (const p of initialProducts) map.set(p.id, p);
    for (const p of localProducts) map.set(p.id, p);
    return [...map.values()];
  }, [initialProducts, localProducts]);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of products) {
      counts.set(p.category_id, (counts.get(p.category_id) ?? 0) + 1);
    }
    return [...allCategories]
      .map((c) => ({
        id: c.id,
        name: c.name,
        count: counts.get(c.id) ?? 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [allCategories, products]);

  const categoryProducts = useMemo(() => {
    if (!categoryId) return [];
    const q = filter.trim().toLowerCase();
    return products
      .filter((p) => p.category_id === categoryId)
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [products, categoryId, filter]);

  const options = useMemo(
    () =>
      categoryId
        ? suppliersForCategory(categoryId, suppliers, links)
        : [],
    [categoryId, suppliers, links],
  );
  const categoryDefaultSupplier = defaultSupplierId;
  const categoryName =
    categories.find((c) => c.id === categoryId)?.name ?? "";

  function qtyFor(id: string) {
    const raw = quantities[id];
    if (raw === undefined || raw.trim() === "") return "1";
    return raw;
  }

  function supplierFor(id: string) {
    return (rowSuppliers[id] ?? "").trim();
  }

  function ensureRowDefaults(id: string) {
    setQuantities((q) => (q[id] === undefined ? { ...q, [id]: "1" } : q));
  }

  function toggleProduct(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        next.add(id);
        ensureRowDefaults(id);
      }
      return next;
    });
  }

  function selectVisible(selectAll: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const p of categoryProducts) {
        if (selectAll) next.add(p.id);
        else next.delete(p.id);
      }
      return next;
    });
    if (selectAll) {
      setQuantities((q) => {
        const next = { ...q };
        for (const p of categoryProducts) {
          if (next[p.id] === undefined) next[p.id] = "1";
        }
        return next;
      });
    }
  }

  const missingSupplierCount = [...selected].filter(
    (id) => !supplierFor(id),
  ).length;

  return (
    <form
      className="space-y-3 rounded-xl border border-[var(--line)] bg-white p-4"
      action={() => {
        setError(null);
        setSuccess(null);

        const missing = [...selected].filter((id) => !supplierFor(id));
        if (missing.length > 0) {
          setError(
            `Asigne proveedor a todos los productos seleccionados (${missing.length} sin proveedor).`,
          );
          return;
        }

        // Reconstruir selección/cantidades desde estado: los inputs disabled
        // o filtrados fuera del DOM no viajan en FormData nativo.
        const payload = new FormData();
        payload.set("category_id", categoryId);

        for (const id of selected) {
          payload.append("product_ids", id);
          payload.set(`qty_${id}`, qtyFor(id));
          payload.set(`supplier_${id}`, supplierFor(id));
        }

        startTransition(async () => {
          const r = await addPurchaseRequestItemsByCategoryAction(
            requestId,
            payload,
          );
          if (!r.ok) setError(r.error ?? "Error");
          else {
            setSuccess(
              `Se agregaron ${r.created ?? selected.size} producto(s) de ${categoryName || "la categoría"}. Puede seguir agregando en la misma categoría.`,
            );
            setSelected(new Set());
            setQuantities({});
            setRowSuppliers({});
            setFilter("");
          }
        });
      }}
    >
      <div>
        <h3 className="font-medium">Agregar productos por categoría</h3>
        <p className="text-sm text-[var(--muted)]">
          Elija la categoría, marque productos y en cada fila defina cantidad y
          proveedor. El proveedor empieza en blanco y es obligatorio; puede
          usar “Aplicar” solo si elige uno por defecto a propósito.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr]">
        <label className="block text-sm">
          <span className="mb-1 block text-[var(--muted)]">Categoría *</span>
          <select
            name="category_id"
            value={categoryId}
            onChange={(e) => {
              const nextId = e.target.value;
              setCategoryId(nextId);
              setSelected(new Set());
              setQuantities({});
              setRowSuppliers({});
              setFilter("");
              setSuccess(null);
              setError(null);
              setDefaultSupplierId("");
            }}
            className={inputClass}
            required
          >
            <option value="">Seleccione categoría…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.count})
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-[var(--muted)]">Buscar producto</span>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            disabled={!categoryId}
            placeholder={categoryId ? "Filtrar por nombre…" : "Primero categoría"}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-[var(--muted)]">
            Proveedor por defecto
          </span>
          <div className="flex gap-2">
            <select
              value={categoryDefaultSupplier}
              disabled={!categoryId}
              onChange={(e) => setDefaultSupplierId(e.target.value)}
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
            <button
              type="button"
              disabled={!categoryId || !categoryDefaultSupplier || selected.size === 0}
              className="shrink-0 rounded-lg border border-[var(--line)] px-2 text-xs disabled:opacity-50"
              title="Aplicar a seleccionados"
              onClick={() => {
                if (!categoryDefaultSupplier) return;
                setRowSuppliers((prev) => {
                  const next = { ...prev };
                  for (const id of selected) next[id] = categoryDefaultSupplier;
                  return next;
                });
              }}
            >
              Aplicar
            </button>
          </div>
        </label>
      </div>

      {!categoryId ? (
        <p className="rounded-lg border border-dashed border-[var(--line)] px-3 py-4 text-sm text-[var(--muted)]">
          Seleccione una categoría para ver sus productos.
        </p>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-[var(--muted)]">
              {categoryName}: {categoryProducts.length} producto
              {categoryProducts.length === 1 ? "" : "s"}
              {filter.trim() ? " (filtrados)" : ""} · {selected.size} seleccionado
              {selected.size === 1 ? "" : "s"}
            </p>
            <div className="flex gap-2 text-sm">
              <button
                type="button"
                className="text-[var(--accent)]"
                onClick={() => selectVisible(true)}
              >
                Marcar visibles
              </button>
              <button
                type="button"
                className="text-[var(--muted)]"
                onClick={() => selectVisible(false)}
              >
                Limpiar
              </button>
            </div>
          </div>

          <div className="max-h-80 space-y-1 overflow-y-auto rounded-lg border border-[var(--line)]">
            {categoryProducts.length === 0 ? (
              <p className="px-3 py-4 text-sm text-[var(--muted)]">
                {filter.trim()
                  ? "No hay productos con ese filtro."
                  : "Esta categoría aún no tiene productos."}
              </p>
            ) : (
              categoryProducts.map((p) => {
                const already = existingProductIds.has(p.id);
                const checked = selected.has(p.id);
                return (
                  <div
                    key={p.id}
                    className="grid gap-2 border-b border-[var(--line)] px-3 py-2 last:border-b-0 md:grid-cols-[auto_1fr_90px_minmax(140px,1fr)] md:items-center"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleProduct(p.id)}
                      aria-label={`Seleccionar ${p.name}`}
                    />
                    <button
                      type="button"
                      className="text-left text-sm"
                      onClick={() => toggleProduct(p.id)}
                    >
                      <span className="font-medium">{p.name}</span>
                      <span className="block text-[var(--muted)]">
                        stock {p.current_stock} / mín. {p.min_stock} {p.unit}
                        {already ? " · ya en la solicitud (se actualizará)" : ""}
                      </span>
                    </button>
                    <input
                      value={qtyFor(p.id)}
                      onChange={(e) => {
                        const value = e.target.value;
                        setQuantities((q) => ({ ...q, [p.id]: value }));
                        if (!selected.has(p.id)) {
                          setSelected((prev) => new Set(prev).add(p.id));
                          ensureRowDefaults(p.id);
                        }
                      }}
                      onFocus={() => {
                        if (!selected.has(p.id)) {
                          setSelected((prev) => new Set(prev).add(p.id));
                          ensureRowDefaults(p.id);
                        }
                      }}
                      className={inputClass}
                      aria-label={`Cantidad ${p.name}`}
                      inputMode="decimal"
                      placeholder="Cant."
                    />
                    <select
                      value={supplierFor(p.id)}
                      onChange={(e) => {
                        const value = e.target.value;
                        setRowSuppliers((s) => ({ ...s, [p.id]: value }));
                        if (!selected.has(p.id)) {
                          setSelected((prev) => new Set(prev).add(p.id));
                          ensureRowDefaults(p.id);
                        }
                      }}
                      onFocus={() => {
                        if (!selected.has(p.id)) {
                          setSelected((prev) => new Set(prev).add(p.id));
                          ensureRowDefaults(p.id);
                        }
                      }}
                      className={inputClass}
                      aria-label={`Proveedor ${p.name}`}
                    >
                      <option value="">Proveedor…</option>
                      {options.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })
            )}
          </div>

          {canCreateProduct ? (
            <div className="rounded-lg border border-dashed border-[var(--line)] px-3 py-3">
              {!creating ? (
                <button
                  type="button"
                  className="text-sm text-[var(--accent)]"
                  onClick={() => {
                    setCreating(true);
                    setCreateError(null);
                  }}
                >
                  + Crear producto nuevo en esta categoría
                </button>
              ) : (
                <div
                  className="space-y-3"
                  onSubmit={(e) => e.stopPropagation()}
                >
                  <p className="text-sm font-medium">
                    Nuevo producto en {categoryName}
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    Se agrega al inventario y queda listo para marcarlo en este
                    pedido, sin salir de la solicitud.
                  </p>
                  <div className="grid gap-2 md:grid-cols-2">
                    <label className="block text-sm md:col-span-2">
                      <span className="mb-1 block text-[var(--muted)]">Nombre *</span>
                      <input
                        id="quick-product-name"
                        required
                        className={inputClass}
                        placeholder="Ej. Cebolla huevo blanca"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block text-[var(--muted)]">Unidad *</span>
                      <select
                        id="quick-product-unit"
                        required
                        defaultValue={units[0]?.id ?? ""}
                        className={inputClass}
                      >
                        {units.length === 0 ? (
                          <option value="">Sin unidades — créelas en Inventario</option>
                        ) : null}
                        {units.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.code} — {u.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block text-[var(--muted)]">Stock mín.</span>
                      <input
                        id="quick-product-min"
                        defaultValue="0"
                        className={inputClass}
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block text-[var(--muted)]">Costo / u</span>
                      <input
                        id="quick-product-cost"
                        defaultValue="0"
                        className={inputClass}
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block text-[var(--muted)]">SKU</span>
                      <input id="quick-product-sku" className={inputClass} />
                    </label>
                  </div>
                  {createError ? (
                    <p className="text-sm text-red-700">{createError}</p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={pending || units.length === 0}
                      className="rounded-lg bg-[var(--ink)] px-3 py-2 text-sm text-white disabled:opacity-60"
                      onClick={() => {
                        const name = (
                          document.getElementById(
                            "quick-product-name",
                          ) as HTMLInputElement | null
                        )?.value.trim();
                        const unitId = (
                          document.getElementById(
                            "quick-product-unit",
                          ) as HTMLSelectElement | null
                        )?.value;
                        const minStock =
                          (
                            document.getElementById(
                              "quick-product-min",
                            ) as HTMLInputElement | null
                          )?.value ?? "0";
                        const unitCost =
                          (
                            document.getElementById(
                              "quick-product-cost",
                            ) as HTMLInputElement | null
                          )?.value ?? "0";
                        const sku =
                          (
                            document.getElementById(
                              "quick-product-sku",
                            ) as HTMLInputElement | null
                          )?.value ?? "";

                        if (!name) {
                          setCreateError("Indique el nombre del producto");
                          return;
                        }
                        if (!unitId) {
                          setCreateError("Seleccione una unidad");
                          return;
                        }

                        const fd = new FormData();
                        fd.set("request_id", requestId);
                        fd.set("category_id", categoryId);
                        fd.set("name", name);
                        fd.set("unit_id", unitId);
                        fd.set("min_stock", minStock || "0");
                        fd.set("unit_cost", unitCost || "0");
                        fd.set("current_stock", "0");
                        if (sku.trim()) fd.set("sku", sku.trim());

                        setCreateError(null);
                        startTransition(async () => {
                          const r = await createProductFromRequestAction(fd);
                          if (!r.ok || !r.product) {
                            setCreateError(r.error ?? "No se pudo crear");
                            return;
                          }
                          const created: ProductOption = {
                            ...r.product,
                            category_name: categoryName,
                          };
                          setLocalProducts((prev) => [...prev, created]);
                          setSelected((prev) => new Set(prev).add(created.id));
                          setQuantities((q) => ({ ...q, [created.id]: "1" }));
                          setRowSuppliers((s) => ({ ...s, [created.id]: "" }));
                          setFilter("");
                          setCreating(false);
                          setSuccess(
                            `Producto «${created.name}» creado y marcado. Asigne proveedor y cantidad, luego agréguelo al pedido.`,
                          );
                        });
                      }}
                    >
                      {pending ? "Creando…" : "Crear y marcar"}
                    </button>
                    <button
                      type="button"
                      className="text-sm text-[var(--muted)]"
                      onClick={() => {
                        setCreating(false);
                        setCreateError(null);
                      }}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-[var(--muted)]">
              Si falta un producto, créelo en Inventario o pida permiso de
              inventario.
            </p>
          )}

          {options.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              No hay proveedores de insumos con esta categoría asignada.
            </p>
          ) : null}
        </div>
      )}

      {selected.size > 0 && missingSupplierCount > 0 ? (
        <p className="text-sm text-amber-800">
          Falta proveedor en {missingSupplierCount} producto
          {missingSupplierCount === 1 ? "" : "s"} seleccionado
          {missingSupplierCount === 1 ? "" : "s"}.
        </p>
      ) : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {success ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {success}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={
          pending ||
          !categoryId ||
          selected.size === 0 ||
          missingSupplierCount > 0
        }
        className="rounded-lg bg-[var(--ink)] px-4 py-2 text-sm text-white disabled:opacity-60"
      >
        {pending
          ? "Agregando…"
          : selected.size > 0
            ? `Agregar ${selected.size} producto${selected.size === 1 ? "" : "s"}`
            : "Agregar seleccionados"}
      </button>
    </form>
  );
}

function RequestProcessSteps({
  status,
  hasPrepago,
}: {
  status: string;
  hasPrepago: boolean;
}) {
  // Prepago (mayoría): autorizar → facturar/pagar → recibir
  // Crédito: autorizar → pedir → recibir → facturar → pagar
  const steps = hasPrepago
    ? ([
        { key: "BORRADOR", label: "Solicitar" },
        { key: "ENVIADA", label: "Autorizar" },
        { key: "APROBADA", label: "Facturar" },
        { key: "FACTURA_ACEPTADA", label: "Pagar" },
        { key: "PEDIDA", label: "Recibir" },
        { key: "CERRADO", label: "Cerrado" },
      ] as const)
    : ([
        { key: "BORRADOR", label: "Solicitar" },
        { key: "ENVIADA", label: "Autorizar" },
        { key: "APROBADA", label: "Pedir" },
        { key: "PEDIDA", label: "Recibir" },
        { key: "RECIBIDA", label: "Facturar" },
        { key: "FACTURA_ACEPTADA", label: "Cerrado" },
      ] as const);

  const activeIndex = (() => {
    if (["RECHAZADA", "ANULADA"].includes(status)) return -1;
    if (hasPrepago) {
      if (status === "BORRADOR") return 0;
      if (status === "ENVIADA") return 1;
      if (status === "APROBADA" || status === "PEDIDA") return 2;
      if (status === "FACTURA_ACEPTADA") return 3;
      if (["RECIBIDA", "RECIBIDA_PARCIAL"].includes(status)) return 4;
      return 2;
    }
    if (status === "BORRADOR") return 0;
    if (status === "ENVIADA") return 1;
    if (status === "APROBADA") return 2;
    if (status === "PEDIDA") return 3;
    if (["RECIBIDA", "RECIBIDA_PARCIAL"].includes(status)) return 4;
    if (status === "FACTURA_ACEPTADA") return 5;
    return 0;
  })();

  if (activeIndex < 0) {
    return (
      <p className="mt-4 text-sm text-red-700">
        Esta solicitud está {status.toLowerCase()} y no continúa el flujo.
      </p>
    );
  }

  return (
    <ol className="mt-4 flex flex-wrap gap-2">
      {steps.map((step, index) => {
        const done = index < activeIndex;
        const current = index === activeIndex;
        return (
          <li
            key={step.key}
            className={`rounded-lg px-3 py-1.5 text-xs ${
              current
                ? "bg-[var(--ink)] text-white"
                : done
                  ? "bg-emerald-50 text-emerald-900"
                  : "bg-neutral-50 text-[var(--muted)]"
            }`}
          >
            {index + 1}. {step.label}
          </li>
        );
      })}
    </ol>
  );
}

function SupplierOrdersPanel({
  requestId,
  items,
  supplierMap,
  compact = false,
}: {
  requestId: string;
  items: ItemRow[];
  supplierMap: Map<string, string>;
  /** En recepción/factura: solo acceso al PDF, sin tablas grandes. */
  compact?: boolean;
}) {
  const pedidoHref = `/compras/solicitudes/${requestId}/pedido`;
  const groups = groupItemsBySupplier(items, supplierMap);

  if (compact) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-white px-4 py-3">
        <div>
          <p className="text-sm font-medium">PDF para enviar a proveedores</p>
          <p className="text-xs text-[var(--muted)]">
            Documento de pedido (no es la factura). {groups.length} proveedor
            {groups.length === 1 ? "" : "es"}.
          </p>
        </div>
        <Link
          href={pedidoHref}
          className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm"
        >
          Abrir PDFs
        </Link>
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-medium">Pedidos para enviar (PDF)</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Lo que pedimos a cada proveedor. Después, la recepción y la factura
            se hacen aparte, proveedor por proveedor.
          </p>
        </div>
        <Link
          href={pedidoHref}
          className="rounded-lg bg-[var(--ink)] px-4 py-2 text-sm text-white"
        >
          Documento para imprimir / PDF
        </Link>
      </div>

      {groups.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--line)] px-4 py-6 text-sm text-[var(--muted)]">
          No hay líneas con proveedor para mostrar.
        </p>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <article
              key={group.supplierId ?? "sin"}
              className="overflow-hidden rounded-xl border border-[var(--line)] bg-white"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] bg-neutral-50 px-4 py-3">
                <div>
                  <h4 className="font-medium">{group.supplierName}</h4>
                  <p className="text-sm text-[var(--muted)]">
                    {group.items.length} producto
                    {group.items.length === 1 ? "" : "s"}
                  </p>
                </div>
                <Link
                  href={
                    group.supplierId
                      ? `${pedidoHref}?supplier=${group.supplierId}`
                      : pedidoHref
                  }
                  className="text-sm text-[var(--accent)]"
                >
                  Imprimir este pedido
                </Link>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--line)] text-left text-[var(--muted)]">
                    <th className="px-4 py-2 font-medium">Producto</th>
                    <th className="hidden px-4 py-2 font-medium sm:table-cell">
                      Categoría
                    </th>
                    <th className="px-4 py-2 text-right font-medium">Cantidad</th>
                    <th className="hidden px-4 py-2 font-medium md:table-cell">
                      Entrega
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {group.items.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-[var(--line)] last:border-b-0"
                    >
                      <td className="px-4 py-2.5 font-medium">
                        {item.product_name}
                      </td>
                      <td className="hidden px-4 py-2.5 text-[var(--muted)] sm:table-cell">
                        {item.category_name}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {item.quantity} {item.unit}
                      </td>
                      <td className="hidden px-4 py-2.5 text-[var(--muted)] md:table-cell">
                        {item.expected_delivery_date
                          ? formatDateCO(item.expected_delivery_date)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function DraftItemsBySupplier({
  requestId,
  items,
  suppliers,
  links,
  supplierMap,
  pending,
  startTransition,
  setError,
}: {
  requestId: string;
  items: ItemRow[];
  suppliers: SupplierOption[];
  links: CategorySupplierLink[];
  supplierMap: Map<string, string>;
  pending: boolean;
  startTransition: TransitionStartFunction;
  setError: Dispatch<SetStateAction<string | null>>;
}) {
  const groups = groupPurchaseItemsBySupplier(items, supplierMap, {
    includeCancelled: true,
  });

  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[var(--line)] px-4 py-6 text-sm text-[var(--muted)]">
        Sin productos aún. Cargue sugeridos o agregue por categoría arriba.
      </p>
    );
  }

  return (
    <section className="space-y-4">
      <div>
        <h3 className="font-medium">Pedido armado por proveedor</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {items.length} producto{items.length === 1 ? "" : "s"} · ajuste
          cantidad o proveedor dentro de cada grupo.
        </p>
      </div>
      {groups.map((group) => (
        <article
          key={group.supplierId ?? "sin"}
          className="overflow-hidden rounded-xl border border-[var(--line)] bg-white"
        >
          <div className="border-b border-[var(--line)] bg-neutral-50 px-4 py-3">
            <h4 className="font-medium">{group.supplierName}</h4>
            <p className="text-sm text-[var(--muted)]">
              {group.items.length} producto
              {group.items.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="divide-y divide-[var(--line)]">
            {group.items.map((item) => {
              const options = suppliersForCategory(
                item.category_id,
                suppliers,
                links,
              );
              return (
                <form
                  key={item.id}
                  className="grid gap-2 px-4 py-3 md:grid-cols-[1fr_100px_minmax(140px,1fr)_auto] md:items-end"
                  action={(fd) => {
                    setError(null);
                    startTransition(async () => {
                      const r = await updatePurchaseRequestItemAction(
                        requestId,
                        item.id,
                        fd,
                      );
                      if (!r.ok) setError(r.error ?? "Error");
                    });
                  }}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {item.product_name ?? item.product_id}
                    </p>
                    <p className="text-xs text-[var(--muted)]">
                      {item.category_name}
                    </p>
                  </div>
                  <label className="block text-sm">
                    <span className="mb-1 block text-[var(--muted)]">Cant.</span>
                    <input
                      name="quantity_requested"
                      required
                      defaultValue={String(item.quantity_requested)}
                      className={inputClass}
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block text-[var(--muted)]">
                      Proveedor
                    </span>
                    <select
                      name="suggested_supplier_id"
                      defaultValue={item.suggested_supplier_id ?? ""}
                      className={inputClass}
                    >
                      <option value="">—</option>
                      {options.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={pending}
                      className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm"
                    >
                      Guardar
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      className="rounded-lg px-3 py-2 text-sm text-red-700"
                      onClick={() =>
                        startTransition(async () => {
                          await removePurchaseRequestItemAction(
                            requestId,
                            item.id,
                          );
                        })
                      }
                    >
                      Quitar
                    </button>
                  </div>
                </form>
              );
            })}
          </div>
        </article>
      ))}
    </section>
  );
}

function itemOrderedQty(item: ItemRow) {
  return roundPurchaseQty(Number(item.quantity_approved ?? item.quantity_requested));
}

function itemPendingQty(item: ItemRow) {
  const pending = roundPurchaseQty(
    itemOrderedQty(item) - Number(item.quantity_received || 0),
  );
  return Math.max(pending, 0);
}

function isItemClosed(item: ItemRow) {
  if (item.status === "CANCELADO" || item.status === "RECIBIDO") return true;
  return itemPendingQty(item) <= 0;
}

function isReceiveExtraItem(item: ItemRow) {
  const notes = (item.notes ?? "").toLowerCase();
  return (
    notes.includes("no estaba en el") ||
    notes.includes("agregado al pedido en recepción") ||
    notes.includes("agregado en recepción")
  );
}

function UndoReceiveButton({
  requestId,
  item,
  pending,
  startTransition,
  setError,
}: {
  requestId: string;
  item: ItemRow;
  pending: boolean;
  startTransition: TransitionStartFunction;
  setError: Dispatch<SetStateAction<string | null>>;
}) {
  const router = useRouter();
  const received = roundPurchaseQty(Number(item.quantity_received || 0));
  const canUndo =
    received > 0 && !item.invoice_payment_request_id;

  if (!canUndo) return null;

  return (
    <button
      type="button"
      disabled={pending}
      className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-950 hover:bg-amber-100 disabled:opacity-50"
      onClick={() => {
        if (
          !confirm(
            `¿Devolver «${item.product_name}» a pendiente por recibir?\n\nSe quita la recepción (${formatPurchaseQty(received)} ${item.unit}) del stock para que pueda cargarla de nuevo correctamente.`,
          )
        ) {
          return;
        }
        setError(null);
        startTransition(async () => {
          const r = await undoReceivePurchaseItemAction(requestId, item.id);
          if (!r.ok) setError(r.error ?? "Error");
          else router.refresh();
        });
      }}
    >
      Devolver a pendiente
    </button>
  );
}

function ReceiveItemRow({
  item,
  requestId,
  canUndoReceive,
  pending,
  startTransition,
  setError,
}: {
  item: ItemRow;
  requestId?: string;
  canUndoReceive?: boolean;
  pending?: boolean;
  startTransition?: TransitionStartFunction;
  setError?: Dispatch<SetStateAction<string | null>>;
}) {
  const [disposition, setDisposition] = useState<"pendiente" | "llego" | "no_llegara">(
    "pendiente",
  );
  const ordered = itemOrderedQty(item);
  const received = roundPurchaseQty(Number(item.quantity_received || 0));
  const pendingQty = itemPendingQty(item);
  const closed = isItemClosed(item);
  const [qtyRaw, setQtyRaw] = useState(formatPurchaseQty(pendingQty));

  const undoControls =
    canUndoReceive &&
    requestId &&
    startTransition &&
    setError &&
    pending !== undefined ? (
      <UndoReceiveButton
        requestId={requestId}
        item={item}
        pending={pending}
        startTransition={startTransition}
        setError={setError}
      />
    ) : null;

  if (closed) {
    return (
      <div className="rounded-lg border border-[var(--line)] bg-neutral-50 px-3 py-3 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-medium">{item.product_name}</p>
            <p className="text-[var(--muted)]">
              Pedido {formatPurchaseQty(ordered)} · recibido{" "}
              {formatPurchaseQty(received)} {item.unit}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              tone={
                item.status === "CANCELADO" && received <= 0 ? "warn" : "ok"
              }
            >
              {item.status === "CANCELADO"
                ? received > 0
                  ? "Recibido parcial · resto no llega"
                  : "No llegará"
                : isReceiveExtraItem(item)
                  ? "Agregado en recepción"
                  : received > ordered
                    ? "Recibido (+extra)"
                    : "Recibido completo"}
            </Badge>
            {undoControls}
          </div>
        </div>
        {item.notes ? (
          <p className="mt-1 text-xs text-[var(--muted)]">{item.notes}</p>
        ) : null}
        {undoControls ? (
          <p className="mt-2 text-xs text-amber-900/80">
            Si digitó mal la cantidad, devuélvalo a pendiente y vuelva a recibir.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-[var(--line)] px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{item.product_name}</p>
            {isReceiveExtraItem(item) ? (
              <Badge tone="warn">Agregado al pedido</Badge>
            ) : null}
          </div>
          <p className="text-[var(--muted)]">
            Pedido {formatPurchaseQty(ordered)} · ya recibido{" "}
            {formatPurchaseQty(received)} · falta{" "}
            <span className="font-medium text-[var(--ink)]">
              {formatPurchaseQty(pendingQty)} {item.unit}
            </span>
            {item.expected_delivery_date
              ? ` · est. ${formatDateCO(item.expected_delivery_date)}`
              : ""}
          </p>
        </div>
        {undoControls}
      </div>

      <fieldset className="flex flex-wrap gap-3 text-sm">
        <legend className="sr-only">Disposición {item.product_name}</legend>
        {(
          [
            [
              "pendiente",
              received > 0 ? "Espera el resto" : "Sigue pendiente",
            ],
            [
              "llego",
              received > 0 ? "Llegó más ahora" : "Llegó ahora",
            ],
            [
              "no_llegara",
              received > 0
                ? `No llegará el resto (${formatPurchaseQty(pendingQty)} ${item.unit})`
                : "No llegará",
            ],
          ] as const
        ).map(([value, label]) => (
          <label
            key={value}
            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 ${
              disposition === value
                ? "border-[var(--ink)] bg-neutral-50"
                : "border-[var(--line)]"
            }`}
          >
            <input
              type="radio"
              name={`item_${item.id}_disposition`}
              value={value}
              checked={disposition === value}
              onChange={() => setDisposition(value)}
            />
            {label}
          </label>
        ))}
      </fieldset>

      {disposition === "llego" ? (
        <div className="space-y-2">
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--muted)]">
              Cantidad que llegó ahora *
            </span>
            <input
              name={`item_${item.id}_quantity_received`}
              required
              value={qtyRaw}
              onChange={(e) => setQtyRaw(e.target.value)}
              className={inputClass}
              inputMode="decimal"
            />
          </label>
          <p className="text-xs text-[var(--muted)]">
            Solo cantidades: confirme qué llegó vs lo pedido. Los precios de la
            factura los carga tesorería/compras en el paso Facturar (aunque le
            hayan entregado una copia).
          </p>
        </div>
      ) : null}

      {disposition === "no_llegara" ? (
        <label className="block text-sm">
          <span className="mb-1 block text-[var(--muted)]">
            Motivo (opcional)
          </span>
          <input
            name={`item_${item.id}_close_reason`}
            placeholder={
              received > 0
                ? "Ej. solo mandaron 5.4 y no completan"
                : "Ej. proveedor no tenía stock"
            }
            className={inputClass}
          />
          <p className="mt-1 text-xs text-[var(--muted)]">
            {received > 0 ? (
              <>
                Se mantiene lo ya recibido (
                {formatPurchaseQty(received)} {item.unit} en inventario y
                factura) y se cierra el faltante de{" "}
                {formatPurchaseQty(pendingQty)} {item.unit}. No vuelve a pedir
                ese resto.
              </>
            ) : (
              <>Se cierra el ítem. El stock no sube.</>
            )}
          </p>
        </label>
      ) : null}

      {disposition === "pendiente" ? (
        <p className="text-xs text-[var(--muted)]">
          No se registra movimiento. Queda esperando otra entrega.
        </p>
      ) : null}
    </div>
  );
}

type ChargeDraft = {
  key: string;
  concept: string;
  amountRaw: string;
  kind: "cargo" | "descuento";
  affectsCost: boolean;
};

const CHARGE_PRESETS: Array<{ label: string; kind: "cargo" | "descuento"; concept: string }> = [
  { label: "Impuestos", kind: "cargo", concept: "Impuestos" },
  { label: "Bolsas / empaque", kind: "cargo", concept: "Bolsas / empaque" },
  { label: "Flete / domicilio", kind: "cargo", concept: "Flete / domicilio" },
  { label: "Descuento comercial", kind: "descuento", concept: "Descuento comercial" },
  { label: "Descuento pronto pago", kind: "descuento", concept: "Descuento pronto pago" },
  { label: "Otro cargo", kind: "cargo", concept: "" },
  { label: "Otro descuento", kind: "descuento", concept: "" },
];

function SupplierInvoiceForm({
  requestId,
  supplierId,
  supplierName,
  items,
  billingMode = "received",
  canUndoReceive,
  pending,
  startTransition,
  setError,
}: {
  requestId: string;
  supplierId: string;
  supplierName: string;
  items: ItemRow[];
  /** ordered = prepago (cantidad pedida); received = crédito */
  billingMode?: "ordered" | "received";
  canUndoReceive?: boolean;
  pending: boolean;
  startTransition: TransitionStartFunction;
  setError: Dispatch<SetStateAction<string | null>>;
}) {
  const router = useRouter();
  const billable = items.filter((i) => {
    if (i.invoice_payment_request_id) return false;
    if (i.status === "CANCELADO" && Number(i.quantity_received || 0) <= 0) {
      return false;
    }
    if (billingMode === "ordered") {
      return itemOrderedQty(i) > 0;
    }
    return Number(i.quantity_received || 0) > 0;
  });
  const [lineTotals, setLineTotals] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const item of billable) {
      const qty =
        billingMode === "ordered"
          ? itemOrderedQty(item)
          : roundPurchaseQty(Number(item.quantity_received || 0));
      const unit = Number(item.unit_cost_estimate || 0);
      init[item.id] =
        qty > 0 && unit > 0 ? String(Math.round(unit * qty)) : "";
    }
    return init;
  });
  const [supplierLabels, setSupplierLabels] = useState<Record<string, string>>(
    () => {
      const init: Record<string, string> = {};
      for (const item of billable) {
        init[item.id] = item.supplier_invoice_label ?? "";
      }
      return init;
    },
  );
  const [charges, setCharges] = useState<ChargeDraft[]>([]);

  const billableLines = billable.map((item) => {
    const billedQty =
      billingMode === "ordered"
        ? itemOrderedQty(item)
        : roundPurchaseQty(Number(item.quantity_received || 0));
    const lineTotal = parseBulkNumber(lineTotals[item.id] ?? "");
    const unitCost =
      lineTotal != null && lineTotal > 0 && billedQty > 0
        ? lineTotal / billedQty
        : 0;
    return {
      itemId: item.id,
      productId: item.product_id,
      receivedQty: billedQty,
      unitCost,
    };
  });
  const merchandise = merchandiseSubtotal(billableLines);

  const parsedCharges: InvoiceCharge[] = charges
    .map((c) => ({
      concept:
        c.concept.trim() ||
        (c.kind === "descuento" ? "Descuento" : "Cargo"),
      amount: parseBulkNumber(c.amountRaw) ?? 0,
      kind: c.kind,
      affectsCost: c.affectsCost,
    }))
    .filter((c) => c.amount > 0);

  const netAdjustments = chargesTotal(parsedCharges);
  const totalCargos = cargosTotal(parsedCharges);
  const totalDescuentos = descuentosTotal(parsedCharges);
  const invoiceTotal = roundMoney(merchandise + netAdjustments);
  const allocations = allocateInvoiceCharges(billableLines, parsedCharges);
  const allocByItem = new Map(allocations.map((a) => [a.itemId, a]));
  const missingPrices = billableLines.some((l) => l.unitCost <= 0);

  function addCharge(
    kind: "cargo" | "descuento" = "cargo",
    concept = "",
  ) {
    setCharges((prev) => [
      ...prev,
      {
        key: `${Date.now()}-${prev.length}`,
        concept,
        amountRaw: "",
        kind,
        affectsCost: true,
      },
    ]);
  }

  if (billable.length === 0) return null;

  return (
    <form
      className="space-y-3 rounded-lg border-2 border-[var(--ink)] bg-white p-4"
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const r = await acceptPurchaseInvoiceAction(requestId, fd);
          if (!r.ok) setError(r.error ?? "Error");
          else {
            notifyPendingActionsChanged();
            router.refresh();
          }
        });
      }}
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
          Paso factura · solo {supplierName}
        </p>
        <h5 className="mt-1 text-sm font-medium">
          Factura de {supplierName}{" "}
          {billingMode === "ordered"
            ? "(prepago · según lo pedido)"
            : "(crédito · según lo recibido)"}
        </h5>
        <p className="mt-1 text-xs text-[var(--muted)]">
          {billingMode === "ordered" ? (
            <>
              Proveedor prepago: cargue la factura <strong>antes</strong> de
              recibir. Luego pague en Solicitudes de pago, notifique el
              comprobante al proveedor y recién ahí Chase recibe.
            </>
          ) : (
            <>
              Digite precios contra lo <strong>recibido</strong>. Si el
              proveedor usa otro nombre, use «Como aparece en factura».
            </>
          )}
        </p>
      </div>

      <ul className="space-y-3 rounded-lg bg-neutral-50 px-3 py-3 text-sm">
        {billable.map((item) => {
          const billed =
            billingMode === "ordered"
              ? itemOrderedQty(item)
              : roundPurchaseQty(Number(item.quantity_received || 0));
          const line = billableLines.find((l) => l.itemId === item.id);
          const alloc = allocByItem.get(item.id);
          const lineBase = roundMoney(billed * (line?.unitCost ?? 0));
          return (
            <li
              key={item.id}
              className="space-y-2 border-b border-[var(--line)] pb-3 last:border-0 last:pb-0"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{item.product_name}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {billingMode === "ordered" ? "Pedido" : "Recibido"}{" "}
                    {formatPurchaseQty(billed)} {item.unit} · nombre interno
                    Candela
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="tabular-nums font-medium">
                    {formatCOP(lineBase)}
                  </span>
                  {canUndoReceive ? (
                    <UndoReceiveButton
                      requestId={requestId}
                      item={item}
                      pending={pending}
                      startTransition={startTransition}
                      setError={setError}
                    />
                  ) : null}
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block text-[var(--muted)]">
                    Como aparece en factura (opcional)
                  </span>
                  <input
                    name={`item_${item.id}_supplier_invoice_label`}
                    value={supplierLabels[item.id] ?? ""}
                    onChange={(e) =>
                      setSupplierLabels((prev) => ({
                        ...prev,
                        [item.id]: e.target.value,
                      }))
                    }
                    placeholder="Ej. nombre o código del proveedor"
                    className={inputClass}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-[var(--muted)]">
                    Total línea en factura *
                  </span>
                  <input
                    name={`item_${item.id}_invoice_line_total`}
                    value={lineTotals[item.id] ?? ""}
                    onChange={(e) =>
                      setLineTotals((prev) => ({
                        ...prev,
                        [item.id]: e.target.value,
                      }))
                    }
                    placeholder="Ej. 45000"
                    className={inputClass}
                    inputMode="decimal"
                    required
                  />
                  {line && line.unitCost > 0 ? (
                    <span className="mt-1 block text-xs text-[var(--muted)]">
                      → {formatCOP(line.unitCost)} / {item.unit}
                    </span>
                  ) : (
                    <span className="mt-1 block text-xs text-amber-800">
                      Obligatorio según la factura
                    </span>
                  )}
                </label>
              </div>
              {alloc && alloc.allocatedExtra !== 0 ? (
                <p className="text-xs text-[var(--muted)]">
                  {alloc.allocatedExtra > 0 ? "+" : "−"} prorrateo{" "}
                  {formatCOP(Math.abs(alloc.allocatedExtra))} → costo/u{" "}
                  {formatCOP(alloc.landedUnitCost)}
                </p>
              ) : null}
            </li>
          );
        })}
        <li className="flex justify-between gap-2 pt-1">
          <span>Mercancía</span>
          <span className="tabular-nums">{formatCOP(merchandise)}</span>
        </li>
      </ul>

      <div className="space-y-2 rounded-lg border border-dashed border-[var(--line)] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">Cargos y descuentos</p>
          <div className="flex flex-wrap gap-1">
            {CHARGE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => addCharge(preset.kind, preset.concept)}
                className="rounded border border-[var(--line)] px-2 py-1 text-xs"
              >
                {preset.kind === "descuento" ? "−" : "+"} {preset.label}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-[var(--muted)]">
          Descuentos (ej. comercial) bajan el total a pagar y, con «Afecta
          costo», el costo de cada producto en proporción a su valor.
        </p>

        <input type="hidden" name="charge_count" value={String(charges.length)} />
        {charges.map((charge, index) => (
          <div
            key={charge.key}
            className="grid gap-2 rounded-lg border border-[var(--line)] bg-neutral-50 p-2 md:grid-cols-[110px_1fr_110px_auto_auto] md:items-end"
          >
            <input
              type="hidden"
              name={`charge_${index}_affects_cost`}
              value={charge.affectsCost ? "1" : "0"}
            />
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--muted)]">Tipo</span>
              <select
                name={`charge_${index}_kind`}
                value={charge.kind}
                onChange={(e) =>
                  setCharges((prev) =>
                    prev.map((c) =>
                      c.key === charge.key
                        ? {
                            ...c,
                            kind:
                              e.target.value === "descuento"
                                ? "descuento"
                                : "cargo",
                          }
                        : c,
                    ),
                  )
                }
                className={inputClass}
              >
                <option value="cargo">Cargo</option>
                <option value="descuento">Descuento</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--muted)]">Concepto</span>
              <input
                name={`charge_${index}_concept`}
                value={charge.concept}
                onChange={(e) =>
                  setCharges((prev) =>
                    prev.map((c) =>
                      c.key === charge.key
                        ? { ...c, concept: e.target.value }
                        : c,
                    ),
                  )
                }
                className={inputClass}
                placeholder={
                  charge.kind === "descuento"
                    ? "Ej. Descuento comercial"
                    : "Ej. Bolsas"
                }
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--muted)]">Monto</span>
              <input
                name={`charge_${index}_amount`}
                value={charge.amountRaw}
                onChange={(e) =>
                  setCharges((prev) =>
                    prev.map((c) =>
                      c.key === charge.key
                        ? { ...c, amountRaw: e.target.value }
                        : c,
                    ),
                  )
                }
                className={inputClass}
                inputMode="decimal"
                placeholder="2000"
              />
            </label>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                checked={charge.affectsCost}
                onChange={(e) =>
                  setCharges((prev) =>
                    prev.map((c) =>
                      c.key === charge.key
                        ? { ...c, affectsCost: e.target.checked }
                        : c,
                    ),
                  )
                }
              />
              Afecta costo
            </label>
            <button
              type="button"
              className="pb-2 text-sm text-[var(--muted)]"
              onClick={() =>
                setCharges((prev) => prev.filter((c) => c.key !== charge.key))
              }
            >
              Quitar
            </button>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-[var(--ink)] bg-neutral-50 px-3 py-2 text-sm">
        <div className="flex justify-between gap-2">
          <span>Mercancía</span>
          <span className="tabular-nums">{formatCOP(merchandise)}</span>
        </div>
        {totalCargos > 0 ? (
          <div className="flex justify-between gap-2">
            <span>Cargos</span>
            <span className="tabular-nums">+{formatCOP(totalCargos)}</span>
          </div>
        ) : null}
        {totalDescuentos > 0 ? (
          <div className="flex justify-between gap-2">
            <span>Descuentos</span>
            <span className="tabular-nums">−{formatCOP(totalDescuentos)}</span>
          </div>
        ) : null}
        {totalCargos === 0 && totalDescuentos === 0 ? (
          <div className="flex justify-between gap-2">
            <span>Ajustes</span>
            <span className="tabular-nums">{formatCOP(0)}</span>
          </div>
        ) : null}
        <div className="mt-1 flex justify-between gap-2 border-t border-[var(--line)] pt-1 font-medium">
          <span>Total factura (a pagar)</span>
          <span className="tabular-nums">{formatCOP(invoiceTotal)}</span>
        </div>
        {invoiceTotal <= 0 ? (
          <p className="mt-1 text-xs text-amber-800">
            El total debe ser mayor a 0. Reduzca los descuentos.
          </p>
        ) : null}
      </div>

      <input type="hidden" name="supplier_id" value={supplierId} />
      <input type="hidden" name="amount" value={String(invoiceTotal)} />
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-[var(--muted)]">Nº factura</span>
          <input name="document_number" className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-[var(--muted)]">Emisión</span>
          <input
            type="date"
            name="issue_date"
            defaultValue={todayInBogota()}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-[var(--muted)]">Vence</span>
          <input type="date" name="due_date" className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-[var(--muted)]">Prioridad de pago</span>
          <select name="priority" defaultValue="NORMAL" className={inputClass}>
            <option value="CRITICA">Crítica</option>
            <option value="ALTA">Alta</option>
            <option value="NORMAL">Normal</option>
            <option value="BAJA">Baja</option>
          </select>
        </label>
      </div>
      <button
        type="submit"
        disabled={pending || invoiceTotal <= 0 || missingPrices}
        className="rounded-lg bg-[var(--ink)] px-4 py-2.5 text-sm text-white disabled:opacity-60"
      >
        {pending
          ? "Enviando…"
          : `Enviar factura ${formatCOP(invoiceTotal)} a cola de pago`}
      </button>
    </form>
  );
}

/** Agrega productos al pedido del proveedor; quedan pendientes de recibir. */
function AddPendingToSupplierForm({
  requestId,
  supplierId,
  supplierName,
  products: initialProducts,
  categories,
  units,
  links,
  canCreateProduct,
  pending,
  startTransition,
  setError,
}: {
  requestId: string;
  supplierId: string;
  supplierName: string;
  products: ProductOption[];
  categories: CategoryOption[];
  units: UnitOption[];
  links: CategorySupplierLink[];
  canCreateProduct: boolean;
  pending: boolean;
  startTransition: TransitionStartFunction;
  setError: Dispatch<SetStateAction<string | null>>;
}) {
  const router = useRouter();
  const [productId, setProductId] = useState("");
  const [qtyRaw, setQtyRaw] = useState("1");
  const [localProducts, setLocalProducts] = useState<ProductOption[]>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createName, setCreateName] = useState("");
  const [createCategoryId, setCreateCategoryId] = useState("");
  const [createUnitId, setCreateUnitId] = useState(units[0]?.id ?? "");

  const supplierCategoryIds = useMemo(
    () =>
      new Set(
        links
          .filter((l) => l.supplier_id === supplierId)
          .map((l) => l.category_id),
      ),
    [links, supplierId],
  );
  const supplierCategories = useMemo(
    () => categories.filter((c) => supplierCategoryIds.has(c.id)),
    [categories, supplierCategoryIds],
  );

  const products = useMemo(() => {
    const map = new Map<string, ProductOption>();
    for (const p of initialProducts) map.set(p.id, p);
    for (const p of localProducts) map.set(p.id, p);
    return [...map.values()];
  }, [initialProducts, localProducts]);

  const productOptions = useMemo(
    () =>
      products.filter((p) => supplierCategoryIds.has(p.category_id)),
    [products, supplierCategoryIds],
  );

  const product = productOptions.find((p) => p.id === productId);
  const hasSupplierCategories = supplierCategoryIds.size > 0;

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-[var(--line)] bg-neutral-50 p-3">
      <div>
        <p className="text-sm font-medium">
          Agregar producto a {supplierName}
        </p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Solo productos de categorías asignadas a este proveedor. Queda
          pendiente y se recibe con «Llegó ahora».
        </p>
      </div>

      {!hasSupplierCategories ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {supplierName} no tiene categorías de producto asignadas.{" "}
          <Link href="/compras/proveedores" className="underline">
            Asígnelas en Proveedores
          </Link>{" "}
          para poder agregar ítems aquí.
        </p>
      ) : null}

      {canCreateProduct && hasSupplierCategories ? (
        <div className="rounded-lg border border-dashed border-[var(--line)] bg-white px-3 py-2">
          {!creating ? (
            <button
              type="button"
              className="text-sm text-[var(--accent)]"
              onClick={() => {
                setCreating(true);
                setCreateError(null);
                setCreateCategoryId(supplierCategories[0]?.id ?? "");
                setCreateUnitId(units[0]?.id ?? "");
              }}
            >
              + Crear producto nuevo (si no está en el catálogo)
            </button>
          ) : (
            <div className="space-y-2">
              <div className="grid gap-2 md:grid-cols-3">
                <label className="block text-sm">
                  <span className="mb-1 block text-[var(--muted)]">Nombre *</span>
                  <input
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-[var(--muted)]">Categoría</span>
                  <select
                    value={createCategoryId}
                    onChange={(e) => setCreateCategoryId(e.target.value)}
                    className={inputClass}
                  >
                    {supplierCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-[var(--muted)]">Unidad</span>
                  <select
                    value={createUnitId}
                    onChange={(e) => setCreateUnitId(e.target.value)}
                    className={inputClass}
                  >
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.code}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {createError ? (
                <p className="text-sm text-red-700">{createError}</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={pending || units.length === 0}
                  className="rounded-lg bg-[var(--ink)] px-3 py-1.5 text-sm text-white disabled:opacity-60"
                  onClick={() => {
                    const name = createName.trim();
                    if (!name) {
                      setCreateError("Indique el nombre");
                      return;
                    }
                    if (!createCategoryId || !createUnitId) {
                      setCreateError("Categoría y unidad obligatorias");
                      return;
                    }
                    if (!supplierCategoryIds.has(createCategoryId)) {
                      setCreateError(
                        "Esa categoría no está asignada a este proveedor",
                      );
                      return;
                    }
                    const categoryName =
                      supplierCategories.find((c) => c.id === createCategoryId)
                        ?.name ?? "Sin categoría";
                    const fd = new FormData();
                    fd.set("request_id", requestId);
                    fd.set("category_id", createCategoryId);
                    fd.set("name", name);
                    fd.set("unit_id", createUnitId);
                    fd.set("min_stock", "0");
                    fd.set("unit_cost", "0");
                    fd.set("current_stock", "0");
                    setCreateError(null);
                    startTransition(async () => {
                      const r = await createProductFromRequestAction(fd);
                      if (!r.ok || !r.product) {
                        setCreateError(r.error ?? "No se pudo crear");
                        return;
                      }
                      const created: ProductOption = {
                        ...r.product,
                        category_name: categoryName,
                      };
                      setLocalProducts((prev) => [...prev, created]);
                      setProductId(created.id);
                      setCreateName("");
                      setCreating(false);
                      router.refresh();
                    });
                  }}
                >
                  {pending ? "Creando…" : "Crear y seleccionar"}
                </button>
                <button
                  type="button"
                  className="text-sm text-[var(--muted)]"
                  onClick={() => {
                    setCreating(false);
                    setCreateError(null);
                  }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {hasSupplierCategories ? (
        <form
          className="grid gap-2 md:grid-cols-[1fr_120px_auto] md:items-end"
          action={(fd) => {
            setError(null);
            startTransition(async () => {
              const r = await addSupplierPendingItemAction(requestId, fd);
              if (!r.ok) setError(r.error ?? "Error");
              else {
                setProductId("");
                setQtyRaw("1");
                router.refresh();
              }
            });
          }}
        >
          <input type="hidden" name="supplier_id" value={supplierId} />
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--muted)]">Producto *</span>
            <select
              name="product_id"
              required
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className={inputClass}
            >
              <option value="">Seleccione…</option>
              {productOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.category_name}
                </option>
              ))}
            </select>
            {productOptions.length === 0 ? (
              <span className="mt-1 block text-xs text-amber-800">
                No hay productos en las categorías de {supplierName}. Cree uno
                arriba o en Inventario (misma categoría).
              </span>
            ) : null}
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--muted)]">
              Cantidad *{product ? ` (${product.unit})` : ""}
            </span>
            <input
              name="quantity"
              required
              value={qtyRaw}
              onChange={(e) => setQtyRaw(e.target.value)}
              className={inputClass}
              inputMode="decimal"
            />
          </label>
          <button
            type="submit"
            disabled={pending || !productId}
            className="rounded-lg bg-[var(--ink)] px-4 py-2 text-sm text-white disabled:opacity-60"
          >
            {pending ? "Agregando…" : "Agregar al pedido"}
          </button>
        </form>
      ) : null}
    </div>
  );
}

function SupplierReceiveForm({
  requestId,
  supplierName,
  openItems,
  pending,
  startTransition,
  setError,
}: {
  requestId: string;
  supplierName: string;
  openItems: ItemRow[];
  pending: boolean;
  startTransition: TransitionStartFunction;
  setError: Dispatch<SetStateAction<string | null>>;
}) {
  const router = useRouter();

  return (
    <form
      className="space-y-3 rounded-lg border border-[var(--line)] p-3"
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const r = await receivePurchaseItemsAction(requestId, fd);
          if (!r.ok) setError(r.error ?? "Error");
          else router.refresh();
        });
      }}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        1 · Recibir de {supplierName}
      </p>
      <p className="text-xs text-[var(--muted)]">
        Marque «Llegó ahora» en lo que llegó. Lo que siga pendiente espera otra
        entrega.
      </p>
      {openItems.map((item) => (
        <ReceiveItemRow
          key={item.id}
          item={item}
          requestId={requestId}
          canUndoReceive
          pending={pending}
          startTransition={startTransition}
          setError={setError}
        />
      ))}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[var(--ink)] px-4 py-2 text-sm text-white disabled:opacity-60"
      >
        {pending ? "Guardando…" : `Guardar recepción · ${supplierName}`}
      </button>
    </form>
  );
}

function SupplierOperationsPanel({
  requestId,
  requestStatus,
  items,
  products,
  categories,
  units,
  links,
  supplierMap,
  supplierTerms,
  paymentStatusById,
  canReceive,
  canReceiveExtras,
  canCreateProduct,
  canAcceptInvoice,
  pending,
  startTransition,
  setError,
}: {
  requestId: string;
  requestStatus: string;
  items: ItemRow[];
  products: ProductOption[];
  categories: CategoryOption[];
  units: UnitOption[];
  links: CategorySupplierLink[];
  supplierMap: Map<string, string>;
  supplierTerms: Map<string, string>;
  paymentStatusById: Map<string, string>;
  canReceive: boolean;
  canReceiveExtras: boolean;
  canCreateProduct: boolean;
  canAcceptInvoice: boolean;
  pending: boolean;
  startTransition: TransitionStartFunction;
  setError: Dispatch<SetStateAction<string | null>>;
}) {
  const groups = groupPurchaseItemsBySupplier(items, supplierMap, {
    includeCancelled: true,
  });

  if (groups.length === 0) return null;

  type GroupView = {
    group: (typeof groups)[number];
    openItems: ItemRow[];
    closedItems: ItemRow[];
    uninvoiced: ItemRow[];
    invoiced: ItemRow[];
    canShowReceive: boolean;
    canShowInvoice: boolean;
    canShowExtra: boolean;
    isSettled: boolean;
    statusLabel: string;
    prepago: boolean;
    billingMode: "ordered" | "received";
    payGateLabel: string | null;
  };

  const views: GroupView[] = groups
    .map((group) => {
      const terms = group.supplierId
        ? supplierTerms.get(group.supplierId) ?? "PREPAGO"
        : "PREPAGO";
      const prepago = isPrepagoTerms(terms);
      const billingMode: "ordered" | "received" = prepago
        ? "ordered"
        : "received";
      const openItems = group.items.filter((i) => !isItemClosed(i));
      const closedItems = group.items.filter((i) => isItemClosed(i));
      const uninvoiced = group.items.filter((i) => {
        if (i.invoice_payment_request_id) return false;
        if (i.status === "CANCELADO" && Number(i.quantity_received || 0) <= 0) {
          return false;
        }
        if (prepago) return itemOrderedQty(i) > 0;
        return Number(i.quantity_received || 0) > 0;
      });
      const invoiced = group.items.filter((i) => i.invoice_payment_request_id);
      const allInvoicedPaid =
        invoiced.length > 0 &&
        invoiced.every((i) => {
          const st = i.invoice_payment_request_id
            ? paymentStatusById.get(i.invoice_payment_request_id)
            : null;
          return st === "PAGADA";
        });
      const awaitingPay =
        prepago &&
        invoiced.length > 0 &&
        !allInvoicedPaid &&
        openItems.length > 0;

      const isSettled =
        openItems.length === 0 &&
        uninvoiced.length === 0 &&
        invoiced.length > 0;

      const canShowInvoice =
        canAcceptInvoice &&
        Boolean(group.supplierId) &&
        uninvoiced.length > 0 &&
        ["APROBADA", "PEDIDA", "RECIBIDA", "RECIBIDA_PARCIAL", "FACTURA_ACEPTADA"].includes(
          requestStatus,
        ) &&
        (prepago ||
          ["PEDIDA", "RECIBIDA", "RECIBIDA_PARCIAL", "FACTURA_ACEPTADA"].includes(
            requestStatus,
          ));

      // Prepago: recibir solo con factura pagada. Crédito: tras pedir.
      const canShowReceive =
        canReceive &&
        openItems.length > 0 &&
        ["PEDIDA", "RECIBIDA_PARCIAL", "FACTURA_ACEPTADA"].includes(
          requestStatus,
        ) &&
        (!prepago || allInvoicedPaid);

      const canShowExtra =
        canReceiveExtras &&
        Boolean(group.supplierId) &&
        !isSettled &&
        (!prepago || allInvoicedPaid || canShowReceive);

      let payGateLabel: string | null = null;
      if (prepago && openItems.length > 0 && !canShowReceive) {
        if (uninvoiced.length > 0) {
          payGateLabel =
            "Prepago: cargue la factura y págala antes de recibir.";
        } else if (awaitingPay) {
          payGateLabel =
            "Factura en cola: pague en Solicitudes de pago y notifique el comprobante al proveedor. Luego podrá recibir.";
        }
      }

      const statusLabel = canShowInvoice
        ? prepago
          ? "Prepago · facturar ahora"
          : "Listo para facturar"
        : awaitingPay
          ? "Esperando pago"
          : canShowReceive
            ? `${openItems.length} por recibir`
            : isSettled
              ? "Cerrado"
              : invoiced.length > 0
                ? "Factura enviada"
                : "Sin acción";

      if (
        !canShowReceive &&
        !canShowInvoice &&
        !canShowExtra &&
        !payGateLabel &&
        invoiced.length === 0 &&
        closedItems.length === 0
      ) {
        return null;
      }

      return {
        group,
        openItems,
        closedItems,
        uninvoiced,
        invoiced,
        canShowReceive,
        canShowInvoice,
        canShowExtra,
        isSettled,
        statusLabel,
        prepago,
        billingMode,
        payGateLabel,
      };
    })
    .filter((v): v is GroupView => v != null);

  const activeViews = views.filter((v) => !v.isSettled);
  const settledViews = views.filter((v) => v.isSettled);

  function renderSupplierCard(view: GroupView, opts?: { settled?: boolean }) {
    const {
      group,
      openItems,
      closedItems,
      invoiced,
      canShowReceive,
      canShowInvoice,
      canShowExtra,
      statusLabel,
      prepago,
      billingMode,
      payGateLabel,
    } = view;
    const settled = Boolean(opts?.settled);
    const termsLabel = prepago
      ? PURCHASE_PAYMENT_TERMS_LABELS.PREPAGO
      : PURCHASE_PAYMENT_TERMS_LABELS.CREDITO;

    return (
      <details
        key={group.supplierId ?? "sin"}
        className={`overflow-hidden rounded-xl border bg-white ${
          settled
            ? "border-[var(--line)] opacity-90"
            : canShowReceive || canShowInvoice || payGateLabel
              ? "border-[var(--ink)]"
              : "border-[var(--line)]"
        }`}
        open={!settled && Boolean(canShowInvoice || payGateLabel || canShowReceive)}
      >
        <summary className="cursor-pointer list-none bg-neutral-50 px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-medium">{group.supplierName}</p>
              <p className="text-sm text-[var(--muted)]">
                {group.items.length} producto
                {group.items.length === 1 ? "" : "s"} · {statusLabel}
              </p>
              <p className="text-xs text-[var(--muted)]">{termsLabel}</p>
            </div>
            <span className="text-sm text-[var(--muted)]">Ver / ocultar</span>
          </div>
        </summary>

        <div className="space-y-4 border-t border-[var(--line)] px-3 py-3">
          {settled ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              Todo recibido y factura gestionada. Ya no requiere recepción.
            </p>
          ) : null}

          {payGateLabel ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              {payGateLabel}{" "}
              <a className="underline" href="/solicitudes-pago">
                Ir a Solicitudes de pago
              </a>
            </p>
          ) : null}

          {!settled && canShowExtra && group.supplierId ? (
            <AddPendingToSupplierForm
              requestId={requestId}
              supplierId={group.supplierId}
              supplierName={group.supplierName}
              products={products}
              categories={categories}
              units={units}
              links={links}
              canCreateProduct={canCreateProduct}
              pending={pending}
              startTransition={startTransition}
              setError={setError}
            />
          ) : null}

          {canShowReceive ? (
            <SupplierReceiveForm
              requestId={requestId}
              supplierName={group.supplierName}
              openItems={openItems}
              pending={pending}
              startTransition={startTransition}
              setError={setError}
            />
          ) : null}

          {closedItems.length > 0 ? (
            <details
              open={!settled && closedItems.length <= 3}
              className="rounded-lg border border-[var(--line)] px-3 py-2"
            >
              <summary className="cursor-pointer text-sm text-[var(--muted)]">
                Ya recibido / cerrado ({closedItems.length})
              </summary>
              <div className="mt-2 space-y-2">
                {closedItems.map((item) => (
                  <ReceiveItemRow
                    key={item.id}
                    item={item}
                    requestId={requestId}
                    canUndoReceive={canReceive && !item.invoice_payment_request_id}
                    pending={pending}
                    startTransition={startTransition}
                    setError={setError}
                  />
                ))}
              </div>
            </details>
          ) : null}

          {canShowInvoice && group.supplierId ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                Factura · precios (tesorería / compras)
              </p>
              <SupplierInvoiceForm
                requestId={requestId}
                supplierId={group.supplierId}
                supplierName={group.supplierName}
                items={group.items}
                billingMode={billingMode}
                canUndoReceive={canReceive && billingMode === "received"}
                pending={pending}
                startTransition={startTransition}
                setError={setError}
              />
            </div>
          ) : null}

          {!settled && !canShowInvoice && invoiced.length > 0 ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              Parte de la factura de {group.supplierName} ya en{" "}
              <a className="underline" href="/solicitudes-pago">
                Solicitudes de pago
              </a>
              .
            </p>
          ) : null}

          {!group.supplierId ? (
            <p className="text-sm text-amber-800">
              Asigne proveedor a estos ítems para poder facturarlos.
            </p>
          ) : null}
        </div>
      </details>
    );
  }

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-[var(--line)] bg-white p-4">
        <h3 className="font-medium">Recepción y factura por proveedor</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Recibir = cantidades (local). Facturar = precios y cola de pago
          (tesorería). Son pasos distintos.
        </p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-[var(--muted)]">
          <li>Arriba: proveedores pendientes de recibir o facturar.</li>
          <li>Abajo: los que ya enviaron factura a cola de pago.</li>
        </ol>
      </div>

      {activeViews.length > 0 ? (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-[var(--muted)]">
            Pendientes ({activeViews.length})
          </h4>
          {activeViews.map((view) => renderSupplierCard(view))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-[var(--line)] bg-white px-4 py-3 text-sm text-[var(--muted)]">
          No hay proveedores pendientes de recepción o factura.
        </p>
      )}

      {settledViews.length > 0 ? (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-[var(--muted)]">
            Ya en cola de pago ({settledViews.length})
          </h4>
          {settledViews.map((view) =>
            renderSupplierCard(view, { settled: true }),
          )}
        </div>
      ) : null}
    </section>
  );
}

function SuggestedImportPanel({
  requestId,
  products,
  existingProductIds,
}: {
  requestId: string;
  products: ProductOption[];
  existingProductIds: Set<string>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const suggested = products
    .map((p) => ({
      ...p,
      suggestedQty: suggestedPurchaseQty(Number(p.current_stock), Number(p.min_stock)),
    }))
    .filter((p) => p.suggestedQty > 0);

  if (suggested.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--line)] px-4 py-4 text-sm text-[var(--muted)]">
        No hay productos bajo stock mínimo. Puede agregar productos manualmente abajo.
      </div>
    );
  }

  return (
    <form
      className="space-y-3 rounded-xl border border-[var(--line)] bg-white p-4"
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const r = await importSuggestedProductsAction(requestId, fd);
          if (!r.ok) setError(r.error ?? "Error");
        });
      }}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-medium">Cargar desde sugeridos</h3>
          <p className="text-sm text-[var(--muted)]">
            Productos por debajo del mínimo. Marque los que quiera incluir, ajuste cantidades y
            agregue a esta solicitud.
          </p>
        </div>
        <button
          type="button"
          disabled={pending}
          className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm"
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const r = await importSuggestedProductsAction(requestId);
              if (!r.ok) setError(r.error ?? "Error");
            })
          }
        >
          Cargar todos
        </button>
      </div>
      <div className="space-y-2">
        {suggested.map((p) => {
          const already = existingProductIds.has(p.id);
          return (
            <label
              key={p.id}
              className="grid gap-2 rounded-lg border border-[var(--line)] px-3 py-2 md:grid-cols-[auto_1fr_120px] md:items-center"
            >
              <input
                type="checkbox"
                name="product_ids"
                value={p.id}
                defaultChecked={!already}
              />
              <span className="text-sm">
                <span className="font-medium">{p.name}</span>
                <span className="block text-[var(--muted)]">
                  {p.category_name} · stock {p.current_stock} / mín. {p.min_stock} {p.unit}
                  {already ? " · ya está en la solicitud (se actualizará)" : ""}
                </span>
              </span>
              <input
                name={`qty_${p.id}`}
                defaultValue={String(p.suggestedQty)}
                className={inputClass}
                aria-label={`Cantidad ${p.name}`}
              />
            </label>
          );
        })}
      </div>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[var(--ink)] px-4 py-2 text-sm text-white disabled:opacity-60"
      >
        {pending ? "Agregando…" : "Agregar seleccionados"}
      </button>
    </form>
  );
}

export function RequestDetailClient({
  request,
  items,
  products,
  categories,
  units,
  suppliers,
  links,
  paymentStatusById = {},
  canCreate,
  canCreateProduct,
  canApprove,
  canMarkOrdered,
  canReceive,
  canReceiveExtras = false,
  canAcceptInvoice,
}: {
  request: RequestDetail;
  items: ItemRow[];
  products: ProductOption[];
  categories: CategoryOption[];
  units: UnitOption[];
  suppliers: SupplierOption[];
  links: CategorySupplierLink[];
  paymentStatusById?: Record<string, string>;
  canCreate: boolean;
  canCreateProduct: boolean;
  canApprove: boolean;
  canMarkOrdered: boolean;
  canReceive: boolean;
  canReceiveExtras?: boolean;
  canAcceptInvoice: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const supplierMap = useMemo(
    () => new Map(suppliers.map((s) => [s.id, s.name])),
    [suppliers],
  );
  const supplierTerms = useMemo(
    () =>
      new Map(
        suppliers.map((s) => [
          s.id,
          s.purchase_payment_terms ?? "PREPAGO",
        ]),
      ),
    [suppliers],
  );
  const hasPrepago = useMemo(() => {
    const ids = new Set(
      items
        .map((i) => i.approved_supplier_id ?? i.suggested_supplier_id)
        .filter(Boolean) as string[],
    );
    if (ids.size === 0) {
      return suppliers.some((s) => isPrepagoTerms(s.purchase_payment_terms));
    }
    return [...ids].some((id) =>
      isPrepagoTerms(supplierTerms.get(id) ?? "PREPAGO"),
    );
  }, [items, suppliers, supplierTerms]);
  const existingProductIds = new Set(items.map((i) => i.product_id));
  // PDF compact en recepción/factura (APROBADA ya muestra el panel completo arriba).
  const showSupplierOrders = [
    "PEDIDA",
    "RECIBIDA_PARCIAL",
    "RECIBIDA",
    "FACTURA_ACEPTADA",
  ].includes(request.status);
  const showOpsPanel = [
    "APROBADA",
    "PEDIDA",
    "RECIBIDA",
    "RECIBIDA_PARCIAL",
    "FACTURA_ACEPTADA",
  ].includes(request.status);
  const approveGroups = useMemo(
    () =>
      groupPurchaseItemsBySupplier(items, supplierMap, {
        includeCancelled: true,
      }),
    [items, supplierMap],
  );

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
            <div className="mt-2 flex flex-wrap gap-2">
              {request.is_urgent ? (
                <Badge tone="danger">Urgente</Badge>
              ) : null}
              {request.payment_mode === "EFECTIVO_INMEDIATO" ? (
                <Badge tone="warn">Efectivo inmediato</Badge>
              ) : request.payment_mode === "CREDITO" ? (
                <Badge tone="ok">A crédito</Badge>
              ) : null}
            </div>
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
                : ["APROBADA", "PEDIDA", "RECIBIDA", "FACTURA_ACEPTADA"].includes(
                      request.status,
                    )
                  ? "ok"
                  : "warn"
            }
          >
            {purchaseRequestStatusLabel(request.status)}
          </Badge>
        </div>
        <RequestProcessSteps status={request.status} hasPrepago={hasPrepago} />
        {hasPrepago ? (
          <p className="mt-3 text-xs text-[var(--muted)]">
            Hay proveedores prepago: tras autorizar, tesorería factura y paga;
            Chase recibe cuando el pago está listo (comprobante al proveedor).
          </p>
        ) : null}
      </div>

      {request.status === "BORRADOR" && canCreate ? (
        <SuggestedImportPanel
          requestId={request.id}
          products={products}
          existingProductIds={existingProductIds}
        />
      ) : null}

      {request.status === "BORRADOR" && canCreate ? (
        <AddItemForm
          requestId={request.id}
          products={products}
          categories={categories}
          units={units}
          suppliers={suppliers}
          links={links}
          existingProductIds={existingProductIds}
          canCreateProduct={canCreateProduct}
        />
      ) : null}

      {request.status === "BORRADOR" ? (
        canCreate ? (
          <DraftItemsBySupplier
            requestId={request.id}
            items={items}
            suppliers={suppliers}
            links={links}
            supplierMap={supplierMap}
            pending={pending}
            startTransition={startTransition}
            setError={setError}
          />
        ) : (
          <SupplierOrdersPanel
            requestId={request.id}
            items={items}
            supplierMap={supplierMap}
          />
        )
      ) : null}

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
              else notifyPendingActionsChanged();
            })
          }
        >
          Enviar a autorización
        </button>
      ) : null}

      {request.status === "ENVIADA" && canApprove ? (
        <form
          className="space-y-4"
          action={(fd) => {
            setError(null);
            startTransition(async () => {
              const r = await approvePurchaseRequestAction(request.id, fd);
              if (!r.ok) setError(r.error ?? "Error");
              else notifyPendingActionsChanged();
            });
          }}
        >
          <div className="rounded-xl border border-[var(--line)] bg-white p-5">
            <h3 className="font-medium">Autorizar compra por proveedor</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Confirme proveedor, cantidad y entrega. Al autorizar, el local (o
              tesorería) podrá pedir/comprar. Sin autorización no deben comprar.
              {request.payment_mode === "EFECTIVO_INMEDIATO"
                ? " Esta solicitud pide efectivo inmediato."
                : ""}
              {request.is_urgent ? " Marcada como urgente." : ""}
            </p>
          </div>
          {approveGroups.map((group) => (
            <div
              key={group.supplierId ?? "sin"}
              className="overflow-hidden rounded-xl border border-[var(--line)] bg-white"
            >
              <div className="border-b border-[var(--line)] bg-neutral-50 px-4 py-3">
                <h4 className="font-medium">{group.supplierName}</h4>
                <p className="text-sm text-[var(--muted)]">
                  {group.items.length} producto
                  {group.items.length === 1 ? "" : "s"}
                </p>
              </div>
              <div className="divide-y divide-[var(--line)]">
                {group.items.map((item) => {
                  const options = suppliersForCategory(
                    item.category_id,
                    suppliers,
                    links,
                  );
                  return (
                    <div
                      key={item.id}
                      className="grid gap-2 px-4 py-3 md:grid-cols-[1fr_minmax(140px,1.2fr)_100px_140px] md:items-end"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{item.product_name}</p>
                        <p className="text-xs text-[var(--muted)]">
                          Solicitado {item.quantity_requested} {item.unit}
                        </p>
                      </div>
                      <label className="block text-sm">
                        <span className="mb-1 block text-[var(--muted)]">
                          Proveedor
                        </span>
                        <select
                          name={`item_${item.id}_approved_supplier_id`}
                          defaultValue={
                            item.suggested_supplier_id ?? options[0]?.id ?? ""
                          }
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
                        <span className="mb-1 block text-[var(--muted)]">
                          Cant.
                        </span>
                        <input
                          name={`item_${item.id}_quantity_approved`}
                          defaultValue={String(item.quantity_requested)}
                          className={inputClass}
                        />
                      </label>
                      <label className="block text-sm">
                        <span className="mb-1 block text-[var(--muted)]">
                          Entrega
                        </span>
                        <input
                          type="date"
                          name={`item_${item.id}_expected_delivery_date`}
                          className={inputClass}
                        />
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={pending || items.length === 0}
              className="rounded-lg bg-[var(--ink)] px-5 py-2.5 text-sm text-white disabled:opacity-60"
            >
              Autorizar compra
            </button>
          </div>
        </form>
      ) : null}

      {request.status === "ENVIADA" && !canApprove ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Solicitud enviada. Esperando autorización. Sin autorización no se
          debe comprar al proveedor.
          <div className="mt-3">
            <SupplierOrdersPanel
              requestId={request.id}
              items={items}
              supplierMap={supplierMap}
              compact
            />
          </div>
        </div>
      ) : null}

      {request.status === "APROBADA" ? (
        <div className="space-y-3 rounded-xl border border-[var(--line)] bg-white p-5">
            <h3 className="font-medium">Compra autorizada</h3>
          <p className="text-sm text-[var(--muted)]">
            Use el PDF por proveedor. Si el proveedor es <strong>prepago</strong>,
            tesorería factura y paga abajo (antes de recibir). Si es{" "}
            <strong>crédito</strong>, marque «Ya pedí / compré» y Chase recibe;
            la factura va después.
          </p>
          <SupplierOrdersPanel
            requestId={request.id}
            items={items}
            supplierMap={supplierMap}
          />
          {canMarkOrdered ? (
            <button
              type="button"
              disabled={pending}
              className="rounded-lg bg-[var(--ink)] px-5 py-2.5 text-sm text-white disabled:opacity-60"
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  const r = await markPurchaseOrderedAction(request.id);
                  if (!r.ok) setError(r.error ?? "Error");
                })
              }
            >
              Ya pedí / compré al proveedor
            </button>
          ) : (
            <p className="text-sm text-amber-800">
              No tiene permiso para marcar pedida. Quien compre debe tener
              «Pedir / comprar al proveedor».
            </p>
          )}
        </div>
      ) : null}

      {request.status === "ENVIADA" && canApprove ? (
        <form
          className="flex flex-wrap items-end gap-2"
          action={(fd) => {
            setError(null);
            startTransition(async () => {
              const r = await rejectPurchaseRequestAction(request.id, fd);
              if (!r.ok) setError(r.error ?? "Error");
              else notifyPendingActionsChanged();
            });
          }}
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

      {showOpsPanel &&
      (canReceive || canAcceptInvoice || canReceiveExtras) ? (
        <SupplierOperationsPanel
          requestId={request.id}
          requestStatus={request.status}
          items={items}
          products={products}
          categories={categories}
          units={units}
          links={links}
          supplierMap={supplierMap}
          supplierTerms={supplierTerms}
          paymentStatusById={new Map(Object.entries(paymentStatusById))}
          canReceive={canReceive}
          canReceiveExtras={canReceiveExtras}
          canCreateProduct={canCreateProduct}
          canAcceptInvoice={canAcceptInvoice}
          pending={pending}
          startTransition={startTransition}
          setError={setError}
        />
      ) : null}

      {showSupplierOrders ? (
        <SupplierOrdersPanel
          requestId={request.id}
          items={items}
          supplierMap={supplierMap}
          compact={["RECIBIDA", "RECIBIDA_PARCIAL", "FACTURA_ACEPTADA"].includes(
            request.status,
          )}
        />
      ) : null}

      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
    </div>
  );
}
