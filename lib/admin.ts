/**
 * SİTE İŞLETMECİSİ kim?
 *
 * Bu depodaki bütün yetki kavramları AĞACA ait: `isFounder` "kendi ağacını
 * kurdu" demek, `canManage` "bu ağacı yönetebilir" demek. Hiçbiri "siteyi
 * işleten kişi" demek değil — ve her kullanıcı kendi ağacının kurucusu
 * olduğu için `isFounder` işletmeci yerine kullanılamaz: o zaman kaydolan
 * herkes gelen kutusunu okurdu.
 *
 * O yüzden ayrı ve dar bir kavram: ortam değişkeninde açıkça yazan hesap
 * kimlikleri. Veritabanında bir bayrak değil, çünkü bayrağı yazabilen bir
 * yol, o yolu ele geçirenin kendini işletmeci yapması demek olurdu.
 *
 * YAPILANDIRILMAMIŞSA HİÇ KİMSE işletmeci değildir. Ters varsayım
 * ("kimse tanımlı değilse ilk kurucu işletmecidir") kolaylık gibi görünür ve
 * gerçekte gelen kutusunu ilk kaydolana açardı.
 *
 * Saf ve bağımlılıksız — birim testi koşulabilsin.
 */

/** Ortam değişkenindeki kimlikler. Virgül/boşluk ayraçlı. */
export function adminIds(raw: string | undefined = process.env.ADMIN_ACCOUNT_IDS): string[] {
  return (raw ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isAdminConfigured(raw?: string): boolean {
  return adminIds(raw).length > 0;
}

/**
 * Bu hesap site işletmecisi mi?
 *
 * Karşılaştırma büyük/küçük harf duyarsız çünkü kimlikler UUID ve elle
 * kopyalanıyor; yalnız harf kutusu yüzünden "neden çalışmıyor" aramak
 * gereksiz bir tuzak. Kimliğin kendisi rastgele ve tahmin edilemez olduğu
 * için kutu duyarsızlığı bir güvenlik gevşemesi değil.
 */
export function isAdminAccount(accountId: string | undefined, raw?: string): boolean {
  if (!accountId) return false;
  const hedef = accountId.trim().toLocaleLowerCase("en");
  if (!hedef) return false;
  return adminIds(raw).some((id) => id.toLocaleLowerCase("en") === hedef);
}
