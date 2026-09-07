import { dayIndex, makeBudget, rotateForDay } from "../lib/cron-budget.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

/**
 * DÖNDÜRME ve BÜTÇE — zamanlanmış işin açlığa düşmemesi (madde E6).
 *
 * Buradaki iddiaların hepsi tek bir cümlenin parçaları: "iş yetişmezse
 * yetişmeyen her gün DEĞİŞİR ve bu görünür olur."
 */

/* ── Gün numarası ─────────────────────────────────────────────────────────── */
{
  const a = new Date("2026-09-07T00:00:00Z");
  const b = new Date("2026-09-07T23:59:59Z");
  const c = new Date("2026-09-08T00:00:00Z");
  check(dayIndex(a) === dayIndex(b), "aynı gün içinde numara DEĞİŞMİYOR");
  check(dayIndex(c) === dayIndex(a) + 1, "ertesi gün numara bir artıyor");
  /*
   * Gün içinde sabit olması şart: cron gecikirse ya da iş elle bir kez daha
   * tetiklenirse aynı sıra kullanılmalı. Sabit olmasaydı, aynı gün iki koşu
   * farklı yerlerden başlar ve bazı hesaplar iki kez, bazıları hiç işlenirdi.
   */
}

/* ── Döndürme HİÇBİR ŞEY KAYBETMİYOR ─────────────────────────────────────── */
{
  const liste = ["a", "b", "c", "d", "e"];
  /*
   * En tehlikeli gerileme, döndürmenin bir öğeyi düşürmesi olurdu: o hesap
   * hatırlatmayı hiç almaz ve hiçbir yerde iz kalmaz. Bu yüzden her gün için
   * uzunluk ve KÜME denetleniyor, yalnız sıra değil.
   */
  let hepsiTam = true;
  for (let g = 0; g < 40; g++) {
    const d = new Date((g + 20_000) * 86_400_000);
    const r = rotateForDay(liste, d);
    if (r.length !== liste.length) hepsiTam = false;
    if ([...r].sort().join(",") !== [...liste].sort().join(",")) hepsiTam = false;
  }
  check(hepsiTam, "döndürme uzunluğu ve kümeyi KORUYOR (kimse düşmüyor)");

  /* Sıra korunuyor, yalnız başlangıç kayıyor. */
  const gun0 = new Date(20_000 * 86_400_000);
  const gun1 = new Date(20_001 * 86_400_000);
  check(rotateForDay(liste, gun0).join("") !== rotateForDay(liste, gun1).join(""),
    "ardışık iki gün FARKLI yerden başlıyor");
  check(rotateForDay(liste, gun0).join("") === rotateForDay(liste, gun0).join(""),
    "aynı gün aynı sıra (idempotent)");

  /*
   * SONA KALAN HER GÜN DEĞİŞİYOR — açlığın kalıcı olmamasını sağlayan tam
   * olarak bu. Beş günde beş farklı öğe sona kalmalı.
   */
  const sonlar = new Set<string>();
  for (let g = 0; g < liste.length; g++) {
    sonlar.add(rotateForDay(liste, new Date((20_000 + g) * 86_400_000)).at(-1)!);
  }
  check(sonlar.size === liste.length, "liste uzunluğu kadar günde HERKES bir kez sona kalıyor");
}

/* ── Sınır durumları ──────────────────────────────────────────────────────── */
{
  check(rotateForDay([], new Date()).length === 0, "boş liste boş dönüyor");
  check(rotateForDay(["tek"], new Date()).join("") === "tek", "tek öğeli liste bozulmuyor");
  /* 1970 öncesi: `%` negatif döner, dilim negatif indisle listeyi bozardı. */
  const eski = new Date("1960-05-05T00:00:00Z");
  const r = rotateForDay(["a", "b", "c"], eski);
  check(r.length === 3 && [...r].sort().join("") === "abc", "negatif gün numarasında da liste tam");
}
{
  const kaynak = ["a", "b", "c"];
  const kopya = rotateForDay(kaynak, new Date());
  kopya.push("x");
  check(kaynak.length === 3, "girdi listesi DEĞİŞTİRİLMİYOR");
}

/* ── Bütçe ────────────────────────────────────────────────────────────────── */
{
  let saat = 1_000;
  const b = makeBudget(500, () => saat);
  check(!b.spent(), "başlangıçta bütçe dolu değil");
  saat = 1_499;
  check(!b.spent(), "sınırın altında dolmuş sayılmıyor");
  check(b.elapsed() === 499, "geçen süre ölçülüyor");
  saat = 1_500;
  check(b.spent(), "tam sınırda dolmuş sayılıyor");
  saat = 9_999;
  check(b.spent(), "sınırın üstünde dolu kalıyor");
}
{
  /* Sıfır bütçe: hiçbir iş yapılmamalı — "sonsuz" yorumlanmamalı. */
  const saat = 0;
  const b = makeBudget(0, () => saat);
  check(b.spent(), "sıfır bütçe HEMEN dolu");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
