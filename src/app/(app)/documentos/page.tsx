import { AppHeader } from "@/components/layout/app-header";
import { EmptyState, PageIntro } from "@/components/ui/primitives";

export default function DocumentosPage() {
  return (
    <>
      <AppHeader
        title="Documentos"
        subtitle="Document Center — Storage privado con URLs firmadas"
      />
      <main className="p-8">
        <PageIntro
          title="Evidencia centralizada"
          description="Cada documento se asocia a empresa, socio, proveedor, CxP, préstamo, empalme u otra entidad. No hay buckets públicos para información sensible."
        />
        <EmptyState
          title="Sin documentos"
          description="Al conectar Supabase Storage (bucket documents) podrá cargar PDF e imágenes con metadata y trazabilidad."
        />
      </main>
    </>
  );
}
