import {
  forPerson, isValidDate, normalizeObituary, publicObituaries, sortObituaries,
  MAX_FIELD, MAX_MESSAGE,
} from "../lib/obituaries.ts";
import type { Obituary } from "../types/obituary.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) {
  if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); }
}
function eq<T>(got: T, want: T, msg: string) {
  if (JSON.stringify(got) === JSON.stringify(want)) ok++;
  else { fail++; console.log(`✗ ${msg}: bekl ${JSON.stringify(want)}, geldi ${JSON.stringify(got)}`); }
}

const O = (extra: Partial<Obituary> = {}): Obituary => ({
  id: "o1", personId: "p1", personName: "Ali Yılmaz",
  createdAt: "2026-01-01", updatedAt: "2026-01-01", ...extra,
});

/* --- Tarih doğrulama (boş GEÇERLİ) -------------------------------------- */
check(isValidDate(undefined), "tarih zorunlu değil");
check(isValidDate(""), "boş tarih geçerli");
check(isValidDate("2026-02-28"), "geçerli tarih");
check(isValidDate("2028-02-29"), "artık yıl 29 Şubat");
check(!isValidDate("2027-02-29"), "artık olmayan yılda 29 Şubat geçersiz");
check(!isValidDate("2026-02-31"), "31 Şubat geçersiz");
check(!isValidDate("2026-13-01"), "13. ay geçersiz");
check(!isValidDate("2026-1-1"), "sıfırsız biçim geçersiz");

/* --- Yayım VARSAYILAN KAPALI -------------------------------------------- */
{
  /*
   * Buradaki kural kültürel olarak kritik: ölüm haberi, aile paylaşmayı
   * SEÇMEDİKÇE dışarı çıkmamalı. Belirsiz her durum kapalı sayılır.
   */
  const list = [
    O({ id: "a", publicShare: true }),
    O({ id: "b", publicShare: false }),
    O({ id: "c" }), // alan hiç yok
  ];
  eq(publicObituaries(list).map((o) => o.id), ["a"], "yalnız açıkça açık olan dışarı çıkar");

  // Doğruluk-benzeri değerler yayımlamaz.
  for (const v of [1, "true", "evet", "on", {}, []] as unknown[]) {
    const o = O({ publicShare: v as boolean });
    eq(publicObituaries([o]).length, 0, `doğruluk-benzeri değer yayımlamaz: ${JSON.stringify(v)}`);
  }
}

/* --- normalize: publicShare katı ---------------------------------------- */
{
  const now = "2026-09-02T00:00:00.000Z";
  eq(normalizeObituary({ personId: "p1", publicShare: "true" as unknown as boolean }, now)!.publicShare,
    false, "\"true\" dizesi yayımlamaz");
  eq(normalizeObituary({ personId: "p1", publicShare: true }, now)!.publicShare, true, "gerçek true yayımlar");
  eq(normalizeObituary({ personId: "p1" }, now)!.publicShare, false, "varsayılan kapalı");

  // Var olanı güncellerken alan verilmezse ÖNCEKİ durum korunur.
  const acik = O({ publicShare: true });
  eq(normalizeObituary({ personId: "p1", message: "yeni" }, now, acik)!.publicShare, true,
    "verilmezse önceki yayım durumu korunur");
  eq(normalizeObituary({ personId: "p1", publicShare: false }, now, acik)!.publicShare, false,
    "açıkça kapatılabilir");
}

/* --- normalize: doğrulama ------------------------------------------------ */
{
  const now = "2026-09-02T00:00:00.000Z";
  eq(normalizeObituary({ personId: "" }, now), null, "kişisiz duyuru reddedilir");
  eq(normalizeObituary({ personId: "p1", diedOn: "2026-02-31" }, now), null, "geçersiz vefat tarihi reddedilir");
  eq(normalizeObituary({ personId: "p1", serviceOn: "2026-13-01" }, now), null, "geçersiz tören tarihi reddedilir");

  const o = normalizeObituary(
    { personId: "p1", personName: "  Ali Yılmaz  ", diedOn: "2026-03-10", serviceAt: " Merkez Camii " },
    now
  )!;
  eq(o.personName, "Ali Yılmaz", "ad kırpılır");
  eq(o.serviceAt, "Merkez Camii", "alan kırpılır");
  eq(o.createdAt, now, "createdAt konur");

  // Güncelleme: verilmeyen korunur, createdAt sabit.
  const eski = O({ id: "x", serviceAt: "Eski Cami", message: "eski", createdAt: "2020-01-01" });
  const yeni = normalizeObituary({ personId: "p1", message: "yeni" }, now, eski)!;
  eq(yeni.id, "x", "kimlik korunur");
  eq(yeni.serviceAt, "Eski Cami", "verilmeyen alan korunur");
  eq(yeni.message, "yeni", "verilen alan değişir");
  eq(yeni.createdAt, "2020-01-01", "createdAt değişmez");

  // Boş dize alanı TEMİZLER.
  eq(normalizeObituary({ personId: "p1", serviceAt: "" }, now, eski)!.serviceAt, undefined,
    "boş dize alanı temizler");
  // Tarihler de boş dize ile temizlenebilir.
  const tarihli = O({ diedOn: "2020-01-01" });
  eq(normalizeObituary({ personId: "p1", diedOn: "" }, now, tarihli)!.diedOn, undefined,
    "boş dize tarihi temizler");

  // Uzunluk sınırları.
  eq(normalizeObituary({ personId: "p1", message: "m".repeat(MAX_MESSAGE + 100) }, now)!.message!.length,
    MAX_MESSAGE, "mesaj kırpılır");
  eq(normalizeObituary({ personId: "p1", serviceAt: "s".repeat(MAX_FIELD + 100) }, now)!.serviceAt!.length,
    MAX_FIELD, "alan kırpılır");
}

/* --- Hiçbir alan TÜRETİLMEZ --------------------------------------------- */
{
  /*
   * Uydurulmuş bir "cenaze saati" gerçek bir aileyi yanlış yere gönderirdi.
   * Yalnız vefat tarihi verilmiş bir duyuruda tören/defin/taziye alanları
   * BOŞ kalmalı — tahmin edilmemeli.
   */
  const now = "2026-09-02T00:00:00.000Z";
  const o = normalizeObituary({ personId: "p1", diedOn: "2026-03-10" }, now)!;
  eq(o.serviceAt, undefined, "tören yeri türetilmez");
  eq(o.serviceOn, undefined, "tören tarihi türetilmez");
  eq(o.burialAt, undefined, "defin yeri türetilmez");
  eq(o.condolenceAt, undefined, "taziye yeri türetilmez");
  eq(o.message, undefined, "metin türetilmez — dinî kalıp dayatılmaz");
}

/* --- Sıralama ------------------------------------------------------------ */
{
  const s = sortObituaries([
    O({ id: "eski", diedOn: "2020-01-01" }),
    O({ id: "tarihsiz" }),
    O({ id: "yeni", diedOn: "2026-05-01" }),
    O({ id: "orta", diedOn: "2023-01-01" }),
  ]);
  eq(s.map((o) => o.id), ["yeni", "orta", "eski", "tarihsiz"], "en yeni başta, tarihsizler sonda");
}

/* --- forPerson ----------------------------------------------------------- */
{
  const list = [O({ id: "a", personId: "p1" }), O({ id: "b", personId: "p2" })];
  eq(forPerson(list, "p2")?.id, "b", "kişinin duyurusu bulunur");
  eq(forPerson(list, "yok"), undefined, "olmayan kişi → undefined");
}

/* --- Kişi silinse de duyuru kimin olduğunu unutmaz ---------------------- */
{
  // `personId` sarkabilir; `personName` bu yüzden ayrı saklanır.
  const o = O({ personId: "silinmis", personName: "Ali Yılmaz" });
  eq(o.personName, "Ali Yılmaz", "ad duyuruda saklı kalır");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
