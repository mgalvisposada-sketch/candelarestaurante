import { getOrgContext } from "@/lib/org-context";
import { ctxCanAccess, requireModuleAccess } from "@/lib/permissions";
import { isSuperAdmin } from "@/types/domain";
import { redirect } from "next/navigation";

/** Entrada del módulo: CxP es primario; el maestro queda en /proveedores/maestro. */
export default async function ProveedoresIndexPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requireModuleAccess(ctx, "proveedores");

  if (ctxCanAccess(ctx, "proveedores.cxp") || isSuperAdmin(ctx.role)) {
    redirect("/proveedores/cxp");
  }
  redirect("/proveedores/maestro");
}
