import { redirect } from "next/navigation";
import { AsistenteClient } from "@/app/(app)/asistente/asistente-client";
import { AppHeader } from "@/components/layout/app-header";
import { getOrgContext } from "@/lib/org-context";
import { requireModuleAccess } from "@/lib/permissions";
import { ROLE_LABELS } from "@/types/domain";

export default async function AsistentePage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requireModuleAccess(ctx, "asistente");

  const orgLabel =
    ctx.organization?.trade_name ||
    ctx.organization?.legal_name ||
    "tu organización";
  const userRole = ctx.role
    ? ROLE_LABELS[ctx.role]
    : "Sin rol";

  return (
    <>
      <AppHeader
        title="Asistente"
        subtitle="Agente con conocimiento de Candela y acceso a tus datos"
      />
      <AsistenteClient orgLabel={orgLabel} userRole={userRole} />
    </>
  );
}
