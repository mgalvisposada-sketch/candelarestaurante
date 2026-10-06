"use client";

import { usePathname } from "next/navigation";
import { AppSidebar } from "@/components/layout/app-sidebar";
import type { AppRole } from "@/types/domain";

export function AppShell({
  children,
  userEmail,
  role,
  permissions,
}: {
  children: React.ReactNode;
  userEmail?: string | null;
  role?: AppRole | null;
  permissions?: string[];
}) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-screen">
      <div className="print:hidden">
        <AppSidebar
          pathname={pathname}
          userEmail={userEmail}
          role={role}
          permissions={permissions}
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
