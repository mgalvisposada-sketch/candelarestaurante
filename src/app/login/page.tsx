import { Suspense } from "react";
import LoginPage from "./page-client";

export default function LoginRoute() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-sm text-[var(--muted)]">Cargando…</div>
      }
    >
      <LoginPage />
    </Suspense>
  );
}
