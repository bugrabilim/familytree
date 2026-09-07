import { readFileSync } from "node:fs";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
/** Yorumları ayıkla: kuralı ANLATAN metin, kuralın kanıtı değildir. */
const kodu = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * KAPI: "okunamayan dosya, BOŞ dosya değildir" (denetim A6/A7).
 *
 * ## Neden bu kural
 *
 * Bu depodaki her JSON deposu oku→değiştir→yaz döngüsüyle çalışıyor. Okuma
 * arızasında boş bir yapı dönmek, bir sonraki yazmanın o boşluğu DİSKE
 * indirmesi demek: geçici bir hata kalıcı bir kayba dönüşüyor.
 *
 * Aynı tuzak bu depoda beş dosyada vardı ve beşi de ayrı ayrı bulundu:
 * `users.json`, `tree-access-*`, `family-data-*` (A1–A3), sonra
 * `family-history-*` ve `account-trees-*` (A6/A7). Beşi de aynı yönde
 * çözüldü: FIRLAT.
 *
 * Ayrım "dosya yok" ile "dosya okunamadı" arasında: birincisi meşru bir
 * boşluk, ikincisi bir arıza.
 */

for (const [ad, yol, fn] of [
  ["geçmiş", "../lib/history.ts", "async function readHistory"],
  ["ağaç kaydı", "../lib/trees.ts", "async function readRegistry"],
] as const) {
  const src = kodu(read(yol));
  const i = src.indexOf(fn);
  check(i > -1, `${ad}: okuyucu bulundu`);
  const govde = src.slice(i, src.indexOf("\n}", i));

  /* HTTP hatası FIRLATIYOR — sessizce boş dönmüyor. */
  check(/statusCode !== 200\)\s*\n?\s*throw new Error/.test(govde),
    `${ad}: HTTP hatasında FIRLATIYOR`);
  /*
   * Ve gövdede bir `catch` yok: eskiden bütün gövde `try` içindeydi ve
   * `catch` her arızayı — bozuk JSON dâhil — boş yapıya çeviriyordu.
   */
  check(!/\} catch/.test(govde), `${ad}: her şeyi yutan catch YOK`);
  /* DOSYA YOKSA boş dönmek doğru: bu bir arıza değil. */
  check(/blobs\.length === 0\) return/.test(govde), `${ad}: dosya yoksa boş dönüyor`);
}

/* ══ Fırlatan okuyucunun çağıranları ═══════════════════════════════════ */
/*
 * Bir okuyucuyu fırlatır hâle getirmek, çağıranlarını da gözden geçirmeyi
 * gerektiriyor: düzeltmenin kendisi düzelttiği arızadan ağır bir hasar
 * verebilir.
 */
{
  /*
   * `resolveActiveTree` HER API isteğinin ilk adımı. Sarmalanmasaydı geçici
   * bir depo arızası bütün uygulamayı 500'e çevirirdi. Düşülen yer güvenli
   * yön: kullanıcı seçtiği ağaç yerine KENDİ ana ağacını görüyor — bir
   * DARALTMA, hiçbir zaman erişemeyeceği bir ağacı açmıyor.
   */
  const ctx = kodu(read("../lib/tree-context.ts"));
  const i = ctx.indexOf("accessibleTreeIds(accountId)");
  check(i > -1, "ağaç bağlamı kaydı okuyor");
  const cevre = ctx.slice(Math.max(0, i - 200), i + 300);
  check(/try \{/.test(cevre) && /\} catch/.test(cevre), "okuma sarmalanmış (API 500'e düşmüyor)");
  check(/let owned: string\[\] = \[\];/.test(cevre), "arızada boş yetki — ana ağaca düşülüyor");
  check(!/return \{ ok: false/.test(cevre), "arıza kullanıcıyı dışarı atmıyor");

  /*
   * Temizlik koşusu: tek hesabın arızası SONRAKİ hesapları engellememeli,
   * ama fırlatan hesap da silinmemiş kalmalı (damgası duruyor, yarın yine
   * denenecek). Silmemek, yarım silmekten iyi.
   */
  const lc = kodu(read("../lib/account-lifecycle.ts"));
  const j = lc.indexOf("const r = await purgeAccount(u);");
  check(j > -1, "hesap temizliği bulundu");
  const blok = lc.slice(Math.max(0, j - 300), j + 400);
  check(/try \{/.test(blok) && /\} catch/.test(blok), "hesap temizliği sarmalanmış");
  check(/ozet\.failed\.push\(`hesap:/.test(blok), "başarısızlık özete yazılıyor");
  /* Sayaç yalnız BAŞARIDA artıyor: fırlayan hesap "silindi" sayılmamalı. */
  const iSayac = blok.indexOf("ozet.purgedAccounts++");
  const iCatch = blok.indexOf("} catch");
  check(iSayac > -1 && iSayac < iCatch, "sayaç yalnız başarılı dalda");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
