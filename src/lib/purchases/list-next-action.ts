import { purchaseRequestStatusLabel } from "@/lib/purchases/status-labels";

export type PurchaseListTone = "ok" | "warn" | "danger";

export type PurchaseListNextAction = {
  label: string;
  tone: PurchaseListTone;
  /** Clave estable para KPIs / filtros. */
  key:
    | "autorizar"
    | "pedir"
    | "facturar_pagar"
    | "recibir"
    | "parcial"
    | "listo"
    | "otro";
};

/**
 * Qué debe hacer el usuario ahora, mirando el status de cabecera y las OCs.
 * Prioriza la acción operativa (recibir / pagar) sobre el status genérico.
 */
export function derivePurchaseListNextAction(args: {
  status: string;
  orderStatuses: string[];
}): PurchaseListNextAction {
  const status = args.status;
  const orders = args.orderStatuses.filter((s) => s && s !== "ANULADA");

  if (status === "ENVIADA") {
    return { key: "autorizar", label: "Por autorizar", tone: "warn" };
  }
  if (status === "RECHAZADA" || status === "ANULADA") {
    return {
      key: "otro",
      label: purchaseRequestStatusLabel(status),
      tone: "danger",
    };
  }
  if (status === "BORRADOR") {
    return { key: "otro", label: "Borrador", tone: "warn" };
  }

  const has = (...wanted: string[]) => orders.some((s) => wanted.includes(s));
  const everyOpen = (...wanted: string[]) =>
    orders.length > 0 && orders.every((s) => wanted.includes(s));

  // Prepago pagado o recepción a medias → el local debe recibir.
  if (has("PAGADA", "RECIBIDA_PARCIAL")) {
    return {
      key: "recibir",
      label: has("RECIBIDA_PARCIAL")
        ? "Recepción parcial — por recibir"
        : "Listo para recibir",
      tone: "warn",
    };
  }

  // Factura cargada, falta pagar.
  if (has("FACTURADA")) {
    return {
      key: "facturar_pagar",
      label: "Factura por pagar",
      tone: "warn",
    };
  }

  // Crédito / tránsito: ya pedida, esperando mercancia o facturando.
  if (has("PEDIDA")) {
    return {
      key: "parcial",
      label: "En curso — por recibir / facturar",
      tone: "ok",
    };
  }

  if (everyOpen("CERRADA") || everyOpen("CERRADA", "RECIBIDA")) {
    return { key: "listo", label: "Cerrada", tone: "ok" };
  }

  if (everyOpen("RECIBIDA") || status === "RECIBIDA") {
    return {
      key: "facturar_pagar",
      label: "Recibida — por facturar",
      tone: "warn",
    };
  }

  if (
    status === "APROBADA" ||
    everyOpen("POR_PEDIR") ||
    orders.length === 0
  ) {
    return {
      key: "pedir",
      label: "Autorizada — por pedir / facturar",
      tone: "ok",
    };
  }

  if (status === "FACTURA_ACEPTADA") {
    return {
      key: "facturar_pagar",
      label: "Factura / pago en curso",
      tone: "ok",
    };
  }

  return {
    key: "otro",
    label: purchaseRequestStatusLabel(status),
    tone: "ok",
  };
}
