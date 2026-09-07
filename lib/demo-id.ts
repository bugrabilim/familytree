/**
 * Demo ağacının KİMLİĞİ — bilerek bağımlılıksız, tek dosyalık bir sabit.
 *
 * ## Neden `lib/demo-account.ts` içinde durmuyor
 *
 * Kimliğin evi hâlâ demo dosyası: `lib/demo-account.ts` bu sabiti içe aktarıp
 * aynı adla yeniden dışa aktarıyor, yani `@/lib/demo-account` üzerinden gelen
 * yirmi kadar çağıran hiç değişmedi. Ayrılmasının tek sebebi bir DÖNGÜ:
 *
 *   `lib/demo-account.ts` → `@/lib/blob` (`saveFamilyData`)
 *
 * Demo hazırlığı ağacı Blob'a yazdığı için bu bağımlılık kaçınılmaz. İyimser
 * kilidin (`lib/version-lock.ts`) demo muafiyetini tanıyabilmesi içinse
 * kilidin de kimliği bilmesi gerekiyordu; kilit `lib/blob.ts` üzerinden
 * yayınlandığından, kimliği demo dosyasından okumak `blob → demo-account →
 * blob` çemberini kapatırdı. ESM böyle bir çemberi çalıştırır ama yükleme
 * sırasına bağımlı, sessizce `undefined` verebilen bir zemin bırakır — ve
 * burada `undefined` bir kimlik, "hiçbir ağaç demo değil" (kilit demoyu da
 * kilitler) ya da daha kötüsü karşılaştırmanın yanlış tarafa düşmesi demek.
 *
 * Alternatif, dizgenin (`"demo-hesap"`) kilit tarafına elle kopyalanmasıydı.
 * Kopya kimlik en kötüsü olurdu: bir gün kimlik değişirse kopya sessizce
 * eskir ve muafiyet ARTIK HİÇBİR ağaca uymaz — demo yine kilitlenir, üstelik
 * kimse fark etmeden. Tek tanım noktası bu yüzden burada.
 *
 * Bu dosyanın hiçbir içe aktarımı yok; hem çemberi keser hem de
 * `node --experimental-strip-types` altında birim testi koşulabilir kalır
 * (bkz. CLAUDE.md — çalışma zamanı `@/…` içe aktarımı olan kitaplık test
 * edilemiyor).
 */

/** Herkese açık ortak demo ağacının kimliği (aynı zamanda `treeId`si). */
export const DEMO_USER_ID = "demo-hesap";

/**
 * Verilen ağaç, herkese açık demo oyun alanı mı?
 *
 * Karşılaştırmayı çağıranların tek tek tekrarlaması yerine tek bir yerde
 * tutuyoruz: "demo mu" sorusunun cevabı ileride değişirse (ör. birden çok
 * demo ağacı) tek nokta güncellenir.
 */
export function isDemoTree(treeId: string | null | undefined): boolean {
  return treeId === DEMO_USER_ID;
}
