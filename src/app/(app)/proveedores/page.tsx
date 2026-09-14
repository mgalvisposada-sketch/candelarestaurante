import { AppHeader } from "@/components/layout/app-header";
import { EmptyState, PageIntro, StatCard } from "@/components/ui/primitives";
import { formatCOP } from "@/lib/money";

export default function ProveedoresPage() {
  return (
    <>
      <AppHeader
        title="Proveedores & CxP"
        subtitle="Deudas administrativas soportadas por documentos"
      />
      <main className="space-y-6 p-8">
        <PageIntro
          title="Cuentas por pagar"
          description="Cada deuda se descompone en facturas o cuentas de cobro. El saldo del proveedor se calcula automáticamente. Prioridades: crítica, alta, normal, negociable, por validar."
        />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Total CxP" value={formatCOP(0)} />
          <StatCard label="Confirmada" value={formatCOP(0)} />
          <StatCard label="Declarada" value={formatCOP(0)} />
          <StatCard label="Pendiente soporte" value={formatCOP(0)} />
          <StatCard label="Crítica" value={formatCOP(0)} />
        </div>
        <EmptyState
          title="Sin proveedores ni documentos CxP"
          description="Cree el maestro de proveedores y cargue facturas con vencimiento, prioridad y evidencia para el aging 0-30 / 31-60 / 61-90 / +90."
        />
      </main>
    </>
  );
}
