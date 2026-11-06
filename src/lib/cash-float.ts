import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const OPERATING_CASH_NOTES =
  "Caja operativa del local: efectivo de apertura, ventas en efectivo inyectadas al cierre, gastos y traspasos. Una sola caja (sin flotante separado).";

function looksLikeLegacyFloatName(name: string | null | undefined) {
  const n = (name ?? "").toLowerCase();
  return n.includes("flotante") || n.includes("base /") || n === "base";
}

/**
 * Garantiza una sola caja operativa por organización.
 * Reusa la cuenta marcada `is_cash_float` (legado de Base/flotante) o la
 * primera CAJA de ventas; ya no crea un par caja+flotante.
 */
export async function ensureOperatingCashAccount(
  supabase: Supabase,
  orgId: string,
  userId: string,
): Promise<string> {
  const { data: flagged } = await supabase
    .from("bank_accounts")
    .select("id, bank_name, is_active")
    .eq("organization_id", orgId)
    .eq("is_cash_float", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (flagged?.id) {
    const patch: Record<string, unknown> = {
      updated_by: userId,
      fund_purpose: "VENTAS",
      account_kind: "CAJA",
      notes: OPERATING_CASH_NOTES,
    };
    if (!flagged.is_active) patch.is_active = true;
    if (looksLikeLegacyFloatName(flagged.bank_name)) {
      patch.bank_name = "Caja";
    }
    await supabase
      .from("bank_accounts")
      .update(patch)
      .eq("id", flagged.id)
      .eq("organization_id", orgId);

    await deactivateSiblingCashAccounts(supabase, orgId, userId, flagged.id);
    return flagged.id;
  }

  const { data: salesCajas } = await supabase
    .from("bank_accounts")
    .select("id, bank_name, is_active, fund_purpose")
    .eq("organization_id", orgId)
    .eq("account_kind", "CAJA")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  const caja =
    (salesCajas ?? []).find(
      (a) => a.is_active && (a.fund_purpose ?? "VENTAS") === "VENTAS",
    ) ??
    (salesCajas ?? []).find((a) => (a.fund_purpose ?? "VENTAS") === "VENTAS") ??
    (salesCajas ?? [])[0] ??
    null;

  if (caja?.id) {
    await supabase
      .from("bank_accounts")
      .update({
        is_cash_float: true,
        is_active: true,
        fund_purpose: "VENTAS",
        account_kind: "CAJA",
        bank_name: looksLikeLegacyFloatName(caja.bank_name)
          ? "Caja"
          : caja.bank_name || "Caja",
        notes: OPERATING_CASH_NOTES,
        updated_by: userId,
      })
      .eq("id", caja.id)
      .eq("organization_id", orgId);

    await deactivateSiblingCashAccounts(supabase, orgId, userId, caja.id);
    return caja.id;
  }

  const { data, error } = await supabase
    .from("bank_accounts")
    .insert({
      organization_id: orgId,
      bank_name: "Caja",
      account_kind: "CAJA",
      fund_purpose: "VENTAS",
      is_cash_float: true,
      is_active: true,
      notes: OPERATING_CASH_NOTES,
      created_by: userId,
      updated_by: userId,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

/** @deprecated Usar ensureOperatingCashAccount — misma semántica unificada. */
export const ensureCashFloatAccount = ensureOperatingCashAccount;

/** Otras CAJA de ventas dejan de competir: quedan inactivas (historial intacto). */
async function deactivateSiblingCashAccounts(
  supabase: Supabase,
  orgId: string,
  userId: string,
  keepId: string,
) {
  const { data: siblings } = await supabase
    .from("bank_accounts")
    .select("id, bank_name, fund_purpose, is_cash_float")
    .eq("organization_id", orgId)
    .eq("account_kind", "CAJA")
    .eq("is_active", true)
    .is("deleted_at", null)
    .neq("id", keepId);

  const toDeactivate = (siblings ?? []).filter(
    (s) =>
      !s.is_cash_float && (s.fund_purpose ?? "VENTAS") !== "EMPRESA",
  );
  if (toDeactivate.length === 0) return;

  for (const sibling of toDeactivate) {
    await supabase
      .from("bank_accounts")
      .update({
        is_active: false,
        notes: `Unificada en una sola caja operativa. Antes: ${sibling.bank_name}.`,
        updated_by: userId,
      })
      .eq("id", sibling.id)
      .eq("organization_id", orgId);
  }
}
