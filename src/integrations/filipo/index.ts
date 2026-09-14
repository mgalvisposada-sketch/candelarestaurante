import type { FilipoReadOnlyBundle } from "./types";

/**
 * Cliente futuro de solo lectura.
 * Stub intencional: no hay implementación de red en MVP.
 */
export interface FilipoReadClient {
  getAggregates(params: {
    organizationId: string;
    from: string;
    to: string;
  }): Promise<FilipoReadOnlyBundle | null>;
}

export class FilipoReadClientStub implements FilipoReadClient {
  async getAggregates(): Promise<FilipoReadOnlyBundle | null> {
    return null;
  }
}

export const filipoClient: FilipoReadClient = new FilipoReadClientStub();
