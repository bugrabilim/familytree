/**
 * KULLANICIYA GÖSTERİLECEK HATA METNİ.
 *
 * ## Sorun
 *
 * Depodaki her istemci akışı aynı kalıbı yazıyor:
 *
 *     try { … const d = await res.json(); if (!res.ok) throw new Error(d?.error ?? "…"); }
 *     catch (e) { setHata((e as Error).message); }
 *
 * Kalıp, sunucu DÜZGÜN bir JSON hatası döndürdüğünde doğru çalışıyor. Ama
 * `res.json()` kendisi fırlayabiliyor ve fırladığında yakalanan şey artık
 * bizim yazdığımız cümle değil, tarayıcının ayrıştırıcı hatası:
 *
 *     Unexpected token '<', "<!DOCTYPE "... is not valid JSON
 *
 * Bu metin kullanıcıya olduğu gibi gösteriliyordu. Ne olduğunu söylemiyor, ne
 * yapılacağını söylemiyor, ve uygulamanın bozuk olduğu izlenimi bırakıyor —
 * oysa çoğu zaman anlamı basit: sunucu bir HTML sayfası döndürdü (500 hata
 * sayfası, oturum düşünce gelen giriş yönlendirmesi, ya da vekil sunucunun
 * araya girmesi).
 *
 * Aynı sınıfta ağ hataları da var: `Failed to fetch`, `NetworkError when
 * attempting to fetch resource`, `Load failed`. Üçü de tarayıcıya göre
 * değişen, çevrilmemiş, kullanıcıya hiçbir şey anlatmayan dizeler.
 *
 * ## Kural
 *
 * Bizim yazdığımız mesajlar OLDUĞU GİBİ geçer — onlar zaten kullanıcı için
 * yazıldı ve i18n'den geliyor. Yalnız TANINAN ham hatalar değiştirilir.
 * Ters yön (her şeyi genel bir cümleyle değiştirmek) daha kötü olurdu:
 * "Bu ağaç siz bakarken değişti" gibi eyleme dönük mesajlar kaybolurdu.
 *
 * Saf ve bağımlılıksız — birim testi koşulabilsin.
 */

/**
 * Ham hata imzaları.
 *
 * Tarayıcıya göre değişiyor, o yüzden liste geniş ve parça eşleşmesi
 * yapıyor. Yanlış pozitif riski düşük: bu ifadeler bizim yazdığımız Türkçe
 * ya da İngilizce ürün metinlerinde geçmiyor.
 */
const HAM = [
  /* JSON ayrıştırma — sunucu HTML döndürdü. */
  "unexpected token",
  "is not valid json",
  "unexpected end of json",
  "json.parse",
  "syntaxerror",
  /* Ağ — istek hiç ulaşmadı. */
  "failed to fetch",
  "networkerror",
  "load failed",
  "fetch failed",
  "err_internet_disconnected",
  /* İptal edilmiş istek. */
  "aborterror",
  "the operation was aborted",
];

/** Metin tanınan bir ham hata mı? */
export function isRawError(message: string): boolean {
  const m = message.toLocaleLowerCase("en");
  return HAM.some((x) => m.includes(x));
}

/**
 * Yakalanan bir şeyden kullanıcıya gösterilecek metni üretir.
 *
 * `fallback` çağıranın kendi bağlamına ait çevrilmiş cümlesi ("Kişi
 * kaydedilemedi." gibi) — ham hata da boş mesaj da onun yerine geçemez.
 */
export function userMessage(e: unknown, fallback: string): string {
  const ham = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  const m = ham.trim();
  if (!m) return fallback;
  if (isRawError(m)) return fallback;
  return m;
}
