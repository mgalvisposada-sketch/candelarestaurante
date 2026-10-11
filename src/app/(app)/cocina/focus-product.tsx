"use client";

import { useEffect } from "react";

/** Marca visual + scroll al producto abierto desde el buscador de Cocina. */
export function productAnchorId(productId: string) {
  return `producto-${productId}`;
}

export function FocusProductEffect({
  productId,
  onFocus,
}: {
  productId?: string | null;
  /** Se llama antes del scroll (ej. expandir categoría). */
  onFocus?: (productId: string) => void;
}) {
  useEffect(() => {
    if (!productId) return;
    onFocus?.(productId);

    const tryScroll = () => {
      const el = document.getElementById(productAnchorId(productId));
      if (!el) return false;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.setAttribute("data-focus-hit", "1");
      window.setTimeout(() => {
        el.removeAttribute("data-focus-hit");
      }, 2800);
      return true;
    };

    // Si hay que expandir categoría, el DOM tarda un frame en montar el ítem.
    const timers = [
      window.setTimeout(tryScroll, 50),
      window.setTimeout(() => {
        if (!tryScroll()) window.setTimeout(tryScroll, 200);
      }, 180),
    ];

    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
  }, [productId, onFocus]);

  return null;
}
