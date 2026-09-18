"use client";

import { useEffect, useRef } from "react";

/**
 * Ejecuta `fn` tras `delayMs` sin nuevas llamadas.
 * Ideal para autoguardar sin bloquear edición posterior.
 */
export function useDebouncedCallback<T extends unknown[]>(
  fn: (...args: T) => void,
  delayMs: number,
) {
  const fnRef = useRef(fn);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (...args: T) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      fnRef.current(...args);
    }, delayMs);
  };
}

export type AutosaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export function autosaveLabel(state: AutosaveState): string | null {
  if (state === "dirty") return "Cambios sin guardar…";
  if (state === "saving") return "Autoguardando…";
  if (state === "saved") return "Autoguardado · puedes seguir editando";
  if (state === "error") return "No se pudo guardar";
  return null;
}
