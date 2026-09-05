import {
  BACKUP_PREFIX,
  backupSources,
  isBackupPath,
  planRetention,
  snapshotPath,
  snapshotStamp,
  stampOf,
} from "../lib/backup.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

/* ── Damga ────────────────────────────────────────────────────────────────── */

check(stampOf(new Date("2026-09-03T18:42:00Z")) === "2026-09-03", "damga UTC gününü veriyor");
check(stampOf(new Date("2026-01-01T00:00:00Z")) === "2026-01-01", "yıl başı");
{
  /*
   * UTC şart: cron UTC'de koşuyor. Yerel saate göre damgalansaydı, gün
   * sınırını geçen bir koşu aynı güne iki görüntü ya da bir güne hiç görüntü
   * yazabilirdi — saklama sayımı da onunla birlikte kayardı.
   */
  check(stampOf(new Date("2026-09-03T23:30:00Z")) === "2026-09-03", "gece yarısından önce");
  check(stampOf(new Date("2026-09-04T00:30:00Z")) === "2026-09-04", "gece yarısından sonra");
}

/* ── Yol tanıma ───────────────────────────────────────────────────────────── */

check(isBackupPath("backups/2026-09-03/users.json"), "yedek yolu tanınıyor");
check(!isBackupPath("users.json"), "canlı yol yedek sayılmıyor");
check(!isBackupPath("family-data-abc.json"), "ağaç verisi yedek sayılmıyor");
/*
 * Adı "backups" ile BAŞLAYAN ama önek olmayan canlı bir dosya yedek
 * sayılmamalı — yoksa saklama işi onu silmeye aday görürdü.
 */
check(!isBackupPath("backups-eski.json"), "önek eğik çizgiyle bitiyor (yakın ad yanlış eşleşmiyor)");

check(snapshotStamp("backups/2026-09-03/users.json") === "2026-09-03", "damga çıkarılıyor");
check(snapshotStamp("backups/2026-09-03/alt/klasor/x.json") === "2026-09-03", "alt yollarda da");
check(snapshotStamp("users.json") === null, "canlı yolun damgası yok");
for (const kotu of [
  "backups/gecersiz/users.json",
  "backups/2026-9-3/users.json",
  "backups/20260903/users.json",
  "backups/users.json",
  "backups/2026-09-03x/users.json",
]) {
  check(snapshotStamp(kotu) === null, `tanınmayan damga: ${kotu}`);
}

check(snapshotPath("2026-09-03", "users.json") === "backups/2026-09-03/users.json", "yedek yolu kuruluyor");
check(snapshotStamp(snapshotPath("2026-09-03", "a/b.json")) === "2026-09-03", "kurulan yol geri okunabiliyor");

/* ── Kaynak seçimi: yedeğin yedeği ALINMAZ ───────────────────────────────── */
/*
 * Alınsaydı her koşu bir öncekinin tamamını kopyalar, depo katlanarak
 * büyürdü — yedeğin kendisi arızaya dönüşürdü.
 */
{
  const hepsi = [
    "users.json",
    "family-data-abc.json",
    "backups/2026-09-02/users.json",
    "backups/2026-09-02/family-data-abc.json",
  ];
  const kaynak = backupSources(hepsi);
  check(kaynak.length === 2, `yalnız canlı yollar kaynak (${kaynak.length})`);
  check(!kaynak.some(isBackupPath), "kaynakta hiç yedek yolu yok");
  check(kaynak.includes("users.json"), "kimlik deposu kaynakta");
}

/* ── SAKLAMA: yanlış silen yedek, hiç yedek almamaktan kötüdür ───────────── */

{
  const yollar = [
    "backups/2026-09-01/users.json",
    "backups/2026-09-01/family-data-abc.json",
    "backups/2026-09-02/users.json",
    "backups/2026-09-03/users.json",
    "backups/2026-09-03/family-data-abc.json",
  ];
  const p = planRetention(yollar, 2);
  check(p.keep.length === 2, "iki damga korunuyor");
  check(p.keep.includes("2026-09-03") && p.keep.includes("2026-09-02"), "EN YENİ ikisi korunuyor");
  check(p.remove.length === 2, `en eski günün iki dosyası siliniyor (${p.remove.length})`);
  check(p.remove.every((x) => x.startsWith("backups/2026-09-01/")), "yalnız en eski gün siliniyor");
  /*
   * Gün bazında sayılıyor, dosya bazında değil: bir günün görüntüsü yüzlerce
   * dosya olabilir ve yarısını silmek onu işe yaramaz kılardı.
   */
  check(!p.remove.some((x) => x.includes("2026-09-03")), "korunan günün hiçbir dosyası silinmiyor");
}

/* --- KURAL 1: canlı veri asla silme listesine giremez -------------------- */
{
  const yollar = [
    "users.json",
    "family-data-abc.json",
    "family-history-abc.json",
    "tree-access-abc.json",
    "backups/2020-01-01/users.json",
  ];
  const p = planRetention(yollar, 1);
  check(p.remove.every(isBackupPath), "silme listesinde YALNIZ yedek yolları var");
  check(!p.remove.includes("users.json"), "kimlik deposu silinmiyor");
  check(!p.remove.includes("family-data-abc.json"), "ağaç verisi silinmiyor");
  check(p.remove.length === 0, "tek görüntü varken hiçbir şey silinmiyor");
}

/* --- KURAL 2: anlamadığımız yedek yolu silinmez ------------------------- */
/*
 * Elle konmuş ya da başka bir araçtan kalmış bir dosyayı silmek, en çok o
 * dosyanın gerekli olduğu anda kaybetmenin yoludur.
 */
{
  const yollar = [
    "backups/2026-09-01/users.json",
    "backups/2026-09-02/users.json",
    "backups/2026-09-03/users.json",
    "backups/elle-alinmis/onemli.json",
    "backups/OKUBENI.txt",
  ];
  const p = planRetention(yollar, 1);
  check(!p.remove.includes("backups/elle-alinmis/onemli.json"), "tanınmayan damgalı klasör korunuyor");
  check(!p.remove.includes("backups/OKUBENI.txt"), "damgasız dosya korunuyor");
  check(p.remove.length === 2, `yalnız tanınan eski günler siliniyor (${p.remove.length})`);
}

/* --- KURAL 3: keep en az 1 ---------------------------------------------- */
/*
 * 0 (ya da negatif) geçilirse işlev "her şeyi sil"e dönüşürdü. Yapılandırma
 * hatasının bedeli bütün yedeklerin kaybı olmamalı.
 */
{
  const yollar = ["backups/2026-09-01/a.json", "backups/2026-09-02/a.json"];
  for (const kotu of [0, -5, 0.4, Number.NaN]) {
    const p = planRetention(yollar, kotu as number);
    check(p.keep.length === 1, `keep=${kotu} → en az bir görüntü korunuyor`);
    check(p.keep[0] === "2026-09-02", `keep=${kotu} → korunan EN YENİ olan`);
    check(p.remove.length === 1, `keep=${kotu} → yalnız eski siliniyor`);
  }
}

/* --- Sınır durumları ---------------------------------------------------- */
{
  check(planRetention([], 3).remove.length === 0, "boş depoda silme yok");
  check(planRetention([], 3).keep.length === 0, "boş depoda korunan yok");
  const az = ["backups/2026-09-01/a.json"];
  check(planRetention(az, 7).remove.length === 0, "görüntü sayısı sınırın altındaysa silme yok");
  // Aynı gün birden çok kez koşarsa: tek damga, tek görüntü.
  const ayniGun = ["backups/2026-09-03/a.json", "backups/2026-09-03/b.json"];
  const p = planRetention(ayniGun, 1);
  check(p.keep.length === 1 && p.remove.length === 0, "aynı günün ikinci koşusu silme üretmiyor");
}

/* --- Sıralama metin değil TARİH sırası olmalı ---------------------------- */
/*
 * Damga sabit genişlikte (`YYYY-MM-DD`) olduğu için metin sıralaması tarih
 * sırasına eşit. Biçim değişirse bu varsayım sessizce bozulur; yıl ve ay
 * sınırını geçen bir küme onu yakalar.
 */
{
  const yollar = [
    "backups/2025-12-31/a.json",
    "backups/2026-01-01/a.json",
    "backups/2026-01-09/a.json",
    "backups/2026-01-10/a.json",
  ];
  const p = planRetention(yollar, 2);
  check(p.keep.includes("2026-01-10") && p.keep.includes("2026-01-09"),
    `yıl/ay sınırında en yeniler korunuyor (${p.keep.join(",")})`);
  check(p.remove.length === 2, "eski yıl siliniyor");
}

check(BACKUP_PREFIX === "backups/", "önek sabiti");

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
