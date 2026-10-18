"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, Maximize2, Minus, X } from "lucide-react";
import { AgentChatPanel } from "@/components/asistente/agent-chat-panel";
import { canAccessModuleHref } from "@/lib/permissions-catalog";
import { isSuperAdmin, type AppRole } from "@/types/domain";
import { cn } from "@/lib/utils";

const OPEN_KEY = "candela.asistente.widgetOpen.v1";

export function AsistenteWidget({
  orgLabel,
  userRole,
  role,
  permissions,
}: {
  orgLabel: string;
  userRole: string;
  role: AppRole | null;
  permissions: string[];
}) {
  const pathname = usePathname();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  const allowed = canAccessModuleHref(permissions, "/asistente", {
    isSuperAdmin: isSuperAdmin(role),
  });

  useEffect(() => {
    setMounted(true);
    try {
      if (sessionStorage.getItem(OPEN_KEY) === "1") setOpen(true);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    try {
      sessionStorage.setItem(OPEN_KEY, open ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [open, mounted]);

  // En la página dedicada no duplicar el widget
  if (!allowed || pathname === "/asistente" || pathname?.startsWith("/asistente/")) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-end p-3 sm:p-4 print:hidden">
      <div className="pointer-events-auto flex flex-col items-end gap-3">
        {open ? (
          <section
            role="dialog"
            aria-labelledby={titleId}
            aria-modal="false"
            className={cn(
              "asistente-widget-panel flex w-[min(100vw-1.5rem,420px)] flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-[0_18px_50px_rgba(28,25,23,0.22)]",
              "h-[min(78dvh,640px)]",
            )}
          >
            <header className="relative shrink-0 border-b border-[var(--line)] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--accent)_92%,#1c1917),color-mix(in_srgb,var(--accent)_70%,#7f1d1d))] px-3 py-3 text-white">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/30"
              />
              <div className="flex items-start gap-2.5">
                <div className="mt-0.5 flex size-9 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
                  <Bot className="size-4" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <h2
                    id={titleId}
                    className="font-display text-[15px] font-bold tracking-tight"
                  >
                    Asistente Candela
                  </h2>
                  <p className="mt-0.5 text-[11px] leading-snug text-white/80">
                    Pregunta o pide tareas · aclara si falta info
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Link
                    href="/asistente"
                    className="inline-flex size-8 items-center justify-center rounded-lg text-white/85 transition hover:bg-white/12 hover:text-white"
                    title="Abrir pantalla completa"
                    aria-label="Abrir pantalla completa"
                  >
                    <Maximize2 className="size-3.5" aria-hidden />
                  </Link>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="inline-flex size-8 items-center justify-center rounded-lg text-white/85 transition hover:bg-white/12 hover:text-white"
                    title="Minimizar"
                    aria-label="Minimizar asistente"
                  >
                    <Minus className="size-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="inline-flex size-8 items-center justify-center rounded-lg text-white/85 transition hover:bg-white/12 hover:text-white"
                    title="Cerrar"
                    aria-label="Cerrar asistente"
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                </div>
              </div>
            </header>

            <AgentChatPanel
              orgLabel={orgLabel}
              userRole={userRole}
              variant="widget"
            />
          </section>
        ) : null}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={cn(
            "group relative inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-[var(--on-solid)] shadow-[0_10px_28px_rgba(212,25,18,0.35)] transition",
            "hover:bg-[var(--accent-hover)] hover:shadow-[0_12px_32px_rgba(212,25,18,0.42)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]",
            open && "pr-3.5",
          )}
        >
          <span
            aria-hidden
            className="absolute -inset-1 rounded-full bg-[var(--accent)]/25 opacity-0 blur-md transition group-hover:opacity-100"
          />
          <Bot className="relative size-5" aria-hidden />
          <span className="relative hidden sm:inline">
            {open ? "Ocultar" : "Asistente"}
          </span>
          {!open ? (
            <span
              aria-hidden
              className="relative size-2 rounded-full bg-[var(--gold)] shadow-[0_0_0_3px_rgba(201,160,0,0.25)]"
            />
          ) : null}
        </button>
      </div>
    </div>
  );
}
