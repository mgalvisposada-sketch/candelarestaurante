import { roundMoney } from "@/lib/purchases/invoice-charges";
import { formatPurchaseQty, roundPurchaseQty } from "@/lib/purchases/qty";

export type PurchaseInvoiceLine = {
  id: string;
  purchaseRequestId: string;
  productName: string;
  supplierInvoiceLabel: string | null;
  unit: string;
  quantityOrdered: number;
  quantityReceived: number;
  /** Cantidad usada para armar el total aproximado de la línea. */
  billedQty: number;
  unitCost: number;
  lineTotal: number;
};

export type ParsedInvoiceNotes = {
  purchaseRequestId: string | null;
  merchandise: number | null;
  adjustments: Array<{
    kind: "cargo" | "descuento";
    concept: string;
    amount: number;
    affectsCost: boolean;
  }>;
  /** Líneas embebidas en notas (facturas nuevas). */
  noteLines: Array<{
    label: string;
    qty: number;
    unitCost: number;
    lineTotal: number;
  }>;
};

/** Cantidad facturable reconstruida cuando no hay snapshot de línea. */
export function reconstructBilledQty(opts: {
  quantityApproved: number | string | null;
  quantityRequested: number | string | null;
  quantityReceived: number | string | null;
}): number {
  const ordered = roundPurchaseQty(
    Number(opts.quantityApproved ?? opts.quantityRequested ?? 0),
  );
  const received = roundPurchaseQty(Number(opts.quantityReceived || 0));
  // Prepago factura contra pedido; crédito contra recibido.
  // Si ya hay recepción, preferimos la mayor para no subestimar prepago facturado.
  if (received <= 0) return ordered;
  if (ordered <= 0) return received;
  return Math.max(ordered, received);
}

export function parsePaymentInvoiceNotes(
  notes: string | null | undefined,
): ParsedInvoiceNotes {
  const text = notes?.trim() ?? "";
  const purchaseMatch = text.match(
    /Desde compra\s+([0-9a-f-]{36})/i,
  );
  const merchandiseMatch = text.match(/Mercanc[ií]a\s+([0-9]+(?:\.[0-9]+)?)/i);
  const adjustments: ParsedInvoiceNotes["adjustments"] = [];
  const adjBlock = text.match(/Ajustes:\s*(.+?)(?:\s*·\s*L[ií]neas:|$)/i);
  if (adjBlock?.[1]) {
    for (const part of adjBlock[1].split(";")) {
      const m = part
        .trim()
        .match(
          /^(cargo|descuento)\s+(.+?):\s*([+\-−]?)\s*([0-9]+(?:\.[0-9]+)?)(?:\s*\((→\s*costo|gasto)\))?/i,
        );
      if (!m) continue;
      const kind = m[1].toLowerCase() === "descuento" ? "descuento" : "cargo";
      adjustments.push({
        kind,
        concept: m[2].trim(),
        amount: Number(m[4]),
        affectsCost: (m[5] ?? "").includes("costo"),
      });
    }
  }

  const noteLines: ParsedInvoiceNotes["noteLines"] = [];
  const linesBlock = text.match(/L[ií]neas:\s*(.+)$/i);
  if (linesBlock?.[1]) {
    for (const part of linesBlock[1].split("|")) {
      const m = part
        .trim()
        .match(
          /^(.+?):\s*([0-9]+(?:\.[0-9]+)?)\s*×\s*([0-9]+(?:\.[0-9]+)?)\s*=\s*([0-9]+(?:\.[0-9]+)?)/,
        );
      if (!m) continue;
      noteLines.push({
        label: m[1].trim(),
        qty: Number(m[2]),
        unitCost: Number(m[3]),
        lineTotal: Number(m[4]),
      });
    }
  }

  return {
    purchaseRequestId: purchaseMatch?.[1] ?? null,
    merchandise: merchandiseMatch ? Number(merchandiseMatch[1]) : null,
    adjustments,
    noteLines,
  };
}

export function buildInvoiceNotesPayload(opts: {
  purchaseRequestId: string;
  supplierId: string;
  merchandise: number;
  charges: Array<{
    concept: string;
    amount: number;
    kind: "cargo" | "descuento";
    affectsCost: boolean;
  }>;
  lines: Array<{
    label: string;
    qty: number;
    unitCost: number;
  }>;
}): string {
  const chargeSummary =
    opts.charges.length > 0
      ? opts.charges
          .map((c) => {
            const sign = c.kind === "descuento" ? "−" : "+";
            const tag = c.kind === "descuento" ? "descuento" : "cargo";
            return `${tag} ${c.concept}: ${sign}${c.amount}${
              c.affectsCost ? " (→ costo)" : " (gasto)"
            }`;
          })
          .join("; ")
      : null;

  const linesSummary =
    opts.lines.length > 0
      ? opts.lines
          .map((l) => {
            const total = roundMoney(l.qty * l.unitCost);
            return `${l.label}: ${formatPurchaseQty(l.qty)} × ${l.unitCost} = ${total}`;
          })
          .join(" | ")
      : null;

  return [
    `Desde compra ${opts.purchaseRequestId} · proveedor ${opts.supplierId}`,
    `Mercancía ${opts.merchandise}`,
    chargeSummary ? `Ajustes: ${chargeSummary}` : null,
    linesSummary ? `Líneas: ${linesSummary}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
