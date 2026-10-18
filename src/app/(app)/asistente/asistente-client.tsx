"use client";

import { Bot } from "lucide-react";
import { AgentChatPanel } from "@/components/asistente/agent-chat-panel";
import { Card } from "@/components/ui/primitives";

export function AsistenteClient({
  orgLabel,
  userRole,
}: {
  orgLabel: string;
  userRole: string;
}) {
  return (
    <div className="flex min-h-[calc(100dvh-8rem)] flex-col gap-4 px-4 pb-6 sm:px-6 md:px-8">
      <Card className="relative flex min-h-[calc(100dvh-10rem)] flex-1 flex-col overflow-hidden !p-0">
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 z-10 h-0.5 bg-[linear-gradient(90deg,var(--accent),var(--gold))]"
        />
        <div className="flex items-center gap-3 border-b border-[var(--line)] px-5 py-4">
          <div className="flex size-10 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
            <Bot className="size-5" aria-hidden />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight">
              Asistente Candela
            </h1>
            <p className="text-sm text-[var(--muted)]">
              Pantalla completa · también disponible como widget en cualquier módulo
            </p>
          </div>
        </div>
        <AgentChatPanel
          orgLabel={orgLabel}
          userRole={userRole}
          variant="page"
          className="min-h-0 flex-1"
        />
      </Card>
    </div>
  );
}
