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
import {
  acceptPurchaseInvoiceAction,
  addPurchaseRequestItemsByCategoryAction,
  approvePurchaseRequestAction,
  importSuggestedProductsAction,
  receivePurchaseItemsAction,
  rejectPurchaseRequestAction,
  removePurchaseRequestItemAction,
  submitPurchaseRequestAction,
  updatePurchaseRequestItemAction,
} from "../../purchase-actions";
import { createProductFromRequestAction } from "../../inventory-actions";
import { Badge } from "@/components/ui/primitives";
import { formatDateCO, todayInBogota } from "@/lib/dates";
import { formatCOP } from "@/lib/money";
import { suggestedPurchaseQty } from "@/lib/inventory/cost";
import { parseBulkNumber } from "@/lib/inventory/bulk-paste";
import {
  groupItemsBySupplier,
  groupPurchaseItemsBySupplier,
} from "@/lib/purchases/supplier-orders";

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

function RequestProcessSteps({ status }: { status: string }) {
  const steps = [
    { key: "BORRADOR", label: "Armar" },
    { key: "ENVIADA", label: "Aprobar" },
    { key: "PEDIDA", label: "Pedir (PDF)" },
    { key: "RECIBIDA", label: "Recibir / facturar" },
    { key: "FACTURA_ACEPTADA", label: "Cerrado" },
  ] as const;

  const activeIndex = (() => {
    if (status === "BORRADOR") return 0;
    if (status === "ENVIADA") return 1;
    if (status === "PEDIDA") return 2;
    if (["RECIBIDA", "RECIBIDA_PARCIAL"].includes(status)) return 3;
    if (status === "FACTURA_ACEPTADA") return 4;
    if (["RECHAZADA", "ANULADA"].includes(status)) return -1;
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
  return Number(item.quantity_approved ?? item.quantity_requested);
}

function itemPendingQty(item: ItemRow) {
  return Math.max(itemOrderedQty(item) - Number(item.quantity_received || 0), 0);
}

function isItemClosed(item: ItemRow) {
  if (item.status === "CANCELADO" || item.status === "RECIBIDO") return true;
  return itemPendingQty(item) <= 0;
}

function ReceiveItemRow({ item }: { item: ItemRow }) {
  const [disposition, setDisposition] = useState<"pendiente" | "llego" | "no_llegara">(
    "pendiente",
  );
  const ordered = itemOrderedQty(item);
  const received = Number(item.quantity_received || 0);
  const pendingQty = itemPendingQty(item);
  const closed = isItemClosed(item);
  const estimate = Number(item.unit_cost_estimate || 0);
  const [qtyRaw, setQtyRaw] = useState(String(pendingQty));
  const [totalCostRaw, setTotalCostRaw] = useState(() => {
    if (estimate > 0 && pendingQty > 0) {
      return String(Math.round(estimate * pendingQty));
    }
    return "";
  });

  const qtyNow = parseBulkNumber(qtyRaw);
  const totalCost = parseBulkNumber(totalCostRaw);
  const unitCost =
    qtyNow != null && qtyNow > 0 && totalCost != null && totalCost >= 0
      ? totalCost / qtyNow
      : null;

  if (closed) {
    return (
      <div className="rounded-lg border border-[var(--line)] bg-neutral-50 px-3 py-3 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-medium">{item.product_name}</p>
            <p className="text-[var(--muted)]">
              Pedido {ordered} · recibido {received} {item.unit}
            </p>
          </div>
          <Badge tone={item.status === "CANCELADO" ? "warn" : "ok"}>
            {item.status === "CANCELADO"
              ? received > 0
                ? "Cerrado (faltante)"
                : "No llegará"
              : "Recibido completo"}
          </Badge>
        </div>
        {item.status === "CANCELADO" && item.notes ? (
          <p className="mt-1 text-xs text-[var(--muted)]">{item.notes}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-[var(--line)] px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="text-sm">
          <p className="font-medium">{item.product_name}</p>
          <p className="text-[var(--muted)]">
            Pedido {ordered} · ya recibido {received} · pendiente{" "}
            <span className="font-medium text-[var(--ink)]">
              {pendingQty} {item.unit}
            </span>
            {item.expected_delivery_date
              ? ` · est. ${formatDateCO(item.expected_delivery_date)}`
              : ""}
          </p>
        </div>
      </div>

      <fieldset className="flex flex-wrap gap-3 text-sm">
        <legend className="sr-only">Disposición {item.product_name}</legend>
        {(
          [
            ["pendiente", "Sigue pendiente"],
            ["llego", "Llegó ahora"],
            ["no_llegara", "No llegará"],
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
        <div className="grid gap-2 md:grid-cols-2">
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
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--muted)]">
              Costo total de esta entrega
            </span>
            <input
              value={totalCostRaw}
              onChange={(e) => setTotalCostRaw(e.target.value)}
              placeholder="Ej. 20000"
              className={inputClass}
              inputMode="decimal"
            />
            <input
              type="hidden"
              name={`item_${item.id}_unit_cost`}
              value={unitCost != null ? String(unitCost) : ""}
            />
          </label>
          <p className="text-xs text-[var(--muted)] md:col-span-2">
            Ponga lo que pagó por esta cantidad (ej. $20.000 por 5000 {item.unit}
            ).{" "}
            {unitCost != null ? (
              <>
                Queda{" "}
                <span className="font-medium text-[var(--ink)]">
                  {formatCOP(unitCost)} / {item.unit}
                </span>{" "}
                para el inventario.
              </>
            ) : (
              <>Si deja el costo vacío, se usa el estimado anterior.</>
            )}
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
            placeholder="Ej. proveedor no tenía stock"
            className={inputClass}
          />
          <p className="mt-1 text-xs text-[var(--muted)]">
            Se cierra el faltante. El stock no sube por lo no recibido
            {received > 0 ? ` (ya quedó en inventario: ${received} ${item.unit})` : ""}.
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

function SupplierInvoiceForm({
  requestId,
  supplierId,
  supplierName,
  items,
  pending,
  startTransition,
  setError,
}: {
  requestId: string;
  supplierId: string;
  supplierName: string;
  items: ItemRow[];
  pending: boolean;
  startTransition: TransitionStartFunction;
  setError: Dispatch<SetStateAction<string | null>>;
}) {
  const billable = items.filter(
    (i) =>
      Number(i.quantity_received || 0) > 0 && !i.invoice_payment_request_id,
  );
  const suggestedAmount = billable.reduce((acc, item) => {
    const received = Number(item.quantity_received || 0);
    const unitCost = Number(item.unit_cost_estimate || 0);
    return acc + received * unitCost;
  }, 0);
  const [amount, setAmount] = useState(
    suggestedAmount > 0 ? String(Math.round(suggestedAmount)) : "",
  );
  const amountNum = parseBulkNumber(amount);
  const diff =
    amountNum != null && suggestedAmount > 0
      ? amountNum - suggestedAmount
      : null;

  if (billable.length === 0) return null;

  return (
    <form
      className="space-y-3 rounded-lg border-2 border-[var(--ink)] bg-white p-4"
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const r = await acceptPurchaseInvoiceAction(requestId, fd);
          if (!r.ok) setError(r.error ?? "Error");
        });
      }}
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
          Paso factura · solo {supplierName}
        </p>
        <h5 className="mt-1 text-sm font-medium">
          ¿Cuánto le cobró {supplierName} por lo que ya llegó?
        </h5>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Aquí NO aparecen cebolla, huevos ni otros proveedores. Solo lo
          recibido de {supplierName}.
        </p>
      </div>
      <ul className="space-y-1 rounded-lg bg-neutral-50 px-3 py-2 text-sm">
        {billable.map((item) => {
          const received = Number(item.quantity_received || 0);
          const unitCost = Number(item.unit_cost_estimate || 0);
          return (
            <li key={item.id} className="flex justify-between gap-2">
              <span>
                {item.product_name}{" "}
                <span className="text-[var(--muted)]">
                  · {received} {item.unit}
                </span>
              </span>
              <span className="tabular-nums">{formatCOP(received * unitCost)}</span>
            </li>
          );
        })}
        <li className="flex justify-between gap-2 border-t border-[var(--line)] pt-1 font-medium">
          <span>Sugerido</span>
          <span className="tabular-nums">{formatCOP(suggestedAmount)}</span>
        </li>
      </ul>
      <input type="hidden" name="supplier_id" value={supplierId} />
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block text-[var(--muted)]">
            Monto de la factura de {supplierName} *
          </span>
          <input
            name="amount"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={inputClass}
            placeholder="Ej. 13000"
          />
          {diff != null && Math.abs(diff) > 1 ? (
            <span className="mt-1 block text-xs text-amber-800">
              Diferencia vs estimado: {formatCOP(diff)}
            </span>
          ) : null}
        </label>
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
        disabled={pending}
        className="rounded-lg bg-[var(--ink)] px-4 py-2.5 text-sm text-white disabled:opacity-60"
      >
        Enviar factura de {supplierName} a cola de pago
      </button>
    </form>
  );
}

function SupplierOperationsPanel({
  requestId,
  items,
  supplierMap,
  canReceive,
  canAcceptInvoice,
  pending,
  startTransition,
  setError,
}: {
  requestId: string;
  items: ItemRow[];
  supplierMap: Map<string, string>;
  canReceive: boolean;
  canAcceptInvoice: boolean;
  pending: boolean;
  startTransition: TransitionStartFunction;
  setError: Dispatch<SetStateAction<string | null>>;
}) {
  const groups = groupPurchaseItemsBySupplier(items, supplierMap, {
    includeCancelled: true,
  });

  if (groups.length === 0) return null;

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-[var(--line)] bg-white p-4">
        <h3 className="font-medium">Recibir y facturar por proveedor</h3>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-[var(--muted)]">
          <li>Abra el proveedor que le llegó (ej. Hielo).</li>
          <li>Registre la recepción solo de ese proveedor.</li>
          <li>
            En el mismo bloque, cargue la factura de ese proveedor (solo lo
            suyo).
          </li>
          <li>Cuando llegue otro proveedor, repita en su bloque.</li>
        </ol>
      </div>

      <div className="space-y-3">
        {groups.map((group) => {
          const openItems = group.items.filter((i) => !isItemClosed(i));
          const closedItems = group.items.filter((i) => isItemClosed(i));
          const uninvoiced = group.items.filter(
            (i) =>
              Number(i.quantity_received || 0) > 0 &&
              !i.invoice_payment_request_id,
          );
          const invoiced = group.items.filter((i) => i.invoice_payment_request_id);
          const canShowReceive = canReceive && openItems.length > 0;
          const canShowInvoice =
            canAcceptInvoice &&
            Boolean(group.supplierId) &&
            uninvoiced.length > 0;
          const needsAttention = canShowReceive || canShowInvoice;

          if (!needsAttention && invoiced.length === 0 && closedItems.length === 0) {
            return null;
          }

          const statusLabel = canShowInvoice
            ? "Listo para facturar"
            : canShowReceive
              ? "Esperando recepción"
              : invoiced.length > 0
                ? "Factura enviada"
                : "Sin acción";

          return (
            <details
              key={group.supplierId ?? "sin"}
              className={`overflow-hidden rounded-xl border bg-white ${
                canShowInvoice
                  ? "border-[var(--ink)]"
                  : "border-[var(--line)]"
              }`}
            >
              <summary className="cursor-pointer list-none bg-neutral-50 px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{group.supplierName}</p>
                    <p className="text-sm text-[var(--muted)]">
                      {group.items.length} producto
                      {group.items.length === 1 ? "" : "s"} · {statusLabel}
                    </p>
                  </div>
                  <span className="text-sm text-[var(--muted)]">Ver / ocultar</span>
                </div>
              </summary>

              <div className="space-y-4 border-t border-[var(--line)] px-3 py-3">
                {canShowInvoice && group.supplierId ? (
                  <SupplierInvoiceForm
                    requestId={requestId}
                    supplierId={group.supplierId}
                    supplierName={group.supplierName}
                    items={group.items}
                    pending={pending}
                    startTransition={startTransition}
                    setError={setError}
                  />
                ) : null}

                {!canShowInvoice && invoiced.length > 0 ? (
                  <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                    Factura de {group.supplierName} ya en{" "}
                    <a className="underline" href="/solicitudes-pago">
                      Solicitudes de pago
                    </a>
                    . Los otros proveedores se facturan en su propio bloque.
                  </p>
                ) : null}

                {canShowReceive ? (
                  <form
                    className="space-y-3 rounded-lg border border-[var(--line)] p-3"
                    action={(fd) => {
                      setError(null);
                      startTransition(async () => {
                        const r = await receivePurchaseItemsAction(
                          requestId,
                          fd,
                        );
                        if (!r.ok) setError(r.error ?? "Error");
                      });
                    }}
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                      Paso recepción · solo {group.supplierName}
                    </p>
                    {openItems.map((item) => (
                      <ReceiveItemRow key={item.id} item={item} />
                    ))}
                    <button
                      type="submit"
                      disabled={pending}
                      className="rounded-lg bg-[var(--ink)] px-4 py-2 text-sm text-white disabled:opacity-60"
                    >
                      {pending
                        ? "Guardando…"
                        : `Registrar recepción · ${group.supplierName}`}
                    </button>
                  </form>
                ) : null}

                {closedItems.length > 0 && !canShowInvoice ? (
                  <details className="rounded-lg border border-[var(--line)] px-3 py-2">
                    <summary className="cursor-pointer text-sm text-[var(--muted)]">
                      Detalle recibido / cerrado ({closedItems.length})
                    </summary>
                    <div className="mt-2 space-y-2">
                      {closedItems.map((item) => (
                        <ReceiveItemRow key={item.id} item={item} />
                      ))}
                    </div>
                  </details>
                ) : null}

                {!group.supplierId ? (
                  <p className="text-sm text-amber-800">
                    Asigne proveedor a estos ítems para poder facturarlos.
                  </p>
                ) : null}
              </div>
            </details>
          );
        })}
      </div>
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
  canCreate,
  canCreateProduct,
  canApprove,
  canReceive,
  canAcceptInvoice,
}: {
  request: RequestDetail;
  items: ItemRow[];
  products: ProductOption[];
  categories: CategoryOption[];
  units: UnitOption[];
  suppliers: SupplierOption[];
  links: CategorySupplierLink[];
  canCreate: boolean;
  canCreateProduct: boolean;
  canApprove: boolean;
  canReceive: boolean;
  canAcceptInvoice: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const supplierMap = useMemo(
    () => new Map(suppliers.map((s) => [s.id, s.name])),
    [suppliers],
  );
  const existingProductIds = new Set(items.map((i) => i.product_id));
  const showSupplierOrders = [
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
        <RequestProcessSteps status={request.status} />
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
            })
          }
        >
          Enviar a compras
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
            });
          }}
        >
          <div className="rounded-xl border border-[var(--line)] bg-white p-5">
            <h3 className="font-medium">Aprobar por proveedor</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Revise cada grupo, confirme proveedor/cantidad/entrega. Al aprobar
              podrá imprimir el pedido de cada proveedor.
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
              Aprobar y marcar pedida
            </button>
          </div>
        </form>
      ) : null}

      {request.status === "ENVIADA" && !canApprove ? (
        <SupplierOrdersPanel
          requestId={request.id}
          items={items}
          supplierMap={supplierMap}
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

      {["PEDIDA", "RECIBIDA", "RECIBIDA_PARCIAL", "FACTURA_ACEPTADA"].includes(
        request.status,
      ) &&
      (canReceive || canAcceptInvoice) ? (
        <SupplierOperationsPanel
          requestId={request.id}
          items={items}
          supplierMap={supplierMap}
          canReceive={canReceive}
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
