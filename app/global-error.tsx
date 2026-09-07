"use client";

import { useEffect } from "react";
import { LanguageProvider, useT } from "@/lib/i18n";

/**
 * KÖK YERLEŞİM çöktüğünde çizilen son çare ekranı.
 *
 * ## Neden `error.tsx` yetmiyor
 *
 * Kılavuz (error.js): `error.js` KENDİ segmentindeki `layout.js`i SARMAZ.
 * Yani kök yerleşimde (`app/layout.tsx`) ya da hata sınırının kendisinde bir
 * şey patlarsa `app/error.tsx` hiç çizilmez; devreye Next'in yerleşik 500
 * ekranı girer — İngilizce, markasız, bağlantısız. Bulgunun 404 için
 * anlattığı çıkmazın birebir aynısı, yalnız daha nadir.
 *
 * ## Bu dosyanın kısıtları
 *
 * `global-error` kök yerleşimin YERİNE geçiyor: kendi `<html>`/`<body>`ını
 * çizmek zorunda ve global stiller (`globals.css`), yazı tipleri, tema sınıfı
 * buraya ULAŞMIYOR. Bu yüzden:
 *
 *  · Renk jetonları bu dosyada, satır içinde yeniden tanımlı (kopya değil,
 *    yalnız bu ekranın ihtiyaç duyduğu altı tanesi).
 *  · Tema `localStorage.tema`dan BAĞLANMA SONRASI okunuyor. Kök yerleşimdeki
 *    `THEME_SCRIPT` gibi satır içi bir `<script>` işe yaramıyor: bu ekran
 *    çoğu zaman istemcide çiziliyor ve React'in DOM'a eklediği `<script>`
 *    etiketleri ÇALIŞMIYOR. Öncesinde işletim sisteminin tercihine
 *    düşüyoruz (`prefers-color-scheme`), sonra kullanıcının seçimi geçiyor.
 *  · Metin `LanguageProvider` + `useT` ile geliyor: sözlük saf bir modül,
 *    yerleşime bağlı değil, dolayısıyla burada da çalışıyor.
 *
 * Kılavuz ayrıca `metadata` dışa aktarımının hata sınırlarında DESTEKLENMEDİĞİNİ
 * söylüyor; başlık React'in `<title>` bileşeniyle veriliyor.
 */

const CSS = `
:root {
  --bg: #f7f6f2; --surface: #ffffff; --border: #e2ded3;
  --text: #1b1a16; --text-muted: #6d675b;
  --primary: #1f6b47; --primary-hover: #185639; --primary-text: #ffffff;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-tema="light"]) {
    --bg: #12140f; --surface: #1a1d17; --border: #2f342a;
    --text: #eeece4; --text-muted: #a09a8c;
    --primary: #4fae82; --primary-hover: #64c096; --primary-text: #0d1a13;
  }
}
:root[data-tema="dark"] {
  --bg: #12140f; --surface: #1a1d17; --border: #2f342a;
  --text: #eeece4; --text-muted: #a09a8c;
  --primary: #4fae82; --primary-hover: #64c096; --primary-text: #0d1a13;
}
html, body { margin: 0; height: 100%; }
body {
  background: var(--bg); color: var(--text);
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  display: grid; place-items: center; padding: 24px;
}
.ge-kutu { max-width: 30rem; text-align: center; }
.ge-baslik { font-size: 1.6rem; font-weight: 600; margin: 0 0 12px; }
.ge-govde { font-size: 0.95rem; line-height: 1.6; color: var(--text-muted); margin: 0 0 28px; }
.ge-yollar { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; }
.ge-dugme, .ge-baglanti {
  display: inline-flex; align-items: center; justify-content: center;
  height: 48px; padding: 0 24px; border-radius: 12px;
  font: inherit; font-size: 0.95rem; font-weight: 500;
  cursor: pointer; text-decoration: none; border: 1px solid transparent;
}
.ge-dugme { background: var(--primary); color: var(--primary-text); }
.ge-dugme:hover { background: var(--primary-hover); }
.ge-baglanti { background: var(--surface); color: var(--text); border-color: var(--border); }
`;

function Icerik({ retry }: { retry: () => void }) {
  const t = useT();
  return (
    <div className="ge-kutu">
      <title>{t("crash.title")}</title>
      <h1 className="ge-baslik">{t("crash.title")}</h1>
      <p className="ge-govde">{t("crash.body")}</p>
      <div className="ge-yollar">
        <button type="button" className="ge-dugme" onClick={() => retry()}>
          {t("crash.retry")}
        </button>
        {/*
          Next `<Link>` DEĞİL ve kural bilerek susturuluyor: buraya
          düşüldüyse KÖK YERLEŞİM çökmüş demektir. `<Link>` istemci tarafı bir
          gezinme yapar ve aynı çökmüş ağacı yeniden çizmeye çalışır —
          kullanıcı büyük olasılıkla yine bu ekranda kalırdı. Tam sayfa
          yüklemesi, çıkışın gerçekten çalışmasının tek garantisi.
        */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="ge-baglanti" href="/">
          {t("crash.home")}
        </a>
      </div>
    </div>
  );
}

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  // Ayrıntı yalnız günlüğe — kullanıcıya teknik metin gösterilmiyor.
  useEffect(() => {
    console.error(error);
  }, [error]);

  /*
   * Kullanıcının tema seçimi. Kök yerleşim (ve onun `THEME_SCRIPT`i) bu
   * ekranda yok; seçim okunana kadar işletim sisteminin tercihi geçerli.
   * `.dark` SINIFI değil `data-tema` ÖZNİTELİĞİ kullanılıyor, çünkü buradaki
   * kurallar `globals.css`ten değil yukarıdaki satır içi CSS'ten geliyor.
   */
  useEffect(() => {
    try {
      const secim = localStorage.getItem("tema") === "dark" ? "dark" : "light";
      document.documentElement.setAttribute("data-tema", secim);
    } catch {
      // localStorage erişilemiyorsa işletim sisteminin tercihi kalır.
    }
  }, []);

  return (
    <html lang="tr" suppressHydrationWarning>
      <body>
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <LanguageProvider>
          <Icerik retry={retry} />
        </LanguageProvider>
      </body>
    </html>
  );
}
