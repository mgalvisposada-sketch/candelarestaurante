"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function signOut() {
    setLoading(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.replace("/login");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={loading}
      className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-left text-sm text-white transition hover:bg-white/10 disabled:opacity-60"
    >
      {loading ? "Cerrando sesión…" : "Cerrar sesión"}
    </button>
  );
}
