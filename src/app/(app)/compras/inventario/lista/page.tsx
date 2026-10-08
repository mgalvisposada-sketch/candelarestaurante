import { redirect } from "next/navigation";

/** Ruta legacy → módulo Inventario. */
export default function LegacyComprasInventarioListaRedirect() {
  redirect("/inventario/lista");
}
