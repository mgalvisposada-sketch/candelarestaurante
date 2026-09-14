import Image from "next/image";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
  size?: "sm" | "md" | "lg";
  className?: string;
  priority?: boolean;
};

const sizes = {
  sm: 44,
  md: 72,
  lg: 120,
} as const;

export function BrandLogo({
  size = "md",
  className,
  priority = false,
}: BrandLogoProps) {
  const px = sizes[size];
  return (
    <Image
      src="/brand/candela-logo.png"
      alt="Candela Tacos & Amigos"
      width={px}
      height={px}
      priority={priority}
      className={cn("select-none object-contain", className)}
    />
  );
}
