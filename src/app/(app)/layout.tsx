import { AppShell } from "@/components/layout/app-shell";
import { getOrgContext } from "@/lib/org-context";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getOrgContext();

  return (
    <AppShell userEmail={ctx?.email ?? null} role={ctx?.role ?? null}>
      {children}
    </AppShell>
  );
}
