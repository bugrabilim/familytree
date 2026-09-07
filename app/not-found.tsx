import NotFoundView from "@/components/NotFoundView";

/**
 * Uygulama genelinde 404.
 *
 * Bu dosya yokken Next.js'in yerleşik ekranı çiziliyordu: "404 — This page
 * could not be found." İngilizceydi, markasızdı, TEK BİR BAĞLANTI içermiyordu
 * (kullanıcının tek çıkışı geri tuşuydu) ve kendi belgesini çizdiği için koyu
 * tema seçiliyken bile beyaz zemin geliyordu.
 *
 * Kök `app/not-found.tsx` hem `notFound()` çağrılarını hem de HİÇBİR ROTAYLA
 * eşleşmeyen yolları karşılar (Next 13.3'ten beri), dolayısıyla deneysel
 * `global-not-found.js` gerekmiyor: kılavuzun onu önerdiği iki durum da
 * burada yok — tek bir kök yerleşim var ve kök seviyede dinamik segment yok.
 * Ayrıca `global-not-found` yerleşimi atladığı için global stilleri, yazı
 * tiplerini ve temayı elle geri getirmek gerekirdi.
 *
 * Not: 404 durum kodu döndüğü için Next `noindex` etiketini kendisi ekliyor.
 */
export default function NotFound() {
  return <NotFoundView />;
}
