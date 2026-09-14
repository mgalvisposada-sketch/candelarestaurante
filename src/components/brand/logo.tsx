import Image from "next/image";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
  size?: "sm" | "md" | "lg";
  className?: string;
  priority?: boolean;
};

/** Tamaño visual en pantalla (CSS). */
const displaySizes = {
  sm: 56,
  md: 96,
  lg: 160,
} as const;

export function BrandLogo({
  size = "md",
  className,
  priority = false,
}: BrandLogoProps) {
  const displayPx = displaySizes[size];
  // Pedimos 3× al optimizador para que el texto del círculo se lea nítido en retina.
  const sourcePx = displayPx * 3;

  return (
    <Image
      src="/brand/candela-logo.png"
      alt="Candela Tacos & Amigos"
      width={sourcePx}
      height={sourcePx}
      sizes={`${displayPx}px`}
      priority={priority}
      quality={100}
      className={cn("select-none object-contain", className)}
      style={{ width: displayPx, height: displayPx }}
    />
  );
}
