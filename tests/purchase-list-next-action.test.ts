import { describe, expect, it } from "vitest";
import { derivePurchaseListNextAction } from "@/lib/purchases/list-next-action";

describe("derivePurchaseListNextAction", () => {
  it("marca listo para recibir cuando la OC está pagada", () => {
    const next = derivePurchaseListNextAction({
      status: "FACTURA_ACEPTADA",
      orderStatuses: ["PAGADA"],
    });
    expect(next.key).toBe("recibir");
    expect(next.label).toMatch(/recibir/i);
  });

  it("prioriza recepción parcial", () => {
    const next = derivePurchaseListNextAction({
      status: "FACTURA_ACEPTADA",
      orderStatuses: ["PAGADA", "RECIBIDA_PARCIAL"],
    });
    expect(next.key).toBe("recibir");
    expect(next.label).toMatch(/parcial/i);
  });

  it("muestra factura por pagar", () => {
    const next = derivePurchaseListNextAction({
      status: "FACTURA_ACEPTADA",
      orderStatuses: ["FACTURADA"],
    });
    expect(next.key).toBe("facturar_pagar");
    expect(next.label).toMatch(/pagar/i);
  });
});
