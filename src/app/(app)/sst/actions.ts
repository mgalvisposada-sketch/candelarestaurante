"use server";

import { upsertSstRecordAction as upsertSstRecord } from "../contratos/actions";

export async function upsertSstRecordAction(formData: FormData) {
  return upsertSstRecord(formData);
}
