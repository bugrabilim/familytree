import InboxClient from "./InboxClient";

export const dynamic = "force-dynamic";

/**
 * GELEN KUTUSU — `/admin/posta`.
 *
 * Yetki denetimi UÇTA (`/api/admin/inbox`), sayfada değil: sayfa yalnız bir
 * kabuk ve içeriği uçtan çekiyor. Denetimi burada da tekrarlamak, kuralın
 * ikinci bir kopyası olurdu ve kopyalar ayrışır.
 *
 * Arayüz metinleri TÜRKÇE sabit: bu ekranı tek bir kişi (site işletmecisi)
 * görüyor. `lib/i18n-dict.ts`e otuz anahtar eklemek, hiç okunmayacak bir
 * çeviri yükü olurdu — deponun başka yerlerinde de (ör. `PersonForm`
 * içindeki birkaç etiket) aynı istisna var.
 */
export const metadata = {
  title: "Gelen posta",
  robots: { index: false, follow: false },
};

export default function InboxPage() {
  return <InboxClient />;
}
