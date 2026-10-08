import { getOrgContext } from "@/lib/org-context";
import { ctxCanAccess, requireModuleAccess } from "@/lib/permissions";
import { redirect } from "next/navigation";

export default async function ComprasIndexPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  requireModuleAccess(ctx, "compras");

  if (ctxCanAccess(ctx, "compras.solicitudes")) {
    redirect("/compras/solicitudes");
  }
  if (ctxCanAccess(ctx, "compras.sugeridos")) {
    redirect("/compras/sugeridos");
  }
  if (ctxCanAccess(ctx, "compras.proveedores")) {
    redirect("/compras/proveedores");
  }
  redirect("/inicio");
}
