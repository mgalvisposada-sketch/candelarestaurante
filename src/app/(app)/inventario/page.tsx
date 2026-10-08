import { getOrgContext } from "@/lib/org-context";
import { ctxCanAccess, requireModuleAccess } from "@/lib/permissions";
import { redirect } from "next/navigation";

export default async function InventarioIndexPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requireModuleAccess(ctx, "inventario");

  if (ctxCanAccess(ctx, "inventario.maestro")) {
    redirect("/inventario/maestro");
  }
  if (ctxCanAccess(ctx, "inventario.fisico")) {
    redirect("/inventario/fisico");
  }
  redirect("/inicio");
}
