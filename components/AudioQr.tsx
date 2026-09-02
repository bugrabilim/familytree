"use client";

import { useMemo } from "react";
import QRCode from "qrcode";

/**
 * Sesli anının kâğıda basılabilir hâli: kaydın adresini taşıyan bir QR.
 *
 * `PrintView`de yıllardır şu not duruyordu: "ses basılamaz, bu yüzden yalnız
 * metin". Doğruydu — ama sesin KENDİSİ değil, ona giden yol basılabilir.
 * Kitapta anının yazılı hâlinin yanında duran bu kare telefonla okutulunca
 * kayıt açılır; böylece yalnız sesli bırakılmış anılar da kitaba girer.
 *
 * SVG olarak, SENKRON çiziliyor:
 * · `QRCode.create` geri çağrısız çalışır → efekt/durum yok, sayfa akışı
 *   ölçülürken kutu zaten yerinde (kitap sayfa bölmesini boyutla hesaplıyor).
 * · Vektör baskıda keskin çıkar; data-URL'li bir PNG 300 dpi'da bulanıklaşırdı.
 *
 * `qrcode` paketini ana pakete sokmamak için çağıran taraf bunu `next/dynamic`
 * ile yükler.
 */
/**
 * Basılı modül (küçük kare) kenarı, milimetre.
 *
 * Kutuyu SABİT boyutta çizmek yanlıştı: adres uzadıkça modül sayısı artıyor,
 * aynı kutuda modüller küçülüyor. Gerçekçi Cloudinary adresleriyle ölçtük —
 * 56 px'lik bir kutuda modül 0.26–0.40 mm'ye düşüyor, yani telefonun
 * okuyamayacağı kadar küçük. Okunmayan bir QR, hiç basılmamış bir QR'dan
 * kötüdür: yer kaplar ve okutmayı deneyen kişiyi boşa uğraştırır.
 *
 * 0.5 mm yakın mesafeden güvenli tarama için seçilmiş bir alt sınır (kameraya
 * ve ışığa göre 0.4 mm'ye kadar inilebiliyor, ama kitap yıllarca elden ele
 * geçecek; pay bırakmak doğru).
 */
const MODULE_MM = 0.5;
/** CSS px ↔ mm (96 dpi referansı; SVG olduğu için baskıda çözünürlük tam). */
const PX_PER_MM = 96 / 25.4;

export default function AudioQr({
  url,
  className = "",
}: {
  url: string;
  className?: string;
}) {
  const qr = useMemo(() => {
    try {
      // "M": kâğıt kıvrılsa/lekelense de okunacak kadar hata payı, ama
      // "H" kadar sık modül değil — küçük basıldığında modüller okunabilir kalır.
      const { modules } = QRCode.create(url, { errorCorrectionLevel: "M" });
      const n = modules.size;
      let d = "";
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          if (modules.data[y * n + x]) d += `M${x} ${y}h1v1h-1z`;
        }
      }
      return { n, d };
    } catch {
      // Adres QR'a sığmayacak kadar uzunsa çizmemek doğru: yarım bir kare
      // okutulunca hiçbir şey açmaz, sayfada yer kaplar ve kafa karıştırır.
      return null;
    }
  }, [url]);

  if (!qr) return null;

  // 2 modülük sessiz alan — QR standardı 4 ister ama küçük baskıda 2 yeterli
  // ve kutu daha az yer kaplar; çevresindeki beyaz kâğıt zaten payı büyütüyor.
  const q = 2;
  const box = qr.n + q * 2;
  // Boyut modül sayısından TÜRETİLİR — çağıran seçmez. Uzun bir adres daha
  // büyük bir kare çizer; alternatif, okunmayan bir kare basmaktı.
  const size = Math.ceil(box * MODULE_MM * PX_PER_MM);

  return (
    <svg
      viewBox={`0 0 ${box} ${box}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      role="img"
      aria-label={url}
      className={`shrink-0 ${className}`}
    >
      <rect width={box} height={box} fill="#fff" />
      <g transform={`translate(${q} ${q})`} fill="#000">
        <path d={qr.d} />
      </g>
    </svg>
  );
}
