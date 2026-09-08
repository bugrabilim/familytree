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

/*
 * DOKUNMA BOYU BURADA — 69 ayrı bulgu değil, iki satır.
 *
 * Denetimde eşik altı çıkan "Düzenle / Merkeze al / Ortala / Çevre grafiği /
 * Sil" (PersonDrawer) ve "Tarif ekle / Mektup yaz / Duyuru ekle / Davet
 * oluştur / Etkinlik ekle / Tablo" düğmelerinin ORTAK sebebi `sm`in 32px
 * olmasıydı; `md` de 40px ile eşiğin (44) altındaydı. Çağrı yerlerine tek
 * tek `h-11` yazmak, on ikisinden birini unutmakla eşdeğerdi.
 *
 * #329'un kalıbı: kutunun KENDİSİ büyüyor, `lg` üstünde (fare) eski sıkı
 * ölçü geri geliyor. `min-w-11` ölçümden geldi: "Sil" gibi kısa etiketli
 * düğmeler yalnız dolgudan 38px genişlikte kalıyordu — eşik iki boyutta
 * birden geçerli. Sabit genişlik DEĞİL asgari genişlik, yani uzun etiketli
 * düğmelerin yatay bütçesi (320px'te sarma davranışı) aynı kaldı.
 */
const SIZES: Record<Size, string> = {
  sm: "h-11 lg:h-8 min-w-11 lg:min-w-0 px-3 text-xs gap-1.5 rounded-lg",
  md: "h-11 lg:h-10 min-w-11 lg:min-w-0 px-4 text-sm gap-2 rounded-xl",
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
