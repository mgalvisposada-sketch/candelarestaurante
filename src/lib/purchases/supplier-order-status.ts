import { roundPurchaseQty } from "@/lib/purchases/qty";
import { isPrepagoTerms } from "@/lib/purchases/payment-terms";

/** Estado operativo de una OC por proveedor. */
export type PurchaseSupplierOrderStatus =
  | "POR_PEDIR"
  | "PEDIDA"
  | "FACTURADA"
  | "PAGADA"
  | "RECIBIDA_PARCIAL"
  | "RECIBIDA"
  | "CERRADA"
  | "ANULADA";

export const PURCHASE_SUPPLIER_ORDER_STATUS_LABELS: Record<
  PurchaseSupplierOrderStatus,
  string
> = {
  POR_PEDIR: "Por pedir",
  PEDIDA: "Pedida",
  FACTURADA: "Facturada — por pagar",
  PAGADA: "Pagada — por recibir",
  RECIBIDA_PARCIAL: "Recepción parcial",
  RECIBIDA: "Recibida",
  CERRADA: "Cerrada",
  ANULADA: "Anulada",
};

export function purchaseSupplierOrderStatusLabel(status: string): string {
  return (
    PURCHASE_SUPPLIER_ORDER_STATUS_LABELS[
      status as PurchaseSupplierOrderStatus
    ] ?? status
  );
}

export type SupplierOrderItemSnapshot = {
  status: string;
  quantity_requested: number | string;
  quantity_approved: number | string | null;
  quantity_received: number | string;
  quantity_invoiced?: number | string | null;
  invoice_payment_request_id: string | null;
};

function receiveTargetQty(item: SupplierOrderItemSnapshot): number {
  const invoiced = roundPurchaseQty(Number(item.quantity_invoiced || 0));
  if (item.invoice_payment_request_id && invoiced > 0) return invoiced;
  return roundPurchaseQty(
    Number(item.quantity_approved ?? item.quantity_requested),
  );
}

function isItemClosed(item: SupplierOrderItemSnapshot): boolean {
  if (item.status === "CANCELADO" || item.status === "RECIBIDO") return true;
  const target = receiveTargetQty(item);
  const received = roundPurchaseQty(Number(item.quantity_received || 0));
  return target > 0 && received >= target;
}

function isBillableItem(item: SupplierOrderItemSnapshot): boolean {
  if (item.status === "CANCELADO" && Number(item.quantity_received || 0) <= 0) {
    return false;
  }
  return (
    roundPurchaseQty(Number(item.quantity_approved ?? item.quantity_requested)) >
    0
  );
}

/**
 * Deriva el estado de una OC a partir de sus ítems y el estado de pagos.
 */
export function deriveSupplierOrderStatus(args: {
  items: SupplierOrderItemSnapshot[];
  paymentStatusById: Map<string, string> | Record<string, string>;
  /** Si ya se marcó pedida (ordered_at) aunque los ítems sigan APROBADO. */
  wasMarkedOrdered?: boolean;
}): PurchaseSupplierOrderStatus {
  const items = args.items;
  if (items.length === 0) return "POR_PEDIR";

  const payMap =
    args.paymentStatusById instanceof Map
      ? args.paymentStatusById
      : new Map(Object.entries(args.paymentStatusById));
  const payGet = (id: string) => payMap.get(id);

  const active = items.filter(isBillableItem);
  const pool = active.length > 0 ? active : items;

  const allClosed = pool.every(isItemClosed);
  const anyReceived = items.some(
    (i) => roundPurchaseQty(Number(i.quantity_received || 0)) > 0,
  );
  const invoiced = items.filter((i) => i.invoice_payment_request_id);
  const hasInvoice = invoiced.length > 0;
  const billableUninvoiced = pool.filter((i) => !i.invoice_payment_request_id);
  const allInvoiced = billableUninvoiced.length === 0 && hasInvoice;
  const allPaid =
    hasInvoice &&
    invoiced.every((i) => {
      const st = i.invoice_payment_request_id
        ? payGet(i.invoice_payment_request_id)
        : null;
      return st === "PAGADA";
    });

  const wasOrdered =
    Boolean(args.wasMarkedOrdered) ||
    items.some(
      (i) =>
        ["PEDIDO", "RECIBIDO_PARCIAL", "RECIBIDO"].includes(i.status) ||
        Number(i.quantity_received || 0) > 0 ||
        Boolean(i.invoice_payment_request_id),
    );

  if (allClosed && allInvoiced && allPaid) return "CERRADA";
  if (allClosed && allInvoiced) return "RECIBIDA";
  if (allClosed) return "RECIBIDA";
  if (anyReceived && !allClosed) return "RECIBIDA_PARCIAL";
  if (hasInvoice && allPaid) return "PAGADA";
  if (hasInvoice) return "FACTURADA";
  if (wasOrdered) return "PEDIDA";
  return "POR_PEDIR";
}

/** Agrega estados de OCs al status de cabecera de la solicitud (compat). */
export function aggregatePurchaseRequestStatus(args: {
  currentStatus: string;
  orderStatuses: string[];
}): string {
  const current = args.currentStatus;
  if (["BORRADOR", "ENVIADA", "RECHAZADA", "ANULADA"].includes(current)) {
    return current;
  }

  const statuses = args.orderStatuses.filter((s) => s !== "ANULADA");
  if (statuses.length === 0) {
    return current === "APROBADA" ? "APROBADA" : current;
  }

  const every = (...wanted: string[]) =>
    statuses.every((s) => wanted.includes(s));
  const some = (...wanted: string[]) =>
    statuses.some((s) => wanted.includes(s));

  if (every("CERRADA")) return "FACTURA_ACEPTADA";
  if (every("CERRADA", "RECIBIDA") && some("RECIBIDA")) return "RECIBIDA";
  if (some("RECIBIDA_PARCIAL")) return "RECIBIDA_PARCIAL";
  if (some("PAGADA", "FACTURADA") && some("RECIBIDA", "RECIBIDA_PARCIAL")) {
    return "RECIBIDA_PARCIAL";
  }
  if (some("PAGADA", "FACTURADA")) return "FACTURA_ACEPTADA";
  if (some("RECIBIDA")) return "RECIBIDA";
  if (some("PEDIDA", "RECIBIDA_PARCIAL", "RECIBIDA", "FACTURADA", "PAGADA", "CERRADA")) {
    return "PEDIDA";
  }
  if (every("POR_PEDIR")) return "APROBADA";
  return current;
}

export function supplierOrderAllowsMarkOrdered(status: string): boolean {
  return status === "POR_PEDIR";
}

/** Prepago puede facturar desde POR_PEDIR; crédito desde PEDIDA+. */
export function supplierOrderAllowsInvoice(args: {
  status: string;
  terms: string | null | undefined;
}): boolean {
  const prepago = isPrepagoTerms(args.terms);
  if (["ANULADA", "CERRADA"].includes(args.status)) return false;
  if (prepago) {
    return ["POR_PEDIR", "PEDIDA", "FACTURADA", "PAGADA", "RECIBIDA_PARCIAL", "RECIBIDA"].includes(
      args.status,
    );
  }
  return ["PEDIDA", "RECIBIDA_PARCIAL", "RECIBIDA", "FACTURADA", "PAGADA"].includes(
    args.status,
  );
}

/** Crédito: tras pedir. Prepago: tras pagar (PAGADA+) o recepción ya iniciada. */
export function supplierOrderAllowsReceive(args: {
  status: string;
  terms: string | null | undefined;
  allInvoicesPaid: boolean;
}): boolean {
  if (["ANULADA", "CERRADA", "POR_PEDIR"].includes(args.status)) return false;
  if (isPrepagoTerms(args.terms)) {
    return (
      args.allInvoicesPaid &&
      ["PAGADA", "FACTURADA", "RECIBIDA_PARCIAL", "RECIBIDA"].includes(args.status)
    );
  }
  return ["PEDIDA", "RECIBIDA_PARCIAL", "RECIBIDA", "FACTURADA", "PAGADA"].includes(
    args.status,
  );
}
