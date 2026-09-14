import { AppHeader } from "@/components/layout/app-header";
import { EmptyState, PageIntro } from "@/components/ui/primitives";

export default function SociosPage() {
  return (
    <>
      <AppHeader
        title="Socios"
        subtitle="Composición accionaria y cuentas socio ↔ sociedad"
      />
      <main className="p-8">
        <PageIntro
          title="Gobierno de socios"
          description="La participación accionaria se gestiona aparte de los préstamos. Si el total no suma 100% se advierte, pero no se bloquea el empalme."
        />
        <EmptyState
          title="Sin socios registrados"
          description="Registre cada socio con identificación, porcentaje, capital registrado y estado. Las cuentas acreedor/deudor viven en entidades separadas."
        />
      </main>
    </>
  );
}
