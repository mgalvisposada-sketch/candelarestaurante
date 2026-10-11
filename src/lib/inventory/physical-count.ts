/**
 * Inventario físico manda sobre todo stock contable:
 * materia prima, insumos preparación y preparaciones.
 * (Productos de carta no se cuentan aquí: son menú / food cost.)
 */
export const PHYSICAL_COUNT_ITEM_KINDS = [
  "MATERIA_PRIMA",
  "INSUMO_PREPARACION",
  "PREPARACION",
] as const;

export type PhysicalCountItemKind =
  (typeof PHYSICAL_COUNT_ITEM_KINDS)[number];

export const PHYSICAL_COUNT_NONE_CATEGORY = "__none__";

export function normalizePhysicalCategoryId(
  categoryId: string | null | undefined,
) {
  if (!categoryId || categoryId === PHYSICAL_COUNT_NONE_CATEGORY) {
    return PHYSICAL_COUNT_NONE_CATEGORY;
  }
  return categoryId;
}

export type DraftCategoryOccupant = {
  userId: string;
};

/**
 * Una categoría con ítems en borrador queda ocupada por quien empezó
 * a contarla (primer created_by no nulo por created_at).
 */
export function draftCategoryOccupants(
  drafts: {
    product_id: string;
    created_by?: string | null;
    created_at?: string | null;
  }[],
  productCategoryById: Map<string, string | null | undefined>,
): Map<string, DraftCategoryOccupant> {
  const sorted = [...drafts].sort((a, b) => {
    const ta = a.created_at ?? "";
    const tb = b.created_at ?? "";
    return ta.localeCompare(tb);
  });

  const occupants = new Map<string, DraftCategoryOccupant>();
  for (const draft of sorted) {
    if (!draft.created_by) continue;
    const categoryId = normalizePhysicalCategoryId(
      productCategoryById.get(draft.product_id),
    );
    if (occupants.has(categoryId)) continue;
    occupants.set(categoryId, { userId: draft.created_by });
  }
  return occupants;
}
