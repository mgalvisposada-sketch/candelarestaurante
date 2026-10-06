export type SupplierOrderItem = {
  id: string;
  product_name: string;
  category_name: string;
  quantity: number;
  unit: string;
  expected_delivery_date: string | null;
  notes: string | null;
  status: string;
};

export type SupplierOrderGroup = {
  supplierId: string | null;
  supplierName: string;
  items: SupplierOrderItem[];
};

export type SupplierKeyedItem = {
  approved_supplier_id: string | null;
  suggested_supplier_id: string | null;
  status: string;
};

export type SupplierItemGroup<T> = {
  supplierId: string | null;
  supplierName: string;
  items: T[];
};

/** Agrupa filas de solicitud por proveedor aprobado (o sugerido). */
export function groupPurchaseItemsBySupplier<T extends SupplierKeyedItem>(
  items: T[],
  supplierNames: Map<string, string>,
  options?: { includeCancelled?: boolean },
): SupplierItemGroup<T>[] {
  const includeCancelled = options?.includeCancelled ?? false;
  const groups = new Map<string, SupplierItemGroup<T>>();

  for (const item of items) {
    if (!includeCancelled && item.status === "CANCELADO") continue;

    const supplierId =
      item.approved_supplier_id ?? item.suggested_supplier_id ?? null;
    const key = supplierId ?? "__sin_proveedor__";
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(item);
      continue;
    }
    groups.set(key, {
      supplierId,
      supplierName: supplierId
        ? (supplierNames.get(supplierId) ?? "Proveedor")
        : "Sin proveedor asignado",
      items: [item],
    });
  }

  return [...groups.values()].sort((a, b) => {
    if (!a.supplierId && b.supplierId) return 1;
    if (a.supplierId && !b.supplierId) return -1;
    return a.supplierName.localeCompare(b.supplierName, "es");
  });
}

/**
 * Vista de documento: agrupa y normaliza cantidades a pedir.
 */
export function groupItemsBySupplier(
  items: Array<
    SupplierKeyedItem & {
      id: string;
      product_name?: string;
      product_id: string;
      category_name?: string;
      quantity_requested: number | string;
      quantity_approved: number | string | null;
      unit: string;
      expected_delivery_date: string | null;
      notes: string | null;
    }
  >,
  supplierNames: Map<string, string>,
  options?: { includeCancelled?: boolean },
): SupplierOrderGroup[] {
  return groupPurchaseItemsBySupplier(items, supplierNames, options)
    .map((group) => ({
      supplierId: group.supplierId,
      supplierName: group.supplierName,
      items: group.items
        .map((item) => {
          const quantity = Number(
            item.quantity_approved ?? item.quantity_requested ?? 0,
          );
          if (!(quantity > 0)) return null;
          return {
            id: item.id,
            product_name: item.product_name ?? item.product_id,
            category_name: item.category_name ?? "Sin categoría",
            quantity,
            unit: item.unit,
            expected_delivery_date: item.expected_delivery_date,
            notes: item.notes,
            status: item.status,
          } satisfies SupplierOrderItem;
        })
        .filter((line): line is SupplierOrderItem => line != null),
    }))
    .filter((group) => group.items.length > 0);
}
