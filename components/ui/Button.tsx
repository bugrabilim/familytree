import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "soft";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-primary text-primary-text hover:bg-primary-hover shadow-soft active:translate-y-px",
  secondary:
    "bg-surface text-text border border-border hover:bg-surface-2 hover:border-border-strong shadow-soft active:translate-y-px",
  soft:
    "bg-primary-soft text-primary hover:brightness-95 dark:hover:brightness-125",
  ghost:
    "text-text-muted hover:text-text hover:bg-surface-2",
  danger:
    "bg-danger-soft text-danger hover:brightness-95 dark:hover:brightness-125",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-12 px-6 text-[15px] gap-2 rounded-xl",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
  full?: boolean;
}

export default function Button({
  variant = "primary",
  size = "md",
  full = false,
  className = "",
  children,
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      className={`
        inline-flex items-center justify-center font-medium
        transition-all duration-150
        disabled:opacity-45 disabled:pointer-events-none
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-bg
        ${VARIANTS[variant]} ${SIZES[size]} ${full ? "w-full" : ""} ${className}
      `}
    >
      {children}
    </button>
  );
}
