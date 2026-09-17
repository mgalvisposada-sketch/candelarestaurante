"use server";

import {
  createTaxObligationAction as createTaxObligation,
  softDeleteTaxAction as softDeleteTax,
  updateTaxStatusAction as updateTaxStatus,
} from "../contratos/actions";

export async function createTaxObligationAction(formData: FormData) {
  return createTaxObligation(formData);
}

export async function updateTaxStatusAction(
  id: string,
  status:
    | "PENDIENTE"
    | "PRESENTADA"
    | "PAGADA"
    | "VENCIDA"
    | "EN_ACUERDO"
    | "NO_APLICA",
) {
  return updateTaxStatus(id, status);
}

export async function softDeleteTaxAction(id: string) {
  return softDeleteTax(id);
}
