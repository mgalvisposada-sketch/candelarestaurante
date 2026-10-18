/** Deuda arriba (dinámico); sin deuda, puesto estable por volumen comprado. */
export function compareSuppliersByPriority(
  a: { id: string; name: string; is_active: boolean },
  b: { id: string; name: string; is_active: boolean },
  balanceBySupplier: Record<string, number>,
  billedBySupplier: Record<string, number>,
): number {
  const balA = balanceBySupplier[a.id] ?? 0;
  const balB = balanceBySupplier[b.id] ?? 0;
  const owesA = balA > 0;
  const owesB = balB > 0;

  // Quien tiene saldo pendiente siempre va arriba; al pagar vuelve al ranking por compras.
  if (owesA !== owesB) return owesA ? -1 : 1;
  if (owesA && owesB && balB !== balA) return balB - balA;

  const billedA = billedBySupplier[a.id] ?? 0;
  const billedB = billedBySupplier[b.id] ?? 0;
  if (billedB !== billedA) return billedB - billedA;
  if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
  return a.name.localeCompare(b.name, "es");
}
