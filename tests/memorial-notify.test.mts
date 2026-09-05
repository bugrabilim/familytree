import { todaysMemorialNotices, memorialNoticesToText } from "../lib/memorial-notify.ts";
import { hijriAnniversariesInGregorianYear, hijriYearsBetween } from "../lib/hijri.ts";
import type { Person } from "../types/family.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) {
  if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); }
}
function eq<T>(got: T, want: T, msg: string) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) ok++; else { fail++; console.log(`✗ ${msg}: bekl ${w}, geldi ${g}`); }
}

const P = (id: string, extra: Partial<Person> = {}): Person => ({
  id, firstName: id, lastName: "X", gender: "unknown",
  parentIds: [], spouseIds: [], ...extra,
} as Person);

/* --- gece eşleşmesi: sınır günleri dâhil -------------------------------- */

// Ölüm 2020-01-01 → 7. gece 2020-01-08, 40. gece 2020-02-10
const olen = P("a", { firstName: "Ayşe", deathDate: "2020-01-01" });
const gece7Gunu = new Date(2020, 0, 8); // yerel: 8 Ocak 2020
let notices = todaysMemorialNotices([olen], gece7Gunu, { enabled: ["gece7"] });
eq(notices.length, 1, "7. gece tam günde tek bildirim");
check(notices[0]?.kind === "gece7" && notices[0]?.name.includes("Ayşe"), "7. gece doğru kişi/tür");

const gece40Gunu = new Date(2020, 1, 10); // 10 Şubat 2020
notices = todaysMemorialNotices([olen], gece40Gunu, { enabled: ["gece40"] });
eq(notices.map((n) => n.kind), ["gece40"], "40. gece tam günde eşleşiyor");

const gece52Gunu = new Date(2020, 1, 22); // 22 Şubat 2020
notices = todaysMemorialNotices([olen], gece52Gunu, { enabled: ["gece52"] });
eq(notices.map((n) => n.kind), ["gece52"], "52. gece tam günde eşleşiyor");

const gece3Gunu = new Date(2020, 0, 4); // 4 Ocak 2020 (varsayılanda kapalı → açıkça istenmeli)
notices = todaysMemorialNotices([olen], gece3Gunu, { enabled: ["gece3"] });
eq(notices.map((n) => n.kind), ["gece3"], "3. gece açıkça istenince eşleşiyor");

// Bir gün önce/sonra hiçbir şey yok — sınırın dışı boş kalmalı
check(todaysMemorialNotices([olen], new Date(2020, 0, 7), { enabled: ["gece7"] }).length === 0,
  "7. geceden bir gün önce boş");
check(todaysMemorialNotices([olen], new Date(2020, 0, 9), { enabled: ["gece7"] }).length === 0,
  "7. geceden bir gün sonra boş");

/* --- sene-i devriye ------------------------------------------------------ */

const olen2 = P("b", { firstName: "Veli", deathDate: "2018-06-15" });
const devriyeGunu = new Date(2022, 5, 15); // 15 Haziran 2022 → 4. yıl
notices = todaysMemorialNotices([olen2], devriyeGunu, { enabled: ["seneiDevriye"] });
eq(notices.length, 1, "sene-i devriye tek bildirim");
eq(notices[0]?.year, 4, "kaçıncı yıl doğru");

// Ölüm yılının kendisi yıl dönümü sayılmaz
check(todaysMemorialNotices([olen2], new Date(2018, 5, 15), { enabled: ["seneiDevriye"] }).length === 0,
  "ölüm yılının kendisi yıl dönümü değil");

/* --- 29 Şubat tuzağı: yıl dönümü artık olmayan yılda 28'e kırpılır ------- */

const subatOlen = P("c", { firstName: "Leyla", deathDate: "2016-02-29" }); // artık yıl
// 2021 artık değil → 28 Şubat'a kırpılmalı
const subat28 = new Date(2021, 1, 28);
notices = todaysMemorialNotices([subatOlen], subat28, { enabled: ["seneiDevriye"] });
eq(notices.length, 1, "29 Şubat ölümü, artık olmayan yılda 28 Şubat'a kırpılıyor");
eq(notices[0]?.year, 5, "kırpılan yıl dönümünde yıl sayısı yine doğru");
// 1 Mart'ta İKİNCİ kez üretilmemeli (kırpma çift saymasın)
check(todaysMemorialNotices([subatOlen], new Date(2021, 2, 1), { enabled: ["seneiDevriye"] }).length === 0,
  "kırpılan yıl dönümü 1 Mart'ta tekrar üretilmiyor");
// Artık yılda (2024) kendi gününde, kırpma OLMADAN eşleşmeli
notices = todaysMemorialNotices([subatOlen], new Date(2024, 1, 29), { enabled: ["seneiDevriye"] });
eq(notices.length, 1, "artık yılda 29 Şubat'ın kendisinde eşleşiyor (kırpma gereksiz)");

/* --- Hicri sene-i devriye (madde 9'un enjeksiyon kalıbı) ----------------- */

const hicriOlen = P("h", { firstName: "Hicri", deathDate: "2020-01-01" });
// O yılın Hicri devriyelerinden birini "bugün" seçip enjekte edilen fonksiyonlarla doğrula
const hicriTarihler = hijriAnniversariesInGregorianYear("2020-01-01", 2022);
if (hicriTarihler.length > 0) {
  const [y, m, d] = hicriTarihler[0].split("-").map(Number);
  const bugun = new Date(y, m - 1, d);
  notices = todaysMemorialNotices([hicriOlen], bugun, {
    enabled: ["seneiDevriyeHicri"],
    hijriAnniversaries: hijriAnniversariesInGregorianYear,
    hijriYearsBetween,
  });
  eq(notices.map((n) => n.kind), ["seneiDevriyeHicri"], "Hicri sene-i devriye enjeksiyonla üretiliyor");
  check(typeof notices[0]?.year === "number", "Hicri devriyede yıl sayısı hesaplanabiliyorsa dolduruluyor");
} else {
  console.log("  (bilgi: 2022 için Hicri devriye üretilmedi, bu adım atlandı)");
}

/* --- Ölüm tarihi yok / eksik → hiçbir şey üretilmiyor -------------------- */

check(todaysMemorialNotices([P("d", { firstName: "Yaşayan" })], gece7Gunu, { enabled: ["gece7"] }).length === 0,
  "ölüm tarihi olmayan kişi için bildirim yok");
check(todaysMemorialNotices([P("e", { firstName: "Eksik", deathDate: "2020-01" as unknown as string })], gece7Gunu, { enabled: ["gece7"] }).length === 0,
  "eksik (yıl-ay) ölüm tarihi için bildirim yok");
check(todaysMemorialNotices([P("f", { firstName: "Eksik2", deathDate: "2020" as unknown as string })], gece7Gunu, { enabled: ["gece7"] }).length === 0,
  "eksik (yalnız yıl) ölüm tarihi için bildirim yok");

/* --- Gizlilik: confidential MUTLAK dışlanır ------------------------------ */

const gizli = P("g", { firstName: "Gizli", deathDate: "2020-01-01", confidential: true });
notices = todaysMemorialNotices([olen, gizli], gece7Gunu, { enabled: ["gece7"] });
eq(notices.map((n) => n.personId), ["a"], "confidential kayıt anma bildiriminden tümüyle dışlanıyor");
check(!notices.some((n) => n.name.includes("Gizli")), "gizli kişinin adı hiçbir bildirimde yok");

/* --- Gizlilik: privateFields boru hattından geçer, ilgisiz alanı bozmaz -- */

const ozelAlanli = P("i", {
  firstName: "Fatma",
  deathDate: "2020-01-01",
  privateFields: ["health", "birthPlace"], // ad/deathDate'i kapsamayan gruplar
});
notices = todaysMemorialNotices([ozelAlanli], gece7Gunu, { enabled: ["gece7"] });
eq(notices.length, 1, "ilgisiz privateFields grubu bildirimi engellemiyor");
check(notices[0]?.name.includes("Fatma"), "ad, ilgisiz gizlilik grubundan etkilenmiyor");

/* --- TR ve EN metin üretimi ---------------------------------------------- */

notices = todaysMemorialNotices([olen, olen2], gece7Gunu, { enabled: ["gece7"] });
const trTxt = memorialNoticesToText(notices, "tr");
const enTxt = memorialNoticesToText(notices, "en");
check(trTxt.includes("🕯️") && trTxt.includes("yedinci gece"), "TR metin: 7. gece ifadesi");
check(enTxt.includes("🕯️") && enTxt.includes("7th night"), "EN metin: 7. gece ifadesi");

const devriyeNotices = todaysMemorialNotices([olen2], devriyeGunu, { enabled: ["seneiDevriye"] });
const trDevriye = memorialNoticesToText(devriyeNotices, "tr");
const enDevriye = memorialNoticesToText(devriyeNotices, "en");
check(trDevriye.includes("vefatının 4. yılı"), "TR metin: sene-i devriye yıl sayısı");
check(enDevriye.includes("4 year(s) since passing"), "EN metin: sene-i devriye yıl sayısı");

// Varsayılan dil TR
check(memorialNoticesToText(devriyeNotices) === trDevriye, "varsayılan dil TR");

// Boş listede boş metin
eq(memorialNoticesToText([]), "", "boş bildirim listesi → boş metin");

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
