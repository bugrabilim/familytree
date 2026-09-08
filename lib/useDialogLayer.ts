"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * Bir katmanın `role="dialog"` + `aria-modal="true"` SÖZÜNÜ gerçekten tutması.
 *
 * ## Neden bir kanca, neden 12 çağıranda değil
 *
 * Denetimde ölçülen şuydu: `Modal` tabanlı on iki pencere açılışta odağı hiç
 * içeri almıyordu (`document.activeElement === body`), ilk Tab basımı odağı
 * ARKADAKİ üst çubuğa çıkarıyordu, kapanışta odak açan düğmeye dönmüyordu ve
 * arka plan ne `inert` ne `aria-hidden`di. Yani `aria-modal="true"` yazıyordu
 * ama söylediği şeylerin hiçbiri doğru değildi — ekran okuyucu "buradan
 * çıkamazsın" diye anons ederken kullanıcı iki Tab'da arkaya düşüyordu. Söz
 * verilip tutulmayan bir semantik, hiç verilmemiş sözden daha kötüdür: yardımcı
 * teknoloji ona GÜVENİP kendi kaçış yollarını kapatır.
 *
 * Düzeltme tek yerde: `Modal` bu kancayı çağırıyor, on iki çağıran değişmiyor.
 * Aynı kanca tam ekran katmanlar (kitap, yazdırma önizlemesi, yapay zekâ
 * paneli, kişi paneli) için de kullanılıyor — onlara `aria-modal` EKLEMENİN
 * ön koşulu buydu; yoksa aynı boş söz dört yerde daha verilmiş olurdu.
 *
 * ## Arka planı neden `inert`, neden `aria-hidden` değil
 *
 * `aria-hidden` yalnız ekran okuyucudan gizler; klavye odağı hâlâ arkaya
 * gider ve kullanıcı GÖRMEDİĞİ bir düğmeye basar. `inert` ikisini birden
 * yapar: odaklanamaz, tıklanamaz, okunamaz.
 *
 * `inert` katmanın KENDİSİNE değil, kök zincirindeki her KARDEŞE konuyor.
 * Sebebi: bazı pencereler (Modal, kişi paneli) React ağacının içinde,
 * bazıları (kitap, sohbet) `createPortal` ile doğrudan `body` altında. Tek
 * kural ikisini de kapsasın diye katmandan `body`ye yürüyüp yol üstündeki
 * kardeşleri işaretliyoruz — katmanın atası olan hiçbir kutu işaretlenmez,
 * yani katmanın kendisi her zaman canlı kalır.
 *
 * `layerRef` bu yüzden ayrı: arka plan perdesi (tıklayınca kapatan `aria-hidden`
 * kutu) genelde panelin KARDEŞİdir. Zinciri panelden başlatsaydık perdeyi de
 * etkisizleştirirdik ve "boşluğa tıklayınca kapanır" davranışı sessizce
 * ölürdü. Zincir perde ile paneli birlikte saran kutudan başlıyor.
 *
 * ## Yığın — `useEscapeKey` ile aynı gerekçe
 *
 * İki katman üst üste açılabiliyor (pencere içinden fotoğraf ışık kutusu).
 * Her katman kendi Tab tuzağını kursaydı, alttaki katman odağı kendine geri
 * çekerdi. Tek dinleyici + yığının tepesi: tuzağı yalnız EN ÜSTTEKİ kurar.
 */

const ODAKLANABILIR = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "audio[controls]",
  "video[controls]",
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(",");

/** Kapsayıcı içindeki, GERÇEKTEN odaklanabilir öğeler (görünür + etkisizleştirilmemiş). */
function odaklanabilirler(kap: HTMLElement): HTMLElement[] {
  return Array.from(kap.querySelectorAll<HTMLElement>(ODAKLANABILIR)).filter(
    (el) =>
      !el.hasAttribute("inert") &&
      !el.closest("[inert]") &&
      /* Gizli öğe (display:none, `hidden` özniteliği) sıfır kutu döndürür.
         `offsetParent` yeterli değil: `position:fixed` panellerde null olur. */
      el.getClientRects().length > 0
  );
}

const yigin: HTMLElement[] = [];
let bagli = false;

function tabTuzagi(e: KeyboardEvent) {
  if (e.key !== "Tab") return;
  const panel = yigin[yigin.length - 1];
  if (!panel || !panel.isConnected) return;

  const liste = odaklanabilirler(panel);
  /* İçeride odaklanacak hiçbir şey yoksa Tab hiçbir yere gitmemeli —
     aksi hâlde ilk basışta arkaya düşerdi. */
  if (liste.length === 0) {
    e.preventDefault();
    return;
  }
  const ilk = liste[0];
  const son = liste[liste.length - 1];
  const aktif = document.activeElement;

  if (!panel.contains(aktif)) {
    e.preventDefault();
    (e.shiftKey ? son : ilk).focus();
  } else if (e.shiftKey && aktif === ilk) {
    e.preventDefault();
    son.focus();
  } else if (!e.shiftKey && aktif === son) {
    e.preventDefault();
    ilk.focus();
  }
}

interface Secenekler {
  /**
   * Perde + panelin ORTAK kökü. Verilmezse zincir panelden başlar ve perde de
   * etkisizleşir (bkz. yukarıdaki gerekçe).
   */
  layerRef?: RefObject<HTMLElement | null>;
  /**
   * Kipsellik koşullu olabilir: kişi paneli dar ekranda perdeli bir modal,
   * geniş ekranda yan yana duran bir panel. Kapalıyken kanca hiçbir şey yapmaz.
   */
  enabled?: boolean;
}

export default function useDialogLayer(
  panelRef: RefObject<HTMLElement | null>,
  { layerRef, enabled = true }: Secenekler = {}
): void {
  /*
   * AÇAN ÖĞE ÇİZİM SIRASINDA yakalanıyor, efektte değil.
   *
   * Efekt çok geç: `PersonForm`un `autoFocus`u commit sırasında, komut
   * paletinin kendi odak efekti de bu efektten önce çalışıyor. O ana kadar
   * odak çoktan pencerenin İÇİNE girmiş oluyor ve "açan öğe" diye pencerenin
   * kendi girdisini kaydederdik — kapanışta odak hiçbir yere dönmezdi
   * (ölçümde `BODY` olarak görünen tam olarak buydu). Bileşenin gövdesi ise
   * çocuklar çizilmeden önce çalışır, yani buradaki okuma gerçek açanı verir.
   */
  const [acan] = useState<HTMLElement | null>(() =>
    typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null)
  );

  useEffect(() => {
    const panel = panelRef.current;
    if (!enabled || !panel) return;


    /* ── 1. Arka planı etkisizleştir ─────────────────────────────────── */
    const etkisizlestirilen: HTMLElement[] = [];
    let dugum: HTMLElement | null = layerRef?.current ?? panel;
    while (dugum && dugum !== document.body) {
      const ebeveyn: HTMLElement | null = dugum.parentElement;
      if (!ebeveyn) break;
      for (const kardes of Array.from(ebeveyn.children)) {
        if (kardes === dugum || !(kardes instanceof HTMLElement)) continue;
        /* Zaten etkisizse (üstteki bir katman işaretlemiş) dokunma: cleanup'ta
           BİZİM açmamamız gerekiyor, yoksa alttaki katman erken canlanır. */
        if (kardes.hasAttribute("inert")) continue;
        kardes.setAttribute("inert", "");
        etkisizlestirilen.push(kardes);
      }
      dugum = ebeveyn;
    }

    /* ── 2. Odağı içeri al ───────────────────────────────────────────── */
    /*
     * İSTİSNALARI KORUYORUZ: `PersonForm` ilk girdiye (`autoFocus`),
     * `CommandPalette` arama girdisine kendi odaklanıyor. React `autoFocus`u
     * commit sırasında, yani ebeveynin bu efektinden ÖNCE uyguluyor; bu
     * yüzden "panelde odak zaten varsa dokunma" kuralı o davranışları
     * olduğu gibi bırakıyor.
     */
    let tabIndexEklendi = false;
    /*
     * BİR KARE BEKLENİYOR — ölçümle bulundu.
     *
     * `autoFocus`un odağı gerçekten taşıması bu efektten SONRA tamamlanıyor:
     * senkron baktığımızda odak henüz `body`de görünüyor, biz de kapatma
     * düğmesine atlıyorduk. Sonuç, korunması gereken istisnanın kırılmasıydı
     * — kişi formu adı yazmak için hazır açılırken kapatma düğmesiyle
     * açılmaya başladı (ölçüldü: `BUTTON:Kapat`, beklenen `INPUT[Ayşe]`).
     *
     * Bir kare sonra bakınca `autoFocus` (ve komut paletinin kendi odak
     * efekti) çoktan yerleşmiş oluyor; panelde odak varsa dokunmuyoruz.
     * Gecikmenin güvenlik bedeli yok: arka plan `inert` YUKARIDA, senkron
     * olarak kapatıldı — o kare boyunca da dışarı odaklanılamaz.
     */
    const kare = requestAnimationFrame(() => {
      if (panel.contains(document.activeElement)) return;
      const ilk = odaklanabilirler(panel)[0];
      if (ilk) {
        ilk.focus();
      } else {
        /* Odaklanabilir çocuğu olmayan pencere de odağı almalı; almazsa
           ekran okuyucu imleci sayfanın başında kalır. */
        if (!panel.hasAttribute("tabindex")) {
          panel.setAttribute("tabindex", "-1");
          tabIndexEklendi = true;
        }
        panel.focus();
      }
    });

    /* ── 3. Tab'ı içeride tut ────────────────────────────────────────── */
    yigin.push(panel);
    if (!bagli) {
      document.addEventListener("keydown", tabTuzagi, true);
      bagli = true;
    }

    return () => {
      cancelAnimationFrame(kare);
      const i = yigin.lastIndexOf(panel);
      if (i !== -1) yigin.splice(i, 1);

      for (const el of etkisizlestirilen) el.removeAttribute("inert");
      if (tabIndexEklendi) panel.removeAttribute("tabindex");

      /*
       * Odağı açan öğeye GERİ VER — ama yalnız KATMAN GERÇEKTEN KAPANDIYSA.
       *
       * Temizlik yalnız kapanışta çalışmıyor: React geliştirme kipinde her
       * efekti bir kez kurup bozup yeniden kuruyor, ve `enabled` değişince
       * (kişi paneli `sm` eşiğini geçtiğinde) de temizlik akıyor. Koşulsuz
       * geri verme bu iki hâlde de tetikleniyor ve ÖLÇÜLEN arıza şuydu:
       * `autoFocus` kişi formunun ilk girdisine odaklanıyor, hemen ardından
       * sahte temizlik odağı açan düğmeye geri alıyor, sonra kanca "panelde
       * odak yok" deyip kapatma düğmesine atlıyordu. Korunması istenen
       * istisna tam olarak böyle kırılmıştı (`INPUT[Ayşe]` yerine
       * `BUTTON:Kapat`).
       *
       * `isConnected` ayrımı kesin: React kapanışta düğümleri DOM'dan
       * mutasyon evresinde çıkarır, pasif temizlik ondan sonra çalışır —
       * yani gerçek kapanışta panel bağlı değildir, sahte temizlikte ise
       * hâlâ ekrandadır.
       */
      if (!panel.isConnected && acan && acan.isConnected && typeof acan.focus === "function") {
        acan.focus();
      }
    };
  }, [panelRef, layerRef, enabled, acan]);
}
