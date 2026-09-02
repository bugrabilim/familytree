import {
  daysUntilOpen, isUnlocked, isValidOpensOn, normalizeLetter,
  publicView, publicViewAll, sortLetters, today, MAX_BODY, MAX_TITLE,
} from "../lib/letters.ts";
import type { Letter } from "../types/letter.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) {
  if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); }
}
function eq<T>(got: T, want: T, msg: string) {
  if (JSON.stringify(got) === JSON.stringify(want)) ok++;
  else { fail++; console.log(`✗ ${msg}: bekl ${JSON.stringify(want)}, geldi ${JSON.stringify(got)}`); }
}

const L = (extra: Partial<Letter> = {}): Letter => ({
  id: "l1", title: "Mektup", opensOn: "2030-01-01",
  body: "GİZLİ METİN", createdAt: "2026-01-01", updatedAt: "2026-01-01", ...extra,
});
const at = (iso: string) => new Date(iso);

/* --- Tarih doğrulama ----------------------------------------------------- */
check(isValidOpensOn("2030-01-01"), "geçerli tarih");
check(isValidOpensOn("2028-02-29"), "artık yıl 29 Şubat geçerli");
check(!isValidOpensOn("2027-02-29"), "artık olmayan yılda 29 Şubat geçersiz");
check(!isValidOpensOn("2030-02-31"), "31 Şubat geçersiz");
check(!isValidOpensOn("2030-13-01"), "13. ay geçersiz");
check(!isValidOpensOn("2030-00-10"), "0. ay geçersiz");
check(!isValidOpensOn("2030-01-00"), "0. gün geçersiz");
check(!isValidOpensOn("2030-1-1"), "sıfırsız biçim geçersiz");
check(!isValidOpensOn("2030"), "yalnız yıl geçersiz");
check(!isValidOpensOn(""), "boş geçersiz");

/* --- Kilit: açılma günü DÂHİL ------------------------------------------- */
{
  const l = L({ opensOn: "2027-03-10" });
  check(!isUnlocked(l, at("2027-03-09T23:59:59Z")), "bir gün önce KİLİTLİ");
  check(isUnlocked(l, at("2027-03-10T00:00:00Z")), "açılma günü açık (gün dâhil)");
  check(isUnlocked(l, at("2027-03-11T00:00:00Z")), "sonraki gün açık");
}

/* --- Bozuk tarih KİLİTLİ sayılır ---------------------------------------- */
{
  // Bozuk veride "açık" tarafa düşmek, tam da gizli kalması gerekeni sızdırırdı.
  for (const bad of ["", "yarın", "2030-02-31", "0000-00-00"]) {
    check(!isUnlocked({ opensOn: bad }, at("2099-01-01T00:00:00Z")), `bozuk tarih kilitli: "${bad}"`);
    eq(publicView(L({ opensOn: bad }), at("2099-01-01T00:00:00Z")).body, undefined,
      `bozuk tarihte metin verilmez: "${bad}"`);
  }
}

/* --- publicView: metin SİLİNİR, boşaltılmaz ----------------------------- */
{
  const kilitli = publicView(L({ opensOn: "2030-01-01" }), at("2026-09-02T12:00:00Z"));
  check(!("body" in kilitli), "kilitliyken `body` ALANI HİÇ YOK (boş dize değil)");
  eq(kilitli.title, "Mektup", "başlık kilitliyken de görünür");
  eq(kilitli.opensOn, "2030-01-01", "açılma tarihi kilitliyken de görünür");
  // Metin hiçbir alanda sızmamalı.
  check(!JSON.stringify(kilitli).includes("GİZLİ METİN"), "kilitli mektubun metni JSON'da hiç geçmiyor");

  const acik = publicView(L({ opensOn: "2020-01-01" }), at("2026-09-02T12:00:00Z"));
  eq(acik.body, "GİZLİ METİN", "açıldıktan sonra metin gelir");
}

/* --- Liste: karışık kutuda kilitliler metin sızdırmaz ------------------- */
{
  const now = at("2026-09-02T12:00:00Z");
  const list = publicViewAll([
    L({ id: "a", opensOn: "2020-01-01", body: "AÇIK BİR" }),
    L({ id: "b", opensOn: "2030-01-01", body: "KİLİTLİ BİR" }),
    L({ id: "c", opensOn: "2026-09-02", body: "TAM BUGÜN" }),
  ], now);
  eq(list.map((l) => l.body), ["AÇIK BİR", undefined, "TAM BUGÜN"], "yalnız kilitlinin metni yok");
  check(!JSON.stringify(list).includes("KİLİTLİ BİR"), "kilitli metin liste JSON'unda hiç geçmiyor");
}

/* --- Saat dilimi: sözlüksel karşılaştırma ------------------------------- */
{
  // `Date` ile karşılaştırma, sunucunun saat dilimine göre bir gün erken
  // açabilirdi. Dize karşılaştırması UTC gününe bağlıdır ve kaymaz.
  const l = L({ opensOn: "2027-01-01" });
  check(!isUnlocked(l, at("2026-12-31T23:59:59Z")), "UTC yıl dönümünden bir saniye önce kilitli");
  check(isUnlocked(l, at("2027-01-01T00:00:00Z")), "UTC gün başında açık");
}

/* --- today() ------------------------------------------------------------- */
eq(today(at("2026-09-02T23:30:00Z")), "2026-09-02", "today UTC gününü verir");
eq(today(at("0005-03-07T00:00:00Z")), "0005-03-07", "yıl dört haneye tamamlanır");

/* --- daysUntilOpen ------------------------------------------------------- */
{
  const now = at("2026-09-02T18:00:00Z");
  eq(daysUntilOpen({ opensOn: "2026-09-03" }, now), 1, "yarın → 1");
  eq(daysUntilOpen({ opensOn: "2026-09-02" }, now), 0, "bugün → 0 (açık)");
  eq(daysUntilOpen({ opensOn: "2020-01-01" }, now), 0, "geçmiş → 0");
  eq(daysUntilOpen({ opensOn: "2026-10-02" }, now), 30, "30 gün sonra");
  eq(daysUntilOpen({ opensOn: "bozuk" }, now), null, "bozuk tarih → null");
}

/* --- Sıralama ------------------------------------------------------------ */
{
  const now = at("2026-09-02T12:00:00Z");
  const s = sortLetters([
    L({ id: "kilit-uzak", opensOn: "2040-01-01" }),
    L({ id: "acik-eski", opensOn: "2010-01-01" }),
    L({ id: "kilit-yakin", opensOn: "2027-01-01" }),
    L({ id: "acik-yeni", opensOn: "2026-01-01" }),
  ], now);
  eq(s.map((l) => l.id), ["acik-yeni", "acik-eski", "kilit-yakin", "kilit-uzak"],
    "açıklar önce (yeniden eskiye), sonra kilitliler (yakından uzağa)");
}

/* --- normalizeLetter ----------------------------------------------------- */
{
  const now = "2026-09-02T00:00:00.000Z";
  eq(normalizeLetter({ title: "", opensOn: "2030-01-01" }, now), null, "başlıksız reddedilir");
  eq(normalizeLetter({ title: "X", opensOn: "" }, now), null, "tarihsiz reddedilir");
  eq(normalizeLetter({ title: "X", opensOn: "2030-02-31" }, now), null, "geçersiz tarih reddedilir");

  const l = normalizeLetter({ title: "  Torunuma  ", opensOn: "2044-06-01", body: "metin" }, now)!;
  eq(l.title, "Torunuma", "başlık kırpılır");
  eq(l.createdAt, now, "createdAt konur");

  const eski = L({ id: "x", title: "Eski", body: "eski metin", createdAt: "2020-01-01", fromName: "Dede" });
  const yeni = normalizeLetter({ title: "Yeni" }, now, eski)!;
  eq(yeni.id, "x", "kimlik korunur");
  eq(yeni.body, "eski metin", "verilmeyen metin korunur");
  eq(yeni.fromName, "Dede", "verilmeyen alan korunur");
  eq(yeni.createdAt, "2020-01-01", "createdAt değişmez");
  eq(yeni.updatedAt, now, "updatedAt tazelenir");

  eq(normalizeLetter({ title: "a".repeat(MAX_TITLE + 50), opensOn: "2030-01-01" }, now)!.title.length,
    MAX_TITLE, "başlık kırpılır");
  eq(normalizeLetter({ title: "X", opensOn: "2030-01-01", body: "b".repeat(MAX_BODY + 100) }, now)!.body!.length,
    MAX_BODY, "metin kırpılır");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
