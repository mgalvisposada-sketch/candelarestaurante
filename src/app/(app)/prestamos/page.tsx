import { AppHeader } from "@/components/layout/app-header";
import { EmptyState, PageIntro } from "@/components/ui/primitives";

export default function PrestamosPage() {
  return (
    <>
      <AppHeader
        title="Préstamos"
        subtitle="Financiación de socios — distinta de aportes de capital"
      />
      <main className="p-8">
        <PageIntro
          title="Préstamos de socios"
          description="Diferencie CAPITAL, PRÉSTAMO, ANTICIPO y OTRO. Cada préstamo muestra capital inicial, desembolsado, pagado, interés y saldo. Los históricos no se alteran."
        />
        <EmptyState
          title="Sin préstamos"
          description="Registre contratos, desembolsos y cronogramas. El uso del dinero se asigna en Capital / funding_allocations."
        />
      </main>
    </>
  );
}
