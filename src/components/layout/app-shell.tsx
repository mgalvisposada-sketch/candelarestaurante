"use client";

import { usePathname } from "next/navigation";
import { AppSidebar } from "@/components/layout/app-sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-screen">
      <AppSidebar pathname={pathname} />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
