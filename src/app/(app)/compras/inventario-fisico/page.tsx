import { redirect } from "next/navigation";

/** Ruta legacy → módulo Inventario. */
export default function LegacyComprasInventarioFisicoRedirect() {
  redirect("/inventario/fisico");
}
