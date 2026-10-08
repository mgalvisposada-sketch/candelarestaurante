import { redirect } from "next/navigation";

/** Ruta legacy → módulo Inventario. */
export default function LegacyComprasInventarioRedirect() {
  redirect("/inventario/maestro");
}
