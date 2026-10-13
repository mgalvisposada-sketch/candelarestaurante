import { cn } from "@/lib/utils";

export {
  WorkEmptyHint,
  WorkSection,
  WorkStack,
  type WorkSectionKind,
} from "@/components/ui/work-section";

export function Card({
  children,
  className,
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div
      id={id}
      className={cn(
        "rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="relative overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-0.5 bg-[linear-gradient(90deg,var(--accent),var(--gold))]"
      />
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-3 font-display text-3xl font-bold tracking-tight">
        {value}
      </p>
      {hint ? <p className="mt-2 text-sm text-[var(--muted)]">{hint}</p> : null}
    </Card>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "ok" | "warn" | "danger" | "info" | "accent";
}) {
  const tones = {
    neutral: "bg-[var(--surface-muted)] text-[var(--ink)]",
    ok: "bg-[var(--surface-muted)] text-[var(--ok)]",
    warn: "bg-[var(--gold-soft)] text-[var(--warn)]",
    danger: "bg-[var(--accent-soft)] text-[var(--danger)]",
    info: "bg-[var(--surface-muted)] text-[var(--info)]",
    accent: "bg-[var(--accent-soft)] text-[var(--accent)]",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function PageIntro({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mb-6 max-w-3xl">
      <h2 className="font-display text-xl font-bold tracking-tight">{title}</h2>
      <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
        {description}
      </p>
    </div>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface-muted)]/60 px-6 py-12 text-center">
      <p className="font-display text-lg font-semibold">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-[var(--muted)]">
        {description}
      </p>
    </div>
  );
}

export function Button({
  children,
  className,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
}) {
  const variants = {
    primary:
      "bg-[var(--accent)] text-[var(--on-solid)] hover:bg-[var(--accent-hover)] disabled:opacity-60",
    secondary:
      "border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--surface-muted)]",
    ghost: "text-[var(--ink)] hover:bg-[var(--sidebar-hover)]",
  };
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition",
        variants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
