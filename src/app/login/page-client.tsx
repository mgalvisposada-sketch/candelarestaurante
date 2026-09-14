"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BrandLogo } from "@/components/brand/logo";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/inicio";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key) {
      setError(
        "Faltan variables NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. Configure el entorno antes de autenticar.",
      );
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    router.replace(next);
    router.refresh();
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4">
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_10%,rgba(225,29,18,0.35),transparent_45%),radial-gradient(ellipse_at_85%_90%,rgba(240,192,0,0.12),transparent_40%),linear-gradient(165deg,#050505_0%,#121212_55%,#1a0a08_100%)]"
      />
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.07] [background-image:repeating-linear-gradient(-12deg,transparent,transparent_11px,rgba(255,255,255,0.35)_11px,rgba(255,255,255,0.35)_12px)]"
      />

      <div className="relative w-full max-w-md border border-white/10 bg-[#111]/95 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-sm">
        <div className="flex flex-col items-center text-center">
          <BrandLogo size="lg" priority />
          <p className="mt-5 font-display text-2xl font-bold tracking-tight text-white">
            Candela Admin
          </p>
          <p className="mt-2 max-w-sm text-sm text-neutral-400">
            Acceso privado a la administración financiera y corporativa.
          </p>
        </div>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <label className="block text-sm">
            <span className="mb-1.5 block text-neutral-400">Correo</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2.5 text-white outline-none transition placeholder:text-neutral-600 focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/40"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-neutral-400">Contraseña</span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2.5 text-white outline-none transition placeholder:text-neutral-600 focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/40"
            />
          </label>
          {error ? (
            <p className="rounded-lg bg-[var(--accent-soft)] px-3 py-2 text-sm text-[var(--danger)]">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-60"
          >
            {loading ? "Ingresando…" : "Ingresar"}
          </button>
        </form>
      </div>
    </div>
  );
}
