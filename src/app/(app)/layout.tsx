import { AppShell } from "@/components/layout/app-shell";
import { getOrgContext } from "@/lib/org-context";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getOrgContext();

  const orgLabel =
    ctx?.organization?.trade_name ||
    ctx?.organization?.legal_name ||
    null;

  return (
    <AppShell
      userEmail={ctx?.email ?? null}
      role={ctx?.role ?? null}
      permissions={ctx?.permissions ?? []}
      orgLabel={orgLabel}
    >
      {children}
    </AppShell>
  );
}
