import type { Gathering, Rsvp } from "../types/gathering.ts";
import {
  MAX_HEADCOUNT,
  MAX_NAME,
  MAX_NOTE,
  MAX_RSVPS,
  cleanText,
  isRsvpAnswer,
  normalizeGathering,
  normalizeRsvp,
  publicGathering,
  sameName,
  tally,
} from "../lib/gathering.ts";

let ok = 0, fail = 0;
function eq<T>(got: T, want: T, msg: string) {
  if (JSON.stringify(got) === JSON.stringify(want)) ok++;
  else { fail++; console.log(`✗ ${msg}: bekl ${JSON.stringify(want)}, geldi ${JSON.stringify(got)}`); }
}
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

const NOW = "2026-01-01T00:00:00.000Z";
const R = (o: Partial<Rsvp> = {}): Rsvp => ({
  id: "r", name: "Ali", answer: "geliyorum", headcount: 1, createdAt: NOW, ...o,
});
const G = (o: Partial<Gathering> = {}): Gathering => ({
  id: "g", title: "Düğün", when: "2026-06-01", rsvpOpen: true, token: "t",
  rsvps: [], createdAt: NOW, updatedAt: NOW, ...o,
});

/* --- cleanText: bağlantı yapıştırma yüzeyi olmasın ---------------------- */
/*
 * Yanıtlar ailenin göreceği bir listede çiziliyor. "Şuraya tıkla" yazan bir
 * RSVP, aileye gönderilmiş bir oltalama olurdu.
 */
eq(cleanText("Ali Demir", 80), "Ali Demir", "düz metin dokunulmadan geçer");
eq(cleanText("Bak: https://kotu.example/x", 80), "Bak:", "http bağlantısı düşürülür");
eq(cleanText("javascript:alert(1)", 80), "", "javascript: şeması düşürülür");
eq(cleanText("data:text/html,<b>x</b>", 80), "", "data: şeması düşürülür");
eq(cleanText("<script>kötü</script>", 80), "script kötü /script", "açı ayraçları düşer");
eq(cleanText("  çok    boşluk  ", 80), "çok boşluk", "boşluk sadeleşir");
eq(cleanText("a".repeat(200), 10), "a".repeat(10), "uzunluk kırpılır");
eq(cleanText(42, 80), "", "metin olmayan girdi boş");
eq(cleanText(undefined, 80), "", "eksik girdi boş");

/* --- sameName: Türkçe katlamalı ----------------------------------------- */
check(sameName("Ayşe Yılmaz", "ayşe yılmaz"), "büyük/küçük harf aynı kişi");
check(sameName("Ayşe  Yılmaz", "Ayşe Yılmaz"), "çoklu boşluk aynı kişi");
check(sameName("AYŞE", "ayşe"), "Türkçe büyük harf");
/*
 * Aksansız yazım AYNI kişi sayılıyor — ve bu doğru davranış. Yabancı bir
 * klavyeden "Ayse" yazan biri, "Ayşe" olarak kaydedilmiş kendi satırını
 * güncelleyebilmeli; aksi hâlde aynı kişi listede iki kez görünürdü.
 * (İlk yazışta bunun tersini beklemiştim; test kırıldı ve haklı olan
 * uygulamaydı.)
 */
check(sameName("Ayşe", "Ayse"), "aksansız yazım aynı kişi");
check(!sameName("Ali", "Veli"), "farklı ad");

/* --- RSVP kapalıyken YAZILAMAZ ------------------------------------------ */
{
  const r = normalizeRsvp(G({ rsvpOpen: false }), { name: "Ali", answer: "geliyorum" }, NOW);
  check("error" in r && r.error === "kapali", "kapalı etkinliğe yazılamıyor");
}
{
  // Varsayılan da kapalı olmalı: etkinlik oluşturmak yazma ucu açmak değil.
  const g = normalizeGathering({ title: "Mevlit", when: "2026-03-01" }, NOW)!;
  check(g.rsvpOpen === false, "yeni etkinlikte RSVP varsayılan KAPALI");
}

/* --- Geçersiz girdiler --------------------------------------------------- */
{
  const bos = normalizeRsvp(G(), { name: "  ", answer: "geliyorum" }, NOW);
  check("error" in bos && bos.error === "gecersiz", "adsız RSVP reddedilir");
  const kotuYanit = normalizeRsvp(G(), { name: "Ali", answer: "belkide" }, NOW);
  check("error" in kotuYanit && kotuYanit.error === "gecersiz", "bilinmeyen yanıt reddedilir");
  const yanitsiz = normalizeRsvp(G(), { name: "Ali" }, NOW);
  check("error" in yanitsiz && yanitsiz.error === "gecersiz", "yanıtsız RSVP reddedilir");
  // Yalnız bağlantıdan ibaret bir ad, temizlikten sonra boş kalır.
  const link = normalizeRsvp(G(), { name: "https://spam.example", answer: "geliyorum" }, NOW);
  check("error" in link && link.error === "gecersiz", "bağlantıdan ibaret ad reddedilir");
}

/* --- Kişi sayısı: reddetme, DÜZELT --------------------------------------- */
{
  /*
   * Kullanıcı bir formda sayı yazmaya çalışıyor; onu hata ekranıyla
   * karşılamak bilgiyi kaybettirir. Kırpmak doğru davranış.
   */
  const c = (h: unknown) => {
    const r = normalizeRsvp(G(), { name: "Ali", answer: "geliyorum", headcount: h }, NOW);
    return "error" in r ? -1 : r.rsvp.headcount;
  };
  eq(c(3), 3, "geçerli sayı korunur");
  eq(c(0), 1, "sıfır → 1");
  eq(c(-5), 1, "negatif → 1");
  eq(c(9999), MAX_HEADCOUNT, "aşırı sayı tavana kırpılır");
  eq(c(2.7), 2, "ondalık aşağı yuvarlanır");
  eq(c("abc"), 1, "sayı olmayan → 1");
  eq(c(undefined), 1, "eksik → 1");
}

/* --- Aynı ad: yeni satır DEĞİL, güncelleme ------------------------------ */
{
  /*
   * Bu hem kazayı (iki kez tıklama) hem kaba spam'i düzeltiyor — ve
   * kullanıcı için de doğru: fikrini değiştiren biri yanıtını
   * değiştirebilmeli.
   */
  const g = G({ rsvps: [R({ id: "r1", name: "Ayşe Yılmaz", answer: "geliyorum", createdAt: "2025-01-01" })] });
  const r = normalizeRsvp(g, { name: "ayşe  yılmaz", answer: "gelemiyorum" }, NOW);
  check(!("error" in r), "aynı ad kabul ediliyor");
  if (!("error" in r)) {
    eq(r.replacesId, "r1", "önceki kaydın yerine geçiyor");
    eq(r.rsvp.answer, "gelemiyorum", "yanıt güncellendi");
    eq(r.rsvp.createdAt, "2025-01-01", "İLK yazma zamanı korunuyor (sıra bozulmasın)");
  }
}

/* --- Tavan: tek betik binlerce satır yazamasın -------------------------- */
{
  const dolu = G({ rsvps: Array.from({ length: MAX_RSVPS }, (_, i) => R({ id: `r${i}`, name: `Kisi${i}` })) });
  const yeni = normalizeRsvp(dolu, { name: "Yeni Kisi", answer: "geliyorum" }, NOW);
  check("error" in yeni && yeni.error === "dolu", "tavan dolunca yeni kayıt reddedilir");
  // Ama VAR OLAN biri hâlâ fikrini değiştirebilmeli.
  const guncelle = normalizeRsvp(dolu, { name: "Kisi0", answer: "gelemiyorum" }, NOW);
  check(!("error" in guncelle), "tavan doluyken de mevcut kayıt güncellenebiliyor");
}

/* --- Sınırlar ------------------------------------------------------------ */
{
  const r = normalizeRsvp(G(), {
    name: "A".repeat(MAX_NAME + 50), answer: "belki", note: "n".repeat(MAX_NOTE + 50),
  }, NOW);
  if (!("error" in r)) {
    eq(r.rsvp.name.length, MAX_NAME, "ad sınırı");
    eq(r.rsvp.note!.length, MAX_NOTE, "not sınırı");
  }
  const notsuz = normalizeRsvp(G(), { name: "Ali", answer: "belki", note: "   " }, NOW);
  if (!("error" in notsuz)) check(!("note" in notsuz.rsvp), "boş not alanı hiç yazılmaz");
}

/* --- tally: yemek sayısı doğru olmalı ----------------------------------- */
{
  const t = tally([
    R({ answer: "geliyorum", headcount: 4 }),
    R({ answer: "geliyorum", headcount: 2 }),
    R({ answer: "belki", headcount: 3 }),
    R({ answer: "gelemiyorum", headcount: 1 }),
  ]);
  eq(t.geliyorum, 2, "geliyorum sayısı");
  eq(t.belki, 1, "belki sayısı");
  eq(t.gelemiyorum, 1, "gelemiyorum sayısı");
  /*
   * "Belki" diyenlerin kişi sayısını toplamak, yemek hazırlayan kişiye
   * yanlış bir sayı vermek olurdu — bu sayının tek kullanım amacı o.
   */
  eq(t.headcount, 6, "kişi sayısı YALNIZ geliyorum diyenlerden");
  eq(tally([]), { geliyorum: 0, gelemiyorum: 0, belki: 0, headcount: 0 }, "boş liste");
}

/* --- publicGathering: jeton ve katılımcı listesi çıkmaz ----------------- */
{
  const g = G({ token: "gizli-jeton", rsvps: [R({ name: "Ayşe" }), R({ name: "Veli", answer: "belki" })] });
  const p = publicGathering(g) as unknown as Record<string, unknown>;
  /*
   * Jeton yanıtta olsaydı sayfada, önbellekte ve paylaşılan ekran
   * görüntülerinde çoğalırdı. Katılımcı listesi de ailenin bilgisi;
   * bağlantıyı eline geçiren herkesin değil.
   */
  check(!("token" in p), "yazma jetonu dışarı verilmiyor");
  check(!("rsvps" in p), "katılımcı listesi dışarı verilmiyor");
  check(!JSON.stringify(p).includes("Ayşe"), "katılımcı adı hiçbir yerde geçmiyor");
  check(!JSON.stringify(p).includes("gizli-jeton"), "jeton hiçbir yerde geçmiyor");
  eq((p.tally as { geliyorum: number }).geliyorum, 1, "özet sayı yine de var");
  eq(p.title, "Düğün", "başlık görünüyor");
}

/* --- normalizeGathering -------------------------------------------------- */
{
  check(normalizeGathering({ when: "2026-06-01" }, NOW) === null, "başlıksız etkinlik reddedilir");
  check(normalizeGathering({ title: "Düğün" }, NOW) === null, "tarihsiz etkinlik reddedilir");
  const g = normalizeGathering({ title: "  Düğün  ", when: "2026-06-01", place: "  " }, NOW)!;
  eq(g.title, "Düğün", "başlık kırpılır");
  check(!("place" in g), "boş yer alanı hiç yazılmaz");
  eq(g.rsvps, [], "yeni etkinlikte katılım listesi boş");
}
{
  // Güncellemede mevcut RSVP'ler ve jeton KORUNMALI.
  const eski = G({ id: "g1", token: "t1", rsvps: [R()] });
  const g = normalizeGathering({ title: "Yeni Başlık" }, NOW, eski)!;
  eq(g.id, "g1", "kimlik korunur");
  eq(g.token, "t1", "jeton korunur");
  eq(g.rsvps.length, 1, "katılımlar korunur");
  eq(g.rsvpOpen, true, "açık/kapalı durumu korunur");
  eq(g.title, "Yeni Başlık", "başlık güncellenir");
}

for (const a of ["geliyorum", "gelemiyorum", "belki"]) check(isRsvpAnswer(a), `${a} geçerli yanıt`);
check(!isRsvpAnswer("evet"), "serbest yanıt kabul edilmiyor");

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
