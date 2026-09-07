import { checkMirror, mirrorSummary, type MirrorInput } from "../lib/mirror-check.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

/**
 * AYNA DENETİMİ — Blob (kaynak) ile Postgres (ayna) hâlâ aynı mı?
 *
 * Bu denetimin verebileceği en kötü yanıt "temiz" — çünkü kimse bir daha
 * bakmaz. İddiaların çoğu bu yüzden yanlış "temiz"i kovalıyor.
 */

const temel: MirrorInput = {
  treeId: "t1", name: "Yılmaz", inDb: true, blobRead: true,
  blobPeople: 10, dbPeople: 10,
  blobStamp: "2026-09-06T10:00:00.000Z", dbStamp: "2026-09-06T10:00:00.000Z",
};
const st = (o: Partial<MirrorInput>) => checkMirror({ ...temel, ...o }).status;

/* ── Temiz hâl ────────────────────────────────────────────────────────────── */
check(st({}) === "esit", "sayılar ve damgalar tutuyorsa eşit");

/* ── Kaynak okunamadı ≠ ayna fazla ───────────────────────────────────────── */
/*
 * EN TEHLİKELİ KARIŞTIRMA. "Blob boş" ile "Blob okunamadı" aynı sayılırsa
 * denetim, aynayı 10 fazlalıkla dolu sanır ve insanı Postgres'i boşaltmaya
 * davet eder — bir Blob kesintisi, veri silme talimatına dönüşür.
 * `lib/drift.ts` aynı tuzağı `blobMissing` ile ayırıyor.
 */
check(st({ blobRead: false, blobPeople: 0 }) !== "sayi-farkli",
  "okunamayan kaynak 'sayı farklı' DEĞİL");
check(st({ blobRead: false, blobPeople: 0 }) === "yok", "okunamayan kaynak ayrı bir durum");
check(st({ blobRead: false, blobPeople: 0 }) !== "esit", "okunamayan kaynak TEMİZ de değil");
{
  const v = checkMirror({ ...temel, blobRead: false, blobPeople: 0 });
  check(/okunamadı/.test(v.detail), "sebep açıklamada yazıyor");
}

/* ── Ağaç Postgres'te yok ────────────────────────────────────────────────── */
check(st({ inDb: false, dbPeople: 0 }) === "yok", "göç etmemiş/silinmiş satır bildiriliyor");
check(st({ inDb: false, dbPeople: 0 }) !== "esit", "satırı olmayan ağaç temiz sayılmıyor");

/* ── Sayı ayrışması ──────────────────────────────────────────────────────── */
check(st({ dbPeople: 9 }) === "sayi-farkli", "ayna eksikse yakalanıyor");
check(st({ dbPeople: 11 }) === "sayi-farkli", "ayna fazlaysa da yakalanıyor");
{
  const v = checkMirror({ ...temel, dbPeople: 9 });
  check(v.detail.includes("10") && v.detail.includes("9"), "iki sayı da açıklamada");
}

/* ── Damga ayrışması ─────────────────────────────────────────────────────── */
check(st({ dbStamp: "2026-09-06T09:00:00.000Z" }) === "geride", "eski ayna 'geride'");
/*
 * "İLERİDE" DE BİR ARIZA ve bu, gözden kaçması en kolay olanı. Yazma yolu
 * iki yere birden yazıyor; ayna ilerideyse bir yazma Postgres'e ulaşmış ama
 * Blob'a ulaşmamış demektir. Okuma yolu Postgres'i öne aldığı için bu fark
 * edilmez — ta ki Postgres'ten okunamayan bir gün gelene kadar.
 */
check(st({ dbStamp: "2026-09-06T11:00:00.000Z" }) === "ileride", "yeni ayna 'ileride'");
/*
 * Postgres `...+00:00`, JS `toISOString()` `...Z` döndürüyor ve `"+"` (0x2B)
 * `"Z"`den (0x5A) küçük — normalleştirilmeden karşılaştırılırsa AYNI an
 * "geride" görünür ve her koşuda yanlış alarm üretir.
 */
check(st({ dbStamp: "2026-09-06T10:00:00+00:00" }) === "esit",
  "aynı an, farklı yazım: yanlış alarm YOK");

/* ── Okunamayan damga yanlış alarm üretmiyor ─────────────────────────────── */
/*
 * `trees.updated_at` sonradan eklendi, eski satırlarda `null`. Boş dizge her
 * ISO damgadan küçüktür; normalleştirme sonrası boş olan taraf hesaba
 * katılmasaydı bu ağaçların HEPSİ her gün "geride" diye uyarı üretirdi ve
 * uyarı, gürültüye dönüştüğü anda uyarı olmaktan çıkar.
 */
check(st({ dbStamp: null }) === "esit", "aynada damga yoksa yanlış alarm yok");
check(st({ blobStamp: undefined }) === "esit", "kaynakta damga yoksa yanlış alarm yok");
check(st({ blobStamp: "olmayan-tarih", dbStamp: "de-öyle" }) === "esit",
  "ayrıştırılamayan damgalar karşılaştırmayı bozmuyor");
/* Ama damga eksikken SAYI ayrışması yine yakalanmalı — susturma yalnız damgada. */
check(st({ dbStamp: null, dbPeople: 3 }) === "sayi-farkli", "damga yokken sayı denetimi sürüyor");

/* ── Özet ─────────────────────────────────────────────────────────────────── */
{
  const v = [
    checkMirror(temel),
    checkMirror({ ...temel, treeId: "t2", name: "Demir", dbPeople: 4 }),
    checkMirror({ ...temel, treeId: "t3", name: "Kaya", inDb: false }),
  ];
  const o = mirrorSummary(v);
  check(o.checked === 3, "bakılan sayısı doğru");
  check(o.clean === 1, "temiz sayısı doğru");
  check(o.problems.length === 2, "sorunlular listeleniyor");
  check(o.line.includes("Demir") && o.line.includes("Kaya"), "sorunlu ağaçlar satırda adıyla");
  check(!o.line.includes("Yılmaz"), "temiz ağaç satırı şişirmiyor");
  /*
   * Satırın uzunluğu ağaç sayısıyla değil ARIZA sayısıyla büyümeli:
   * okunamayan bir uyarı, uyarı değildir.
   */
  check(o.line.includes("t2") && o.line.includes("t3"), "kimlikler de yazıyor (aramak için)");
}
{
  const o = mirrorSummary([checkMirror(temel)]);
  check(o.problems.length === 0 && /ayrışma yok/.test(o.line), "her şey temizse satır kısa");
  check(mirrorSummary([]).line.includes("0 ağaç"), "boş koşu da bir satır yazıyor");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
