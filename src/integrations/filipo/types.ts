/**
 * Contratos READ ONLY para datos operacionales provenientes de FILIPO.
 * No implementar sync en MVP.
 */

export type FilipoMoney = string; // DECIMAL as string to avoid float drift

export interface FilipoDailySales {
  businessDate: string; // YYYY-MM-DD
  grossSales: FilipoMoney;
  netSales: FilipoMoney;
  orderCount: number;
  averageTicket: FilipoMoney;
  currency: "COP";
}

export interface FilipoChannelSales {
  businessDate: string;
  channel: string;
  netSales: FilipoMoney;
  orderCount: number;
  averageTicket: FilipoMoney;
}

export interface FilipoOperationalCostSnapshot {
  periodStart: string;
  periodEnd: string;
  foodCost: FilipoMoney;
  foodCostPct: FilipoMoney;
  beverageCost: FilipoMoney;
  beverageCostPct: FilipoMoney;
  operationalCost: FilipoMoney;
  wasteCost?: FilipoMoney;
  currency: "COP";
}

export interface FilipoOrdersAggregate {
  businessDate: string;
  ordersCompleted: number;
  ordersCancelled: number;
  deliveryOrders: number;
  dineInOrders: number;
}

/** Payload agregado que Candela podría importar (solo lectura). */
export interface FilipoReadOnlyBundle {
  source: "FILIPO";
  importedAt: string;
  dailySales: FilipoDailySales[];
  channelSales: FilipoChannelSales[];
  orders: FilipoOrdersAggregate[];
  costs: FilipoOperationalCostSnapshot[];
}
