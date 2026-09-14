import { AppHeader } from "@/components/layout/app-header";
import { EmptyState, PageIntro } from "@/components/ui/primitives";

export default function CapitalPage() {
  return (
    <>
      <AppHeader
        title="Capital"
        subtitle="Uso de recursos prestados y solicitudes"
      />
      <main className="p-8">
        <PageIntro
          title="¿Qué pasó con el dinero?"
          description="Por cada desembolso se definen bolsas (CxP, nómina, impuestos, capital de trabajo, tecnología, etc.) con aprobado, comprometido, pagado y disponible."
        />
        <EmptyState
          title="Sin asignaciones de capital"
          description="Las solicitudes de recursos (workflow completo) se habilitan en MVP 2; en MVP 1 se cubre el uso mínimo por desembolso."
        />
      </main>
    </>
  );
}
