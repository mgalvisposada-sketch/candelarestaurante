"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme/theme-provider";
import { cn } from "@/lib/utils";

export function ThemeToggle({
  className,
  variant = "sidebar",
}: {
  className?: string;
  variant?: "sidebar" | "header";
}) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
      title={isDark ? "Tema claro" : "Tema oscuro"}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg text-sm transition",
        variant === "sidebar" &&
          "w-full border border-[var(--sidebar-border)] bg-[var(--sidebar-chip)] px-3 py-2 text-[var(--sidebar-text)] hover:bg-[var(--sidebar-hover)]",
        variant === "header" &&
          "size-10 justify-center border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--surface-muted)]",
        className,
      )}
    >
      {isDark ? (
        <Sun className="size-4 shrink-0 text-[var(--gold)]" aria-hidden />
      ) : (
        <Moon className="size-4 shrink-0 text-[var(--muted)]" aria-hidden />
      )}
      {variant === "sidebar" ? (
        <span className="min-w-0 flex-1 text-left">
          {isDark ? "Tema claro" : "Tema oscuro"}
        </span>
      ) : null}
    </button>
  );
}
