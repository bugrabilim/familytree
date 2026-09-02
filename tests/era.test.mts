import {
  ERAS, eraKey, eraById, erasInRange, erasAt, erasForLife, type EraKind,
} from "../lib/era.ts";
import { tr, en } from "../lib/i18n-dict.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) {
  if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); }
}
function eq<T>(got: T, want: T, msg: string) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) ok++; else { fail++; console.log(`✗ ${msg}: bekl ${w}, geldi ${g}`); }
}
const TODAY = new Date("2026-01-01T00:00:00Z");
const ids = (list: { era: { id: string } }[]) => list.map((l) => l.era.id);

/* --- Veri bütünlüğü ------------------------------------------------------ */

eq(new Set(ERAS.map((e) => e.id)).size, ERAS.length, "olay kimlikleri benzersiz");
check(ERAS.every((e) => e.from <= e.to), "her olayda from <= to");
check(ERAS.every((e) => e.from >= 1800 && e.to <= 2100), "yıllar makul aralıkta");
// Kronolojik sıralı tutuluyor — okunurluk ve arayüz sırası buna dayanacak
check(ERAS.every((e, i) => i === 0 || ERAS[i - 1].from <= e.from), "liste kronolojik");

// i18n kayması olmasın
let miss = 0;
for (const e of ERAS) {
  if (!(eraKey(e.id) in tr)) { miss++; console.log(`  ✗ TR eksik: ${eraKey(e.id)}`); }
  if (!(eraKey(e.id) in en)) { miss++; console.log(`  ✗ EN eksik: ${eraKey(e.id)}`); }
}
eq(miss, 0, "tüm olayların TR ve EN adı var");

const kinds: EraKind[] = ["savas", "goc", "afet", "salgin", "hukuk", "ekonomi"];
let kindMiss = 0;
for (const k of kinds) {
  if (!(`eraKind.${k}` in tr) || !(`eraKind.${k}` in en)) kindMiss++;
}
eq(kindMiss, 0, "tüm tür adlarının TR ve EN karşılığı var");
check(kinds.every((k) => ERAS.some((e) => e.kind === k)), "her tür en az bir olayla temsil ediliyor");

eq(eraById("soyadiKanunu")?.from, 1934, "Soyadı Kanunu 1934");
eq(eraById("yok"), undefined, "olmayan kimlik → undefined");
eq(eraKey("mubadele"), "era.mubadele", "i18n anahtarı");

/* --- Aralık sorgusu ------------------------------------------------------ */

eq(erasAt(1934).map((e) => e.id), ["soyadiKanunu"], "1934'te yalnız Soyadı Kanunu");
check(erasAt(1915).some((e) => e.id === "seferberlik"), "1915 seferberlik içinde");
check(erasAt(1919).some((e) => e.id === "ispanyolGribi")
   && erasAt(1919).some((e) => e.id === "kurtulusSavasi"), "1919'da iki olay üst üste");
eq(erasAt(1800), [], "olay olmayan yıl boş");

// Sınırlar dâhil
check(erasAt(1914).some((e) => e.id === "seferberlik"), "başlangıç yılı dâhil");
check(erasAt(1918).some((e) => e.id === "seferberlik"), "bitiş yılı dâhil");
check(!erasAt(1913).some((e) => e.id === "seferberlik"), "başlangıçtan önce yok");
check(!erasAt(1919).some((e) => e.id === "seferberlik"), "bitişten sonra yok");

// Ters verilen aralık düzeltilir
eq(erasInRange(1940, 1930).length, erasInRange(1930, 1940).length, "ters aralık düzeltilir");

/* --- ASIL İŞ: ömre oturtma ---------------------------------------------- */

// 1930 doğumlu, 2010'da vefat: seferberliği görmedi, 1939 depremini 9 yaşında gördü
const life = erasForLife("1930", "2010", { today: TODAY });
check(!ids(life).includes("seferberlik"), "doğumdan önce biten olay listelenmez");
const erz = life.find((l) => l.era.id === "erzincan1939")!;
eq(erz.ageAtStart, 9, "1939 depreminde 9 yaşında");
eq(erz.bornDuring, false, "olaydan önce doğmuş");
eq(erz.partial, false, "tek yıllık olayı tamamen görmüş");
check(!ids(life).includes("kahramanmaras2023"), "ölümden sonraki olay listelenmez");

// Olay sürerken doğan: yaş uydurulmaz
const wartime = erasForLife("1916", "1990", { today: TODAY });
const sf = wartime.find((l) => l.era.id === "seferberlik")!;
eq(sf.ageAtStart, null, "olay sürerken doğduysa yaş null");
eq(sf.bornDuring, true, "bornDuring işaretli");
eq(sf.partial, true, "kısmen yaşanmış");

// Olay bitmeden ölen
const early = erasForLife("1910", "1916", { today: TODAY });
const sf2 = early.find((l) => l.era.id === "seferberlik")!;
eq(sf2.ageAtStart, 4, "olay başladığında 4 yaşında");
eq(sf2.partial, true, "olay bitmeden öldüğü için kısmi");
eq(sf2.bornDuring, false, "olaydan önce doğmuş");

// Yaşayan kişi: ömür bugüne uzar
const living = erasForLife("1990", undefined, { today: TODAY });
check(ids(living).includes("kahramanmaras2023"), "yaşayanda güncel olaylar da var");
eq(living.find((l) => l.era.id === "marmara1999")?.ageAtStart, 9, "1999'da 9 yaşında");

/* --- Kısmi ve eksik tarihler -------------------------------------------- */

eq(erasForLife(undefined, "2000", { today: TODAY }), [],
  "doğum yılı yoksa boş — yaş hesaplanmadan 'yaşadı' denmez");
eq(erasForLife("", "2000", { today: TODAY }), [], "boş doğum tarihi → boş");
eq(erasForLife("abc", undefined, { today: TODAY }), [], "geçersiz tarih → boş");
eq(erasForLife("2010", "1990", { today: TODAY }), [], "ölüm doğumdan önceyse boş");

// Kısmi tarihler (YYYY-MM, YYYY-MM-DD) yıl olarak okunur
eq(
  ids(erasForLife("1930-05-12", "2010-01-01", { today: TODAY })),
  ids(erasForLife("1930", "2010", { today: TODAY })),
  "tam tarih ile yıl aynı sonucu verir"
);

/* --- Tür filtresi -------------------------------------------------------- */

const onlyQuakes = erasForLife("1930", "2010", { today: TODAY, kinds: ["afet"] });
check(onlyQuakes.length > 0 && onlyQuakes.every((l) => l.era.kind === "afet"), "tür filtresi");
check(onlyQuakes.length < life.length, "filtre gerçekten daraltıyor");
// Boş dizi "hiçbiri" demek, "filtre yok" değil — arayüzde tüm kutuları
// kaldıran kullanıcı her şeyi değil hiçbir şeyi görmeli.
eq(erasForLife("1930", "2010", { today: TODAY, kinds: [] }).length, 0,
  "boş tür listesi hiçbir şey döndürür");
eq(erasForLife("1930", "2010", { today: TODAY }).length, life.length,
  "kinds hiç verilmezse filtre yok");

/* --- Sonuç kronolojik olmalı --------------------------------------------- */

check(life.every((l, i) => i === 0 || life[i - 1].era.from <= l.era.from),
  "ömür listesi kronolojik");

/* --- Uzun ömür ----------------------------------------------------------- */

const long = erasForLife("1900", "2000", { today: TODAY });
check(long.length > 15, `bir asırlık ömürde çok olay (${long.length})`);
check(long.every((l) => l.ageAtStart === null || l.ageAtStart >= 0), "yaş asla negatif değil");

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
