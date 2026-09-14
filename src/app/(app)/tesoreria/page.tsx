import { AppHeader } from "@/components/layout/app-header";
import { EmptyState, PageIntro } from "@/components/ui/primitives";

export default function TesoreriaPage() {
  return (
    <>
      <AppHeader
        title="Tesorería"
        subtitle="Bancos, caja, pasarelas y saldos iniciales"
      />
      <main className="p-8">
        <PageIntro
          title="Cuentas y saldos a la fecha de corte"
          description="Registre cuentas con número enmascarado y el opening_balance con evidencia. Los movimientos y conciliación CSV/XLSX se profundizan en MVP 2."
        />
        <EmptyState
          title="Sin cuentas registradas"
          description="Agregue bancos, caja u otros saldos para construir la liquidez inicial del empalme."
        />
      </main>
    </>
  );
}
