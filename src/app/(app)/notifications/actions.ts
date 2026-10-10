"use server";

import { getOrgContext } from "@/lib/org-context";
import {
  fetchPendingActions,
  type PendingActionsResult,
} from "@/lib/pending-actions";

export async function getPendingActionsAction(): Promise<PendingActionsResult> {
  const ctx = await getOrgContext();
  if (!ctx?.organization) {
    return {
      items: [],
      counts: { total: 0, compras: 0, personal: 0, pagos: 0 },
    };
  }
  return fetchPendingActions(ctx);
}
