import { z } from "zod";

export const documentMetaSchema = z.object({
  name: z.string().min(1, "Nombre obligatorio"),
  document_type: z.string().optional().nullable(),
  entity_type: z.enum([
    "organization",
    "shareholder",
    "supplier",
    "accounts_payable",
    "accounts_payable_document",
    "loan",
    "employee",
    "contract",
    "tax_obligation",
    "bank_account",
    "asset",
    "handover",
    "other",
  ]),
  entity_id: z.string().uuid().optional().nullable().or(z.literal("")),
});
