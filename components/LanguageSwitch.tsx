"use client";

import { useLang, useT } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";

/**
 * Kompakt TR / EN dil değiştirici — segmented control. Üst çubukta, alt
 * bilgide ve kimlik ekranlarında (AuthShell) kullanılır. Gizlilik/salt-okunur
 * düğmeleriyle aynı görsel dili kullanır.
 */
export default function LanguageSwitch({ className = "" }: { className?: string }) {
  const { lang, setLang } = useLang();
  const t = useT();
  const options: Array<{ v: Lang; l: string }> = [
    { v: "tr", l: "TR" },
    { v: "en", l: "EN" },
  ];
  return (
    <div
      role="group"
      /* Grubun adı da sözlükten: TR oturumda "Language" yazıyordu. */
      aria-label={t("lang.group")}
      /*
       * `inline-flex`, `flex` DEĞİL.
       *
       * Blok düzeyinde bir `display:flex` kutusu, kapsayıcısının genişliğini
       * doldurur. Üst çubukta bu görünmüyordu (orada kendisi de bir flex
       * ÖĞESİ, yani içeriğe göre daralıyor: her genişlikte ölçülen 69-71px),
       * ama alt bilginin dikey sütununda kutu sütunun tamamına yayılıyordu:
       * 320px'te 288px, 768px'te 344px, 1024px'te 170px, 1440px'te 195px.
       * Sonuç, içinde iki küçük düğmenin sola sıkıştığı boş gri bir çubuktu —
       * segment kontrolü gibi değil, bozuk bir giriş alanı gibi duruyordu.
       * Çözüm `w-fit` (`inline-flex` DEĞİL): kutu her iki bağlamda da içeriğine
       * göre daralıyor ama `display` `flex` kalıyor. Bu önemli, çünkü çağrı
       * yerleri görünürlüğü `hidden sm:flex` ile yönetiyor: Tailwind'in
       * ürettiği stil sırasında `.inline-flex`, `.hidden`i EZİYOR (ölçüldü —
       * `inline-flex` denemesinde dil anahtarı 320px'te üst barda çizilip
       * satırı 365px'e şişirdi, belge 425px'e taştı). `.flex` ise `.hidden`in
       * altında kalıyor; yani gizleme çalışmaya devam ediyor.
       */
      className={`flex w-fit items-center gap-0.5 p-0.5 rounded-lg bg-surface-2 border border-border ${className}`}
    >
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => setLang(o.v)}
          aria-pressed={lang === o.v}
          /*
           * Dokunmada 44x44, farede (lg) eskisi gibi 30x28 — #307'nin üst
           * çubukta kurduğu kalıp. Ölçülen hâl 30x28'di ve iki düğme YAN YANA
           * duruyor: yanlış dile basmak tek bir parmak kaymasıydı.
           * Büyütme kutunun KENDİSİNİ büyütüyor (görünmez `::before` vuruş
           * alanıyla değil) — görülen ile basılan aynı yer kalsın diye.
           */
          className={`h-11 min-w-11 lg:h-7 lg:min-w-0 px-2 grid place-items-center rounded-md text-[11px] font-semibold tabular-nums transition-colors ${
            lang === o.v
              ? "bg-bg-elevated text-text shadow-soft"
              : "text-text-muted hover:text-text"
          }`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}
