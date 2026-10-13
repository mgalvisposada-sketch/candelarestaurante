import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Garantiza la cuenta Base/flotante de la organización. */
export async function ensureCashFloatAccount(
  supabase: Supabase,
  orgId: string,
  userId: string,
): Promise<string> {
  const { data: existing } = await supabase
    .from("bank_accounts")
    .select("id")
    .eq("organization_id", orgId)
    .eq("is_cash_float", true)
    .is("deleted_at", null)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data, error } = await supabase
    .from("bank_accounts")
    .insert({
      organization_id: orgId,
      bank_name: "Base / flotante",
      account_kind: "CAJA",
      fund_purpose: "VENTAS",
      is_cash_float: true,
      is_active: true,
      notes:
        "Flotante del local: cambio y gastos autorizados. Se recarga con traspasos hasta el target.",
      created_by: userId,
      updated_by: userId,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}
