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
  deletePurchaseRequestAction,
  importSuggestedProductsAction,
  markPurchaseOrderedAction,
  cancelPurchaseSupplierOrderAction,
  dropUninvoicedPurchaseItemAction,
  receivePurchaseItemsAction,
  rejectPurchaseRequestAction,
  removePurchaseRequestItemAction,
  submitPurchaseRequestAction,
  undoReceivePurchaseItemAction,
  updatePurchaseRequestItemAction,
} from "../../purchase-actions";
import { purchaseRequestStatusLabel } from "@/lib/purchases/status-labels";
import {
  classifySuppliersByTerms,
  formatSupplierSelectLabel,
  isPrepagoTerms,
  PURCHASE_PAYMENT_MODE_SHORT,
  supplierPaymentTermsLabel,
  supplierPaymentTermsShort,
  type PurchasePaymentTerms,
  type SupplierTermsMix,
} from "@/lib/purchases/payment-terms";
import {
  PURCHASE_MILESTONES,
  purchaseMilestoneFor,
  purchaseSupplierOrderStatusLabel,
  supplierOrderAllowsInvoice,
  supplierOrderAllowsMarkOrdered,
  supplierOrderAllowsReceive,
  supplierOrderCanBeRemoved,
  type PurchaseMilestone,
} from "@/lib/purchases/supplier-order-status";
import {
  createProductCategoryAction,
  createProductFromRequestAction,
} from "../../inventory-actions";
import { quickCreatePurchaseSupplierAction } from "../../supplier-category-actions";
import { notifyPendingActionsChanged } from "@/components/layout/pending-actions-inbox";
import { Badge } from "@/components/ui/primitives";
import {
  QuickCreateField,
  QuickCreateSelect,
  QuickCreateSelectField,
} from "@/components/ui/quick-create";
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
  parsePurchaseQtyInput,
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
  quantity_invoiced?: number | string | null;
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
  categories: initialCategories,
  units,
  suppliers: initialSuppliers,
  links: initialLinks,
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
  const [rowNotes, setRowNotes] = useState<Record<string, string>>({});
  const [defaultSupplierId, setDefaultSupplierId] = useState("");
  const [localProducts, setLocalProducts] = useState<ProductOption[]>([]);
  const [extraCategories, setExtraCategories] = useState<CategoryOption[]>([]);
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [links, setLinks] = useState(initialLinks);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const allCategories = useMemo(() => {
    const map = new Map<string, CategoryOption>();
    for (const c of initialCategories) map.set(c.id, c);
    for (const c of extraCategories) map.set(c.id, c);
    return [...map.values()];
  }, [initialCategories, extraCategories]);

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

  function noteFor(id: string) {
    return rowNotes[id] ?? "";
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
          const note = noteFor(id).trim();
          if (note) payload.set(`notes_${id}`, note);
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
            setRowNotes({});
            setFilter("");
          }
        });
      }}
    >
      <div>
        <h3 className="font-medium">Agregar productos por categoría</h3>
        <p className="text-sm text-[var(--muted)]">
          Elija la categoría, marque productos y en cada fila defina cantidad,
          proveedor y, si hace falta, una observación para el proveedor (sale
          en el PDF del pedido). El proveedor es obligatorio.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr]">
        <QuickCreateSelect
          name="category_id"
          label="Categoría"
          required
          value={categoryId}
          onChange={(nextId) => {
            setCategoryId(nextId);
            setSelected(new Set());
            setQuantities({});
            setRowSuppliers({});
            setRowNotes({});
            setFilter("");
            setSuccess(null);
            setError(null);
            setDefaultSupplierId("");
          }}
          options={categories.map((c) => ({
            id: c.id,
            label: `${c.name} (${c.count})`,
          }))}
          placeholder="Seleccione categoría…"
          createLabel="Nueva categoría"
          createTitle="Alta rápida de categoría de insumos"
          onCreate={async (fd) => {
            const r = await createProductCategoryAction(fd);
            if (!r.ok || !r.id) {
              return { ok: false, error: r.error ?? "No se pudo crear" };
            }
            const name = String(fd.get("name") ?? "").trim();
            setExtraCategories((prev) =>
              prev.some((c) => c.id === r.id)
                ? prev
                : [...prev, { id: r.id!, name }],
            );
            return { ok: true, id: r.id, label: `${name} (0)` };
          }}
        >
          <QuickCreateField name="code" label="Código" required placeholder="VERD" />
          <QuickCreateField name="name" label="Nombre" required placeholder="Verduras" />
        </QuickCreateSelect>
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
        <div className="space-y-2">
          <QuickCreateSelect
            name="default_supplier_id"
            label="Proveedor por defecto"
            value={categoryDefaultSupplier}
            onChange={setDefaultSupplierId}
            options={options.map((s) => ({
              id: s.id,
              label: formatSupplierSelectLabel(s.name, {
                terms: s.purchase_payment_terms,
                leadTimeDays: s.lead_time_days,
              }),
            }))}
            placeholder="—"
            createLabel="Nuevo proveedor"
            createTitle="Alta rápida de proveedor para esta categoría"
            hint={
              !categoryId
                ? "Elija categoría primero."
                : "Crédito o Prepago del proveedor."
            }
            onCreate={async (fd) => {
              if (!categoryId) {
                return {
                  ok: false,
                  error: "Seleccione una categoría antes de crear el proveedor",
                };
              }
              fd.set("category_id", categoryId);
              const r = await quickCreatePurchaseSupplierAction(fd);
              if (!r.ok || !r.id) {
                return { ok: false, error: r.error ?? "No se pudo crear" };
              }
              const name = r.name ?? String(fd.get("name") ?? "Proveedor");
              const terms = String(fd.get("purchase_payment_terms") ?? "PREPAGO");
              setSuppliers((prev) =>
                prev.some((s) => s.id === r.id)
                  ? prev
                  : [
                      ...prev,
                      {
                        id: r.id!,
                        name,
                        lead_time_days: null,
                        purchase_payment_terms: terms,
                      },
                    ],
              );
              setLinks((prev) =>
                prev.some(
                  (l) =>
                    l.supplier_id === r.id && l.category_id === categoryId,
                )
                  ? prev
                  : [
                      ...prev,
                      {
                        supplier_id: r.id!,
                        category_id: categoryId,
                        lead_time_days: null,
                      },
                    ],
              );
              return {
                ok: true,
                id: r.id,
                label: formatSupplierSelectLabel(name, {
                  terms,
                  leadTimeDays: null,
                }),
              };
            }}
          >
            <QuickCreateField name="name" label="Nombre" required />
            <QuickCreateField name="tax_id" label="NIT" placeholder="Opcional" />
            <QuickCreateSelectField
              name="purchase_payment_terms"
              label="Términos"
              defaultValue="PREPAGO"
            >
              <option value="PREPAGO">Prepago</option>
              <option value="CREDITO">Crédito</option>
            </QuickCreateSelectField>
          </QuickCreateSelect>
          <button
            type="button"
            disabled={!categoryId || !categoryDefaultSupplier || selected.size === 0}
            className="rounded-lg border border-[var(--line)] px-2 py-1 text-xs disabled:opacity-50"
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
            Aplicar a seleccionados
          </button>
        </div>
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
                    className="space-y-2 border-b border-[var(--line)] px-3 py-2 last:border-b-0"
                  >
                    <div className="grid gap-2 md:grid-cols-[auto_1fr_90px_minmax(140px,1fr)] md:items-center">
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
                          {already
                            ? " · ya en la solicitud (se actualizará)"
                            : ""}
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
                            {formatSupplierSelectLabel(s.name, {
                              terms: s.purchase_payment_terms,
                              leadTimeDays: s.lead_time_days,
                            })}
                          </option>
                        ))}
                      </select>
                    </div>
                    {checked ? (
                      <input
                        value={noteFor(p.id)}
                        onChange={(e) =>
                          setRowNotes((n) => ({ ...n, [p.id]: e.target.value }))
                        }
                        className={inputClass}
                        aria-label={`Observación ${p.name}`}
                        placeholder='Observación al proveedor (ej. "ó 10 unidades")'
                        maxLength={200}
                      />
                    ) : null}
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
                      className="rounded-lg bg-[var(--solid)] px-3 py-2 text-sm text-[var(--on-solid)] disabled:opacity-60"
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
        className="rounded-lg bg-[var(--solid)] px-4 py-2 text-sm text-[var(--on-solid)] disabled:opacity-60"
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

function requestStepIndex(status: string) {
  if (["RECHAZADA", "ANULADA"].includes(status)) return -1;
  if (status === "BORRADOR") return 0;
  if (status === "ENVIADA") return 1;
  if (status === "APROBADA") return 2;
  if (
    ["PEDIDA", "RECIBIDA", "RECIBIDA_PARCIAL", "FACTURA_ACEPTADA"].includes(
      status,
    )
  ) {
    return 3;
  }
  return 0;
}

function RequestProcessSteps({ status }: { status: string }) {
  const steps = [
    { key: "BORRADOR", label: "Armar", hint: "Productos y cantidades" },
    { key: "ENVIADA", label: "Autorizar", hint: "Confirmar la compra" },
    { key: "APROBADA", label: "Pedir", hint: "PDF y compra al proveedor" },
    {
      key: "OPS",
      label: "Cerrar",
      hint: "Recibir y facturar por proveedor",
    },
  ] as const;

  const activeIndex = requestStepIndex(status);

  if (activeIndex < 0) {
    return (
      <p className="mt-4 text-sm text-red-700">
        Esta solicitud está {purchaseRequestStatusLabel(status).toLowerCase()} y
        no continúa el flujo.
      </p>
    );
  }

  return (
    <div className="mt-5">
      <ol className="grid gap-2 sm:grid-cols-4">
        {steps.map((step, index) => {
          const done = index < activeIndex;
          const current = index === activeIndex;
          return (
            <li
              key={step.key}
              className={`rounded-xl border px-3 py-2.5 ${
                current
                  ? "border-[var(--ink)] bg-[var(--solid)] text-[var(--on-solid)]"
                  : done
                    ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                    : "border-[var(--line)] bg-neutral-50 text-[var(--muted)]"
              }`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide opacity-80">
                Paso {index + 1}
                {done ? " · listo" : current ? " · ahora" : ""}
              </p>
              <p className="mt-0.5 text-sm font-medium">{step.label}</p>
              <p
                className={`mt-0.5 text-xs ${
                  current ? "text-[var(--on-solid)]/85" : "opacity-80"
                }`}
              >
                {step.hint}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function NextActionGuide({
  status,
  canCreate,
  canApprove,
  canMarkOrdered,
  canReceive,
  canAcceptInvoice,
  supplierMix,
  itemCount,
}: {
  status: string;
  canCreate: boolean;
  canApprove: boolean;
  canMarkOrdered: boolean;
  canReceive: boolean;
  canAcceptInvoice: boolean;
  supplierMix: SupplierTermsMix;
  itemCount: number;
}) {
  if (["RECHAZADA", "ANULADA"].includes(status)) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-red-800">
          Solicitud cerrada
        </p>
        <p className="mt-1 text-sm text-red-950">
          No hay más pasos en el flujo de compra.
        </p>
      </div>
    );
  }

  let title = "Qué hacer ahora";
  let body = "";
  let tone: "ink" | "amber" | "emerald" = "ink";

  if (status === "BORRADOR") {
    if (canCreate) {
      title = "Arme la solicitud";
      body =
        itemCount === 0
          ? "Agregue productos, asigne proveedor y luego envíe a autorización."
          : "Revise cantidades y proveedores. Cuando esté lista, envíe a autorización.";
    } else {
      title = "Borrador en preparación";
      body = "Quien arma la compra debe completar y enviar esta solicitud.";
      tone = "amber";
    }
  } else if (status === "ENVIADA") {
    if (canApprove) {
      title = "Autorizar o rechazar";
      body =
        "Confirme proveedor, cantidad y fecha de entrega por cada producto. Sin autorización no se debe comprar.";
    } else {
      title = "Esperando autorización";
      body =
        "La solicitud ya fue enviada. Cuando la autoricen, podrá pedir al proveedor.";
      tone = "amber";
    }
  } else if (status === "APROBADA") {
    if (canMarkOrdered) {
      title = "Pedir por proveedor";
      body = supplierMix.hasPrepago
        ? "Cada proveedor es una OC. Descargue el PDF, envíe el pedido y marque «Ya pedí» solo en ese. Prepago puede facturar abajo sin marcar pedido."
        : "Cada proveedor es una OC. Descargue el PDF, envíe el pedido y marque «Ya pedí» solo en ese; los demás pueden seguir pendientes.";
    } else if (canAcceptInvoice && supplierMix.hasPrepago) {
      title = "Prepago: facturar";
      body =
        "Puede cargar la factura de proveedores prepago. Quien compre marcará «Ya pedí» en cada OC cuando la envíe.";
      tone = "amber";
    } else {
      title = "Compra autorizada";
      body =
        "Falta que quien compre genere el PDF y marque «Ya pedí» en cada orden de proveedor.";
      tone = "amber";
    }
  } else if (
    ["PEDIDA", "RECIBIDA", "RECIBIDA_PARCIAL", "FACTURA_ACEPTADA"].includes(
      status,
    )
  ) {
    title = "Cerrar por orden de proveedor";
    if (supplierMix.isMixed) {
      body =
        "Hay prepago y crédito juntos. Cada OC avanza sola: abra el proveedor y haga solo el paso «Ahora».";
      tone = "amber";
    } else if (supplierMix.hasPrepago) {
      body =
        canAcceptInvoice || canReceive
          ? "OC prepago: Facturar → Pagar → Recibir. Si aún hay proveedores por pedir, márquelos arriba."
          : "OC prepago: Facturar → Pagar → Recibir. Si no ve acciones, puede faltar permiso o un pago pendiente.";
      tone = "amber";
    } else {
      body =
        canReceive || canAcceptInvoice
          ? "OC a crédito: Pedir → Recibir → Facturar. Cada proveedor tiene su propio estado."
          : "OC a crédito: Pedir → Recibir → Facturar. Si no ve acciones, puede faltar permiso.";
      tone = "emerald";
    }
  }

  if (!body) return null;

  const toneClass =
    tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-950"
      : tone === "emerald"
        ? "border-emerald-200 bg-emerald-50 text-emerald-950"
        : "border-[var(--ink)] bg-[var(--solid)] text-[var(--on-solid)]";

  return (
    <div className={`rounded-xl border px-4 py-3 ${toneClass}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-80">
        {title}
      </p>
      <p className="mt-1 text-sm leading-relaxed">{body}</p>
    </div>
  );
}

function SupplierFlowChips({
  prepago,
  nextStep,
}: {
  prepago: boolean;
  nextStep: string;
}) {
  const chips = prepago
    ? [
        { key: "facturar", label: "Facturar" },
        { key: "pagar", label: "Pagar" },
        { key: "recibir", label: "Recibir" },
      ]
    : [
        { key: "recibir", label: "Recibir" },
        { key: "facturar", label: "Facturar" },
      ];

  const activeKey = nextStep.includes("facturar")
    ? "facturar"
    : nextStep.includes("pagar")
      ? "pagar"
      : nextStep.includes("recibir")
        ? "recibir"
        : nextStep === "Listo"
          ? "done"
          : null;

  return (
    <ol className="mt-2 flex flex-wrap items-center gap-1.5">
      {chips.map((chip, index) => {
        const active = chip.key === activeKey;
        const done =
          activeKey === "done" ||
          (activeKey === "pagar" && chip.key === "facturar") ||
          (activeKey === "recibir" &&
            prepago &&
            (chip.key === "facturar" || chip.key === "pagar")) ||
          (activeKey === "facturar" && !prepago && chip.key === "recibir");
        return (
          <li key={chip.key} className="flex items-center gap-1.5">
            {index > 0 ? (
              <span className="text-[10px] text-[var(--muted)]" aria-hidden>
                →
              </span>
            ) : null}
            <span
              className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${
                active
                  ? "bg-[var(--solid)] text-[var(--on-solid)]"
                  : done
                    ? "bg-emerald-100 text-emerald-900"
                    : "bg-white text-[var(--muted)] ring-1 ring-[var(--line)]"
              }`}
            >
              {chip.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function SupplierMixGuide({
  mix,
  compact = false,
}: {
  mix: SupplierTermsMix;
  compact?: boolean;
}) {
  if (!mix.hasPrepago && !mix.hasCredito) return null;

  if (!mix.isMixed) {
    const onlyPrepago = mix.hasPrepago;
    return (
      <p className={`text-sm text-[var(--muted)] ${compact ? "mt-2" : "mt-3"}`}>
        {onlyPrepago
          ? "Todos los proveedores son prepago: facturar y pagar → luego recibir."
          : "Todos los proveedores son a crédito: pedir → recibir → luego facturar."}
      </p>
    );
  }

  return (
    <div className={`grid gap-3 md:grid-cols-2 ${compact ? "mt-2" : "mt-3"}`}>
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">
          Prepago · pagar primero
        </p>
        <p className="mt-1 text-sm font-medium text-amber-950">
          {mix.prepago.map((s) => s.name).join(", ")}
        </p>
        <p className="mt-1 text-xs text-amber-900/80">
          Facturar → Pagar → Recibir
        </p>
      </div>
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900">
          Crédito · recibir primero
        </p>
        <p className="mt-1 text-sm font-medium text-emerald-950">
          {mix.credito.map((s) => s.name).join(", ")}
        </p>
        <p className="mt-1 text-xs text-emerald-900/80">
          Pedir → Recibir → Facturar
        </p>
      </div>
    </div>
  );
}

function SupplierOrdersPanel({
  requestId,
  items,
  supplierMap,
  orderNumberBySupplier = {},
  orderStatusBySupplier = {},
  canMarkOrdered = false,
  pending = false,
  startTransition,
  setError,
  compact = false,
}: {
  requestId: string;
  items: ItemRow[];
  supplierMap: Map<string, string>;
  orderNumberBySupplier?: Record<string, string>;
  orderStatusBySupplier?: Record<string, string>;
  canMarkOrdered?: boolean;
  pending?: boolean;
  startTransition?: TransitionStartFunction;
  setError?: Dispatch<SetStateAction<string | null>>;
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
          <h3 className="font-medium">Órdenes por proveedor (OC)</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Cada proveedor tiene su propio pedido. Marque «Ya pedí» solo en el
            que ya envió; los demás pueden seguir pendientes.
          </p>
        </div>
        <Link
          href={pedidoHref}
          className="rounded-lg bg-[var(--solid)] px-4 py-2 text-sm text-[var(--on-solid)]"
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
          {groups.map((group) => {
            const orderNo = group.supplierId
              ? orderNumberBySupplier[group.supplierId]
              : undefined;
            const ocStatus = group.supplierId
              ? orderStatusBySupplier[group.supplierId] ?? "POR_PEDIR"
              : "POR_PEDIR";
            const canMark = Boolean(
              canMarkOrdered &&
                group.supplierId &&
                supplierOrderAllowsMarkOrdered(ocStatus) &&
                startTransition &&
                setError,
            );
            return (
            <details
              key={group.supplierId ?? "sin"}
              className="overflow-hidden rounded-xl border border-[var(--line)] bg-white open:shadow-sm"
              open={canMark}
            >
              <summary className="cursor-pointer list-none bg-neutral-50 px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="font-medium">
                      {orderNo ? `${orderNo} · ` : ""}
                      {group.supplierName}
                    </h4>
                    <p className="text-sm text-[var(--muted)]">
                      {group.items.length} producto
                      {group.items.length === 1 ? "" : "s"}
                      {" · "}
                      {purchaseSupplierOrderStatusLabel(ocStatus)}
                      <span className="ml-1 text-xs">· expandir / colapsar</span>
                    </p>
                  </div>
                  <div
                    className="flex flex-wrap items-center gap-2"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <Link
                      href={
                        group.supplierId
                          ? `${pedidoHref}?supplier=${group.supplierId}`
                          : pedidoHref
                      }
                      className="text-sm text-[var(--accent)]"
                    >
                      Imprimir
                    </Link>
                    {canMark && startTransition && setError ? (
                      <button
                        type="button"
                        disabled={pending}
                        className="rounded-lg bg-[var(--solid)] px-3 py-1.5 text-sm text-[var(--on-solid)] disabled:opacity-60"
                        onClick={() =>
                          startTransition(async () => {
                            setError(null);
                            const r = await markPurchaseOrderedAction(
                              requestId,
                              group.supplierId!,
                            );
                            if (!r.ok) setError(r.error ?? "Error");
                          })
                        }
                      >
                        Ya pedí / compré
                      </button>
                    ) : null}
                  </div>
                </div>
              </summary>
              <table className="w-full border-t border-[var(--line)] text-sm">
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
                        {item.notes ? (
                          <span className="mt-0.5 block text-xs font-normal text-[var(--muted)]">
                            Observación: {item.notes}
                          </span>
                        ) : null}
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
            </details>
            );
          })}
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
  const mix = classifySuppliersByTerms(
    groups
      .filter((g) => g.supplierId)
      .map((g) => {
        const supplier = suppliers.find((s) => s.id === g.supplierId);
        return {
          id: g.supplierId as string,
          name: g.supplierName,
          terms: supplier?.purchase_payment_terms,
        };
      }),
  );

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
          cantidad o proveedor. En cada proveedor se indica si es crédito o
          prepago.
        </p>
        {mix.isMixed ? (
          <div className="mt-3 rounded-lg border border-[var(--line)] bg-neutral-50 px-3 py-2.5">
            <p className="text-sm font-medium">
              Hay proveedores de los dos tipos
            </p>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              No pasa nada: la solicitud sigue siendo una sola. Después de
              autorizar, cada proveedor se opera aparte (prepago o crédito).
            </p>
            <SupplierMixGuide mix={mix} compact />
          </div>
        ) : (
          <SupplierMixGuide mix={mix} compact />
        )}
      </div>
      {groups.map((group) => {
        const groupSupplier = group.supplierId
          ? suppliers.find((s) => s.id === group.supplierId)
          : null;
        const termsHint = group.supplierId
          ? supplierPaymentTermsLabel(groupSupplier?.purchase_payment_terms)
          : "Asigne proveedor para ver si es crédito o prepago";
        return (
        <article
          key={group.supplierId ?? "sin"}
          className="overflow-hidden rounded-xl border border-[var(--line)] bg-white"
        >
          <div className="border-b border-[var(--line)] bg-neutral-50 px-4 py-3">
            <h4 className="font-medium">{group.supplierName}</h4>
            <p className="text-sm text-[var(--muted)]">
              {group.items.length} producto
              {group.items.length === 1 ? "" : "s"}
              {group.supplierId
                ? ` · ${supplierPaymentTermsShort(groupSupplier?.purchase_payment_terms)}`
                : ""}
            </p>
            <p className="mt-0.5 text-xs text-[var(--muted)]">{termsHint}</p>
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
                  <div className="min-w-0 md:col-span-4">
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
                          {formatSupplierSelectLabel(s.name, {
                            terms: s.purchase_payment_terms,
                            leadTimeDays: s.lead_time_days,
                          })}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm md:col-span-2">
                    <span className="mb-1 block text-[var(--muted)]">
                      Observación al proveedor
                    </span>
                    <input
                      name="notes"
                      defaultValue={item.notes ?? ""}
                      placeholder='Ej. "ó 10 unidades"'
                      maxLength={200}
                      className={inputClass}
                    />
                  </label>
                  <div className="flex gap-2 md:col-span-4">
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
        );
      })}
    </section>
  );
}

function itemOrderedQty(item: ItemRow) {
  return roundPurchaseQty(Number(item.quantity_approved ?? item.quantity_requested));
}

function itemInvoicedQty(item: ItemRow) {
  return roundPurchaseQty(Number(item.quantity_invoiced || 0));
}

/**
 * Meta de recepción.
 * Prepago con factura: SOLO contra lo facturado/pagado (no el pedido).
 * Crédito / sin factura: contra lo pedido.
 */
function itemReceiveTargetQty(item: ItemRow) {
  const invoiced = itemInvoicedQty(item);
  if (item.invoice_payment_request_id && invoiced > 0) return invoiced;
  return itemOrderedQty(item);
}

function itemPendingQty(item: ItemRow) {
  const pending = roundPurchaseQty(
    itemReceiveTargetQty(item) - Number(item.quantity_received || 0),
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
  const ordered = itemOrderedQty(item);
  const invoiced = itemInvoicedQty(item);
  const target = itemReceiveTargetQty(item);
  const againstInvoice = Boolean(
    item.invoice_payment_request_id && invoiced > 0,
  );
  const received = roundPurchaseQty(Number(item.quantity_received || 0));
  const pendingQty = itemPendingQty(item);
  const closed = isItemClosed(item);
  // Prepago facturado: por defecto «Llegó ahora» con lo que falta vs factura,
  // para no confrontar de nuevo el pedido ni dejar pendiente por accidente.
  const [disposition, setDisposition] = useState<
    "pendiente" | "llego" | "no_llegara"
  >(againstInvoice && pendingQty > 0 ? "llego" : "pendiente");
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
              {againstInvoice ? (
                <>
                  Facturado/pagado {formatPurchaseQty(invoiced)} · recibido{" "}
                  {formatPurchaseQty(received)} {item.unit}
                  {ordered !== invoiced
                    ? ` · pedido original ${formatPurchaseQty(ordered)}`
                    : ""}
                </>
              ) : (
                <>
                  Pedido {formatPurchaseQty(ordered)} · recibido{" "}
                  {formatPurchaseQty(received)} {item.unit}
                </>
              )}
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
                  : (item.notes ?? "").toLowerCase().includes("no vino en la factura")
                    ? "No facturado"
                    : "No llegará"
                : isReceiveExtraItem(item)
                  ? "Agregado en recepción"
                  : againstInvoice && received >= target
                    ? "Recibido vs factura"
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
              <Badge tone="warn">Agregado al facturar</Badge>
            ) : null}
            {againstInvoice ? (
              <Badge tone="ok">Recibir vs factura</Badge>
            ) : null}
          </div>
          {againstInvoice ? (
            <>
              <p className="text-[var(--muted)]">
                Facturado/pagado{" "}
                <span className="font-medium text-[var(--ink)]">
                  {formatPurchaseQty(invoiced)} {item.unit}
                </span>
                {" · "}
                ya recibido {formatPurchaseQty(received)} · falta{" "}
                <span className="font-medium text-[var(--ink)]">
                  {formatPurchaseQty(pendingQty)} {item.unit}
                </span>
                {item.expected_delivery_date
                  ? ` · est. ${formatDateCO(item.expected_delivery_date)}`
                  : ""}
              </p>
              {ordered !== invoiced ? (
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Pedido original {formatPurchaseQty(ordered)} {item.unit} (solo
                  referencia; la recepción cierra contra la factura).
                </p>
              ) : null}
            </>
          ) : (
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
          )}
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
                : againstInvoice
                  ? "No llegó lo facturado"
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
            {againstInvoice
              ? `Meta: lo facturado/pagado (${formatPurchaseQty(target)} ${item.unit}). No se usa el pedido original.`
              : "Solo cantidades. Los precios se cargan después en Facturar."}
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
              againstInvoice
                ? "Ej. facturaron de más / no vino esa línea"
                : received > 0
                  ? "Ej. solo mandaron 5.4 y no completan"
                  : "Ej. proveedor no tenía stock"
            }
            className={inputClass}
          />
          <p className="mt-1 text-xs text-[var(--muted)]">
            {againstInvoice ? (
              <>
                Cierra el faltante frente a la factura (
                {formatPurchaseQty(pendingQty)} {item.unit}). El stock no sube
                por ese faltante.
              </>
            ) : received > 0 ? (
              <>
                Se mantiene lo ya recibido (
                {formatPurchaseQty(received)} {item.unit} en inventario) y se
                cierra el faltante de {formatPurchaseQty(pendingQty)}{" "}
                {item.unit}.
              </>
            ) : (
              <>Se cierra el ítem. El stock no sube.</>
            )}
          </p>
        </label>
      ) : null}

      {disposition === "pendiente" ? (
        <p className="text-xs text-[var(--muted)]">
          {againstInvoice
            ? "No se registra movimiento. Sigue faltando recibir lo facturado/pagado."
            : "No se registra movimiento. Queda esperando otra entrega."}
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
  const [billedQtys, setBilledQtys] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const item of billable) {
      const qty =
        billingMode === "ordered"
          ? itemOrderedQty(item)
          : roundPurchaseQty(Number(item.quantity_received || 0));
      init[item.id] = formatPurchaseQty(qty);
    }
    return init;
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
    const fallback =
      billingMode === "ordered"
        ? itemOrderedQty(item)
        : roundPurchaseQty(Number(item.quantity_received || 0));
    const fromForm = parsePurchaseQtyInput(billedQtys[item.id] ?? "");
    const billedQty =
      fromForm != null && fromForm > 0 ? roundPurchaseQty(fromForm) : fallback;
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

  const dropped = items.filter(
    (item) =>
      item.status === "CANCELADO" &&
      roundPurchaseQty(Number(item.quantity_received || 0)) <= 0 &&
      !item.invoice_payment_request_id,
  );

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
        <p className="text-sm font-medium">
          Factura de {supplierName}{" "}
          <span className="font-normal text-[var(--muted)]">
            {billingMode === "ordered"
              ? "· prepago (según lo pedido)"
              : "· crédito (según lo recibido)"}
          </span>
        </p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          {billingMode === "ordered" ? (
            <>
              Prepago: ajuste la <strong>cant. facturada</strong> si el
              proveedor cobró distinto al pedido. Si un producto no vino en la
              factura, quítelo: se cierra y no queda pendiente por recibir.
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
          const ordered = itemOrderedQty(item);
          const receivedQty = roundPurchaseQty(
            Number(item.quantity_received || 0),
          );
          const line = billableLines.find((l) => l.itemId === item.id);
          const billed = line?.receivedQty ?? ordered;
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
                    Pedido {formatPurchaseQty(ordered)} {item.unit}
                    {billingMode === "received"
                      ? ` · recibido ${formatPurchaseQty(receivedQty)}`
                      : ""}{" "}
                    · nombre interno Candela
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="tabular-nums font-medium">
                    {formatCOP(lineBase)}
                  </span>
                  {receivedQty <= 0 ? (
                    <button
                      type="button"
                      disabled={pending}
                      className="rounded-lg px-2 py-1 text-xs font-medium text-red-700 disabled:opacity-60"
                      onClick={() => {
                        if (
                          !window.confirm(
                            `¿Quitar «${item.product_name}» (${formatPurchaseQty(ordered)} ${item.unit}) de la factura de ${supplierName}?\n\nEl proveedor no lo facturó. Esa línea se cierra y no queda pendiente por recibir.`,
                          )
                        ) {
                          return;
                        }
                        setError(null);
                        startTransition(async () => {
                          const r = await dropUninvoicedPurchaseItemAction(
                            requestId,
                            item.id,
                          );
                          if (!r.ok) setError(r.error ?? "Error");
                          else {
                            notifyPendingActionsChanged();
                            router.refresh();
                          }
                        });
                      }}
                    >
                      Quitar · no facturado
                    </button>
                  ) : null}
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
              <div className="grid gap-2 sm:grid-cols-3">
                <label className="block text-sm">
                  <span className="mb-1 block text-[var(--muted)]">
                    Cant. en factura * ({item.unit})
                  </span>
                  <input
                    name={`item_${item.id}_invoice_qty`}
                    value={billedQtys[item.id] ?? ""}
                    onChange={(e) =>
                      setBilledQtys((prev) => ({
                        ...prev,
                        [item.id]: e.target.value,
                      }))
                    }
                    className={inputClass}
                    inputMode="decimal"
                    required
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-[var(--muted)]">
                    Como aparece en factura
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

      {dropped.length > 0 ? (
        <div className="rounded-lg border border-[var(--line)] bg-neutral-50 px-3 py-2 text-xs text-[var(--muted)]">
          <p className="font-medium text-[var(--ink)]">
            No facturados · no quedan por recibir
          </p>
          <ul className="mt-1 space-y-0.5">
            {dropped.map((item) => (
              <li key={item.id}>
                {item.product_name} · pedido{" "}
                {formatPurchaseQty(itemOrderedQty(item))} {item.unit}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

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
        className="rounded-lg bg-[var(--solid)] px-4 py-2.5 text-sm text-[var(--on-solid)] disabled:opacity-60"
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
  mode = "receive",
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
  /** invoice = al facturar (prepago/crédito); receive = extras en recepción */
  mode?: "invoice" | "receive";
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
          {mode === "invoice"
            ? `Producto no pedido · ${supplierName}`
            : `Agregar producto a ${supplierName}`}
        </p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          {mode === "invoice" ? (
            <>
              Si el proveedor facturó algo que no estaba en el pedido (p. ej.
              vinos), agréguelo aquí con la cantidad de la factura. Entra a esta
              factura y queda <strong>pendiente de recibir</strong> después de
              pagar.
            </>
          ) : (
            <>
              Solo productos de categorías asignadas a este proveedor. Queda
              pendiente y se recibe con «Llegó ahora».
            </>
          )}
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
                  className="rounded-lg bg-[var(--solid)] px-3 py-1.5 text-sm text-[var(--on-solid)] disabled:opacity-60"
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
          <input
            type="hidden"
            name="source"
            value={mode === "invoice" ? "invoice" : "receive"}
          />
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
            className="rounded-lg bg-[var(--solid)] px-4 py-2 text-sm text-[var(--on-solid)] disabled:opacity-60"
          >
            {pending
              ? "Agregando…"
              : mode === "invoice"
                ? "Agregar a la factura"
                : "Agregar al pedido"}
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
      className="space-y-3 rounded-lg border-2 border-[var(--ink)] p-3"
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const r = await receivePurchaseItemsAction(requestId, fd);
          if (!r.ok) setError(r.error ?? "Error");
          else {
            notifyPendingActionsChanged();
            router.refresh();
          }
        });
      }}
    >
      <p className="text-sm font-medium">Recibir de {supplierName}</p>
      <p className="text-xs text-[var(--muted)]">
        {openItems.some(
          (item) =>
            item.invoice_payment_request_id && itemInvoicedQty(item) > 0,
        )
          ? "Esta orden ya está facturada: confirme lo que llegó contra esa cantidad."
          : "Confirme lo que llegó. Lo que no llega puede quedar pendiente."}
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
        className="rounded-lg bg-[var(--solid)] px-4 py-2 text-sm text-[var(--on-solid)] disabled:opacity-60"
      >
        {pending ? "Guardando…" : `Guardar recepción · ${supplierName}`}
      </button>
    </form>
  );
}

function SupplierOperationsPanel({
  requestId,
  items,
  products,
  categories,
  units,
  links,
  supplierMap,
  supplierTerms,
  orderNumberBySupplier,
  orderStatusBySupplier,
  paymentStatusById,
  canMarkOrdered,
  canReceive,
  canReceiveExtras,
  canCreateProduct,
  canAcceptInvoice,
  pending,
  startTransition,
  setError,
}: {
  requestId: string;
  items: ItemRow[];
  products: ProductOption[];
  categories: CategoryOption[];
  units: UnitOption[];
  links: CategorySupplierLink[];
  supplierMap: Map<string, string>;
  supplierTerms: Map<string, string>;
  orderNumberBySupplier: Record<string, string>;
  orderStatusBySupplier: Record<string, string>;
  paymentStatusById: Map<string, string>;
  canMarkOrdered: boolean;
  canReceive: boolean;
  canReceiveExtras: boolean;
  canCreateProduct: boolean;
  canAcceptInvoice: boolean;
  pending: boolean;
  startTransition: TransitionStartFunction;
  setError: Dispatch<SetStateAction<string | null>>;
}) {
  const [pickedHito, setPickedHito] = useState<PurchaseMilestone | null>(null);
  const [supplierKey, setSupplierKey] = useState<string | null>(null);
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
    awaitingPay: boolean;
    hito: PurchaseMilestone;
    nextStep: string;
    prepago: boolean;
    billingMode: "ordered" | "received";
    payGateLabel: string | null;
    ocStatus: string;
    orderNumber: string | undefined;
  };

  const views = groups.map((group): GroupView => {
      const terms = group.supplierId
        ? supplierTerms.get(group.supplierId) ?? "PREPAGO"
        : "PREPAGO";
      const prepago = isPrepagoTerms(terms);
      const ocStatus = group.supplierId
        ? orderStatusBySupplier[group.supplierId] ?? "POR_PEDIR"
        : "POR_PEDIR";
      const orderNumber = group.supplierId
        ? orderNumberBySupplier[group.supplierId]
        : undefined;
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
        ocStatus === "CERRADA" ||
        (openItems.length === 0 &&
          uninvoiced.length === 0 &&
          invoiced.length > 0);

      const canShowInvoice =
        canAcceptInvoice &&
        Boolean(group.supplierId) &&
        uninvoiced.length > 0 &&
        supplierOrderAllowsInvoice({ status: ocStatus, terms });

      const canShowReceive =
        canReceive &&
        openItems.length > 0 &&
        supplierOrderAllowsReceive({
          status: ocStatus,
          terms,
          allInvoicesPaid: allInvoicedPaid,
        });

      // Extras también al facturar (prepago/crédito): p. ej. vinos que el
      // proveedor cobró aunque no estuvieran en el pedido. Quedan por recibir.
      const canShowExtra =
        (canReceiveExtras || canAcceptInvoice) &&
        Boolean(group.supplierId) &&
        !isSettled &&
        (prepago
          ? ocStatus !== "ANULADA" && ocStatus !== "CERRADA"
          : ocStatus !== "POR_PEDIR") &&
        (canShowInvoice ||
          canShowReceive ||
          !prepago ||
          allInvoicedPaid);

      let payGateLabel: string | null = null;
      if (prepago && openItems.length > 0 && !canShowReceive) {
        if (uninvoiced.length > 0 && ocStatus !== "ANULADA") {
          payGateLabel =
            "Prepago: cargue la factura y págala antes de recibir.";
        } else if (awaitingPay) {
          payGateLabel =
            "Factura en cola: pague en Solicitudes de pago y notifique el comprobante al proveedor. Luego podrá recibir.";
        }
      } else if (
        !prepago &&
        ocStatus === "POR_PEDIR" &&
        openItems.length > 0
      ) {
        payGateLabel =
          "Crédito: marque «Ya pedí» en la orden de este proveedor antes de recibir o facturar.";
      }

      const nextStep = canShowInvoice
        ? "Siguiente: facturar"
        : awaitingPay
          ? "Siguiente: pagar"
          : canShowReceive
            ? "Siguiente: recibir"
            : isSettled
              ? "Listo"
              : ocStatus === "POR_PEDIR"
                ? "Siguiente: pedir"
                : invoiced.length > 0
                  ? "Factura en cola"
                  : payGateLabel
                    ? prepago
                      ? "Siguiente: facturar"
                      : "Siguiente: pedir"
                    : "Sin acción aún";

      const hito = purchaseMilestoneFor({
        status: ocStatus,
        prepago,
        isSettled,
        awaitingPay,
        hasUninvoiced: uninvoiced.length > 0,
        hasOpenItems: openItems.length > 0,
      });

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
        awaitingPay,
        hito,
        nextStep,
        prepago,
        billingMode,
        payGateLabel,
        ocStatus,
        orderNumber,
      };
    });

  const preferredHito =
    PURCHASE_MILESTONES.find(
      (milestone) =>
        milestone.id !== "listas" &&
        views.some((view) => view.hito === milestone.id),
    )?.id ?? "listas";
  const activeHito = pickedHito ?? preferredHito;
  const inTab = views
    .filter((view) => view.hito === activeHito)
    .sort((a, b) =>
      (a.orderNumber ?? "").localeCompare(b.orderNumber ?? "", "es"),
    );
  const selected =
    inTab.find(
      (view) => (view.group.supplierId ?? "sin") === supplierKey,
    ) ??
    inTab[0] ??
    null;
  const pedidoHref = `/compras/solicitudes/${requestId}/pedido`;

  function renderSupplierWork(view: GroupView) {
    const {
      group,
      openItems,
      closedItems,
      invoiced,
      canShowReceive,
      canShowInvoice,
      canShowExtra,
      hito,
      nextStep,
      prepago,
      billingMode,
      payGateLabel,
      ocStatus,
      orderNumber,
    } = view;
    const canMark = Boolean(
      canMarkOrdered &&
        group.supplierId &&
        supplierOrderAllowsMarkOrdered(ocStatus),
    );
    const canRemove =
      (hito === "pedir" || hito === "facturar") &&
      Boolean(group.supplierId) &&
      (canMarkOrdered || canAcceptInvoice) &&
      supplierOrderCanBeRemoved({
        status: ocStatus,
        hasInvoice: group.items.some((item) =>
          Boolean(item.invoice_payment_request_id),
        ),
        hasReceived: group.items.some(
          (item) => Number(item.quantity_received || 0) > 0,
        ),
      });
    const printHref = group.supplierId
      ? `${pedidoHref}?supplier=${group.supplierId}`
      : pedidoHref;

    const invoiceBlock =
      canShowInvoice && group.supplierId ? (
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
      ) : null;

    const receiveBlock = canShowReceive ? (
      <SupplierReceiveForm
        requestId={requestId}
        supplierName={group.supplierName}
        openItems={openItems}
        pending={pending}
        startTransition={startTransition}
        setError={setError}
      />
    ) : null;

    const history =
      closedItems.length > 0 ? (
        <details className="rounded-lg border border-[var(--line)] px-3 py-2">
          <summary className="cursor-pointer text-sm text-[var(--muted)]">
            Ya recibido o cerrado ({closedItems.length})
          </summary>
          <div className="mt-2 space-y-2">
            {closedItems.map((item) => (
              <ReceiveItemRow
                key={item.id}
                item={item}
                requestId={requestId}
                canUndoReceive={
                  canReceive && !item.invoice_payment_request_id
                }
                pending={pending}
                startTransition={startTransition}
                setError={setError}
              />
            ))}
          </div>
        </details>
      ) : null;

    const extra =
      hito !== "listas" &&
      hito !== "pedir" &&
      canShowExtra &&
      group.supplierId &&
      !canShowInvoice ? (
        <details className="rounded-lg border border-dashed border-[var(--line)] px-3 py-2">
          <summary className="cursor-pointer text-sm text-[var(--muted)]">
            Agregar producto extra a este proveedor
          </summary>
          <div className="mt-2">
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
              mode={hito === "facturar" ? "invoice" : "receive"}
            />
          </div>
        </details>
      ) : null;

    const orderLines = group.items.filter(
      (item) => item.status !== "CANCELADO" && itemOrderedQty(item) > 0,
    );

    return (
      <section className="overflow-hidden rounded-xl border border-[var(--line)] bg-white">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--line)] bg-neutral-50 px-4 py-3">
          <div className="min-w-0">
            <h3 className="font-medium">
              {orderNumber ? `${orderNumber} · ` : ""}
              {group.supplierName}
            </h3>
            <p className="text-sm text-[var(--muted)]">
              {group.items.length} producto
              {group.items.length === 1 ? "" : "s"} ·{" "}
              {prepago ? "Prepago" : "Crédito"} ·{" "}
              {purchaseSupplierOrderStatusLabel(ocStatus)}
            </p>
            {hito === "facturar" || hito === "pagar" || hito === "recibir" ? (
              <SupplierFlowChips prepago={prepago} nextStep={nextStep} />
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={printHref} className="text-sm text-[var(--accent)]">
              Imprimir
            </Link>
            {canMark ? (
              <button
                type="button"
                disabled={pending}
                className="rounded-lg bg-[var(--solid)] px-3 py-1.5 text-sm text-[var(--on-solid)] disabled:opacity-60"
                onClick={() =>
                  startTransition(async () => {
                    setError(null);
                    const result = await markPurchaseOrderedAction(
                      requestId,
                      group.supplierId!,
                    );
                    if (!result.ok) setError(result.error ?? "Error");
                  })
                }
              >
                Ya pedí / compré
              </button>
            ) : null}
            {canRemove ? (
              <button
                type="button"
                disabled={pending}
                className="rounded-lg px-3 py-1.5 text-sm text-red-700 disabled:opacity-60"
                onClick={() => {
                  const label = orderNumber
                    ? `${orderNumber} · ${group.supplierName}`
                    : group.supplierName;
                  if (
                    !window.confirm(
                      `¿Eliminar el pedido ${label}? Se quita de esta solicitud y no se puede deshacer.`,
                    )
                  ) {
                    return;
                  }
                  startTransition(async () => {
                    setError(null);
                    const result = await cancelPurchaseSupplierOrderAction(
                      requestId,
                      group.supplierId!,
                    );
                    if (!result.ok) setError(result.error ?? "Error");
                    else notifyPendingActionsChanged();
                  });
                }}
              >
                Eliminar pedido
              </button>
            ) : null}
          </div>
        </div>

        <div className="space-y-4 px-4 py-4">
          {hito === "pedir" ? (
            <>
              <p className="text-sm text-[var(--muted)]">
                Descargue el PDF, envíe el pedido y márquelo solo en esta
                orden.
                {prepago
                  ? " Si ya tiene la factura, puede cargarla abajo sin marcar el pedido."
                  : " En crédito, recibir y facturar se habilitan después de marcar el pedido."}
              </p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--line)] text-left text-[var(--muted)]">
                    <th className="py-2 font-medium">Producto</th>
                    <th className="py-2 text-right font-medium">Cantidad</th>
                    <th className="hidden py-2 font-medium sm:table-cell">
                      Entrega
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {orderLines.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-[var(--line)] last:border-b-0"
                    >
                      <td className="py-2.5 font-medium">
                        {item.product_name}
                        {item.notes ? (
                          <span className="mt-0.5 block text-xs font-normal text-[var(--muted)]">
                            {item.notes}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">
                        {formatPurchaseQty(itemOrderedQty(item))} {item.unit}
                      </td>
                      <td className="hidden py-2.5 text-[var(--muted)] sm:table-cell">
                        {item.expected_delivery_date
                          ? formatDateCO(item.expected_delivery_date)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {hito === "pedir" && !canMark ? (
                <p className="text-sm text-amber-800">
                  No tiene permiso para marcar pedida. Quien compre debe tener
                  «Pedir / comprar al proveedor».
                </p>
              ) : null}
              {prepago && invoiceBlock ? (
                <details className="rounded-lg border border-[var(--line)] px-3 py-2">
                  <summary className="cursor-pointer text-sm">
                    Facturar esta orden ahora
                  </summary>
                  <div className="mt-3 space-y-3">
                    {canShowExtra && group.supplierId ? (
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
                        mode="invoice"
                      />
                    ) : null}
                    {invoiceBlock}
                  </div>
                </details>
              ) : null}
            </>
          ) : null}

          {hito === "facturar" ? (
            <>
              {invoiceBlock}
              {!invoiceBlock && payGateLabel ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                  {payGateLabel}{" "}
                  <a className="underline" href="/solicitudes-pago">
                    Ir a Solicitudes de pago
                  </a>
                </p>
              ) : null}
              {canShowExtra && group.supplierId ? (
                <details className="rounded-lg border border-dashed border-[var(--line)] px-3 py-2">
                  <summary className="cursor-pointer text-sm text-[var(--muted)]">
                    Agregar producto extra a esta factura
                  </summary>
                  <div className="mt-3">
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
                      mode="invoice"
                    />
                  </div>
                </details>
              ) : null}
              {!group.supplierId ? (
                <p className="text-sm text-amber-800">
                  Asigne proveedor a estos productos para poder facturarlos.
                </p>
              ) : null}
            </>
          ) : null}

          {hito === "pagar" ? (
            <div className="space-y-3">
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                {payGateLabel ??
                  "La factura ya está cargada. Pague en Solicitudes de pago y luego vuelva a recibir."}{" "}
                <a className="underline" href="/solicitudes-pago">
                  Ir a Solicitudes de pago
                </a>
              </p>
              {invoiced.length > 0 ? (
                <ul className="space-y-1 text-sm text-[var(--muted)]">
                  {invoiced.map((item) => (
                    <li key={item.id}>{item.product_name}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {hito === "recibir" ? (
            <>
              {receiveBlock}
              {!canShowReceive && payGateLabel ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                  {payGateLabel}
                </p>
              ) : null}
              {invoiceBlock ? (
                <details className="rounded-lg border border-[var(--line)] px-3 py-2">
                  <summary className="cursor-pointer text-sm text-[var(--muted)]">
                    Facturar lo que ya llegó
                  </summary>
                  <div className="mt-3">{invoiceBlock}</div>
                </details>
              ) : null}
              {history}
              {extra}
            </>
          ) : null}

          {hito === "listas" ? (
            <>
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                Esta orden ya no tiene pasos pendientes.
              </p>
              {history ?? (
                <ul className="space-y-1 text-sm">
                  {orderLines.map((item) => (
                    <li key={item.id}>
                      {item.product_name}{" "}
                      <span className="text-[var(--muted)]">
                        {formatPurchaseQty(itemOrderedQty(item))} {item.unit}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div>
        <h3 className="font-medium">Órdenes por hito</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Cada proveedor está en un solo paso. Abra el hito y elija la orden.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-[var(--line)] pb-3">
        {PURCHASE_MILESTONES.map((milestone) => {
          const count = views.filter((view) => view.hito === milestone.id).length;
          const active = milestone.id === activeHito;
          return (
            <button
              key={milestone.id}
              type="button"
              onClick={() => {
                setPickedHito(milestone.id);
                setSupplierKey(null);
              }}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                active
                  ? "bg-[var(--solid)] text-[var(--on-solid)]"
                  : "text-[var(--muted)] hover:bg-neutral-100 hover:text-[var(--ink)]"
              }`}
            >
              {milestone.label} ({count})
            </button>
          );
        })}
      </div>

      {inTab.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--line)] bg-white px-4 py-6 text-sm text-[var(--muted)]">
          {PURCHASE_MILESTONES.find((milestone) => milestone.id === activeHito)
            ?.empty}
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {inTab.map((view) => {
              const key = view.group.supplierId ?? "sin";
              const active = (selected?.group.supplierId ?? "sin") === key;
              return (
                <button
                  key={key}
                  type="button"
                  title={view.group.supplierName}
                  onClick={() => setSupplierKey(key)}
                  className={`rounded-lg border px-3 py-2 text-left text-sm ${
                    active
                      ? "border-[var(--ink)] bg-neutral-100 font-medium text-[var(--ink)]"
                      : "border-[var(--line)] bg-neutral-50 text-[var(--ink)]"
                  }`}
                >
                  <span className="block">{view.orderNumber ?? "Sin OC"}</span>
                  <span className="block max-w-[220px] truncate text-xs text-[var(--muted)]">
                    {view.group.supplierName} · {view.group.items.length}
                  </span>
                </button>
              );
            })}
          </div>
          {selected ? renderSupplierWork(selected) : null}
        </div>
      )}
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
        className="rounded-lg bg-[var(--solid)] px-4 py-2 text-sm text-[var(--on-solid)] disabled:opacity-60"
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
  orderNumberBySupplier = {},
  orderStatusBySupplier = {},
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
  orderNumberBySupplier?: Record<string, string>;
  orderStatusBySupplier?: Record<string, string>;
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
  const supplierMix = useMemo(() => {
    const entries = items
      .map((i) => {
        const id = i.approved_supplier_id ?? i.suggested_supplier_id;
        if (!id) return null;
        return {
          id,
          name: supplierMap.get(id) ?? "Proveedor",
          terms: supplierTerms.get(id),
        };
      })
      .filter((e): e is { id: string; name: string; terms: string | undefined } =>
        Boolean(e),
      );
    return classifySuppliersByTerms(entries);
  }, [items, supplierMap, supplierTerms]);
  const existingProductIds = new Set(items.map((i) => i.product_id));
  const inSupplierFlow = [
    "APROBADA",
    "PEDIDA",
    "RECIBIDA_PARCIAL",
    "RECIBIDA",
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
      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="rounded-xl border border-[var(--line)] bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-medium">{request.title}</h2>
            <p className="text-sm text-[var(--muted)]">
              {formatDateCO(request.requested_at)}
              {request.location_label ? ` · ${request.location_label}` : ""}
              {request.needed_by
                ? ` · necesaria ${formatDateCO(request.needed_by)}`
                : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {request.is_urgent ? (
                <Badge tone="danger">Urgente</Badge>
              ) : null}
              {request.payment_mode === "EFECTIVO_INMEDIATO" ? (
                <Badge tone="warn">
                  {PURCHASE_PAYMENT_MODE_SHORT.EFECTIVO_INMEDIATO}
                </Badge>
              ) : request.payment_mode === "CREDITO" ? (
                <Badge tone="ok">
                  {PURCHASE_PAYMENT_MODE_SHORT.CREDITO}
                </Badge>
              ) : null}
            </div>
            {request.notes ? (
              <p className="mt-2 text-sm text-[var(--muted)]">{request.notes}</p>
            ) : null}
            {request.rejection_reason ? (
              <p className="mt-2 text-sm text-red-700">
                Rechazo: {request.rejection_reason}
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
        {inSupplierFlow ? null : (
          <>
            <RequestProcessSteps status={request.status} />
            <div className="mt-4">
              <NextActionGuide
                status={request.status}
                canCreate={canCreate}
                canApprove={canApprove}
                canMarkOrdered={canMarkOrdered}
                canReceive={canReceive}
                canAcceptInvoice={canAcceptInvoice}
                supplierMix={supplierMix}
                itemCount={items.length}
              />
            </div>
          </>
        )}
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
            orderNumberBySupplier={orderNumberBySupplier}
            orderStatusBySupplier={orderStatusBySupplier}
          />
        )
      ) : null}

      {request.status === "BORRADOR" && canCreate ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={pending || items.length === 0}
            className="rounded-lg bg-[var(--solid)] px-5 py-2.5 text-sm text-[var(--on-solid)] disabled:opacity-60"
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
          <button
            type="button"
            disabled={pending}
            className="rounded-lg px-4 py-2.5 text-sm text-red-700 disabled:opacity-60"
            onClick={() => {
              if (
                !window.confirm(
                  "¿Eliminar este borrador? Esta acción no se puede deshacer.",
                )
              ) {
                return;
              }
              startTransition(async () => {
                setError(null);
                const r = await deletePurchaseRequestAction(request.id);
                if (!r.ok) setError(r.error ?? "Error");
                else window.location.href = "/compras/solicitudes";
              });
            }}
          >
            Eliminar borrador
          </button>
        </div>
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
            <h3 className="font-medium">Revisión para autorizar</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Ajuste proveedor, cantidad y entrega si hace falta.
              {request.payment_mode === "EFECTIVO_INMEDIATO"
                ? " El local pide efectivo de caja."
                : " El local pide factura (sin efectivo de caja)."}
              {request.is_urgent ? " Marcada como urgente." : ""}
            </p>
            {supplierMix.hasPrepago || supplierMix.hasCredito ? (
              <SupplierMixGuide mix={supplierMix} compact />
            ) : null}
          </div>
          {approveGroups.map((group) => {
            const groupSupplier = group.supplierId
              ? suppliers.find((s) => s.id === group.supplierId)
              : null;
            return (
            <div
              key={group.supplierId ?? "sin"}
              className="overflow-hidden rounded-xl border border-[var(--line)] bg-white"
            >
              <div className="border-b border-[var(--line)] bg-neutral-50 px-4 py-3">
                <h4 className="font-medium">{group.supplierName}</h4>
                <p className="text-sm text-[var(--muted)]">
                  {group.items.length} producto
                  {group.items.length === 1 ? "" : "s"}
                  {group.supplierId
                    ? ` · ${supplierPaymentTermsShort(groupSupplier?.purchase_payment_terms)}`
                    : ""}
                </p>
                {group.supplierId ? (
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    {supplierPaymentTermsLabel(
                      groupSupplier?.purchase_payment_terms,
                    )}
                  </p>
                ) : null}
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
                              {formatSupplierSelectLabel(s.name, {
                                terms: s.purchase_payment_terms,
                                leadTimeDays: s.lead_time_days,
                              })}
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
            );
          })}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={pending || items.length === 0}
              className="rounded-lg bg-[var(--solid)] px-5 py-2.5 text-sm text-[var(--on-solid)] disabled:opacity-60"
            >
              Autorizar compra
            </button>
          </div>
        </form>
      ) : null}

      {request.status === "ENVIADA" && !canApprove ? (
        <div className="space-y-3">
          <SupplierOrdersPanel
            requestId={request.id}
            items={items}
            supplierMap={supplierMap}
            orderNumberBySupplier={orderNumberBySupplier}
            orderStatusBySupplier={orderStatusBySupplier}
            compact
          />
        </div>
      ) : null}

      {inSupplierFlow ? (
        <SupplierOperationsPanel
          requestId={request.id}
          items={items}
          products={products}
          categories={categories}
          units={units}
          links={links}
          supplierMap={supplierMap}
          supplierTerms={supplierTerms}
          orderNumberBySupplier={orderNumberBySupplier}
          orderStatusBySupplier={orderStatusBySupplier}
          paymentStatusById={new Map(Object.entries(paymentStatusById))}
          canMarkOrdered={canMarkOrdered}
          canReceive={canReceive}
          canReceiveExtras={canReceiveExtras}
          canCreateProduct={canCreateProduct}
          canAcceptInvoice={canAcceptInvoice}
          pending={pending}
          startTransition={startTransition}
          setError={setError}
        />
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
    </div>
  );
}
