import { redirect } from "next/navigation";

/** Ruta legacy → módulo Inventario. */
export default async function LegacyComprasInventarioFisicoDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/inventario/fisico/${id}`);
}
