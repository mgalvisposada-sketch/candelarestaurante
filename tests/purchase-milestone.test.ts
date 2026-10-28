import { describe, expect, it } from "vitest";
import {
  deriveSupplierOrderStatus,
  purchaseMilestoneFor,
  supplierOrderCanBeRemoved,
} from "@/lib/purchases/supplier-order-status";

describe("purchaseMilestoneFor", () => {
  it("deja por pedir aunque el prepago ya se pueda facturar", () => {
    expect(
      purchaseMilestoneFor({
        status: "POR_PEDIR",
        prepago: true,
        isSettled: false,
        awaitingPay: false,
        hasUninvoiced: true,
        hasOpenItems: true,
      }),
    ).toBe("pedir");
  });

  it("manda a facturar el prepago pedido y sin factura", () => {
    expect(
      purchaseMilestoneFor({
        status: "PEDIDA",
        prepago: true,
        isSettled: false,
        awaitingPay: false,
        hasUninvoiced: true,
        hasOpenItems: true,
      }),
    ).toBe("facturar");
  });

  it("manda a pagar cuando la factura prepago sigue en cola", () => {
    expect(
      purchaseMilestoneFor({
        status: "FACTURADA",
        prepago: true,
        isSettled: false,
        awaitingPay: true,
        hasUninvoiced: false,
        hasOpenItems: true,
      }),
    ).toBe("pagar");
  });

  it("manda a recibir la orden prepago ya pagada", () => {
    expect(
      purchaseMilestoneFor({
        status: "PAGADA",
        prepago: true,
        isSettled: false,
        awaitingPay: false,
        hasUninvoiced: false,
        hasOpenItems: true,
      }),
    ).toBe("recibir");
  });

  it("recibe primero el crédito pedido", () => {
    expect(
      purchaseMilestoneFor({
        status: "PEDIDA",
        prepago: false,
        isSettled: false,
        awaitingPay: false,
        hasUninvoiced: false,
        hasOpenItems: true,
      }),
    ).toBe("recibir");
  });

  it("factura el crédito cuando ya no queda nada por recibir", () => {
    expect(
      purchaseMilestoneFor({
        status: "RECIBIDA",
        prepago: false,
        isSettled: false,
        awaitingPay: false,
        hasUninvoiced: true,
        hasOpenItems: false,
      }),
    ).toBe("facturar");
  });

  it("cierra la orden cerrada", () => {
    expect(
      purchaseMilestoneFor({
        status: "CERRADA",
        prepago: true,
        isSettled: true,
        awaitingPay: false,
        hasUninvoiced: false,
        hasOpenItems: false,
      }),
    ).toBe("listas");
  });
});

describe("supplierOrderCanBeRemoved", () => {
  it("permite quitar por pedir y pedida sin factura ni recepción", () => {
    expect(
      supplierOrderCanBeRemoved({
        status: "POR_PEDIR",
        hasInvoice: false,
        hasReceived: false,
      }),
    ).toBe(true);
    expect(
      supplierOrderCanBeRemoved({
        status: "PEDIDA",
        hasInvoice: false,
        hasReceived: false,
      }),
    ).toBe(true);
  });

  it("no permite quitar si ya hay factura, recepción o un hito posterior", () => {
    expect(
      supplierOrderCanBeRemoved({
        status: "PEDIDA",
        hasInvoice: true,
        hasReceived: false,
      }),
    ).toBe(false);
    expect(
      supplierOrderCanBeRemoved({
        status: "PEDIDA",
        hasInvoice: false,
        hasReceived: true,
      }),
    ).toBe(false);
    expect(
      supplierOrderCanBeRemoved({
        status: "PAGADA",
        hasInvoice: false,
        hasReceived: false,
      }),
    ).toBe(false);
  });
});

describe("deriveSupplierOrderStatus al quitar una línea no facturada", () => {
  const line = (
    status: string,
    qty = 2500,
  ) => ({
    status,
    quantity_requested: qty,
    quantity_approved: qty,
    quantity_received: 0,
    quantity_invoiced: 0,
    invoice_payment_request_id: null,
  });

  it("anula la orden si todas las líneas se quitaron sin recepción ni factura", () => {
    expect(
      deriveSupplierOrderStatus({
        items: [line("CANCELADO")],
        paymentStatusById: new Map(),
        wasMarkedOrdered: true,
      }),
    ).toBe("ANULADA");
  });

  it("deja pedida la orden si solo se quitó una línea y quedan otras por facturar", () => {
    expect(
      deriveSupplierOrderStatus({
        items: [line("CANCELADO", 2500), line("APROBADO", 10)],
        paymentStatusById: new Map(),
        wasMarkedOrdered: true,
      }),
    ).toBe("PEDIDA");
  });
});
