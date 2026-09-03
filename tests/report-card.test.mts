import type { Person } from "../types/family.ts";
import {
  isRoundAnniversary,
  lifeYear,
  recordYear,
  reportCard,
  reportYears,
  yearOf,
} from "../lib/report-card.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

const kisi = (p: Partial<Person> & { id: string }): Person =>
  ({ firstName: "Ad", lastName: "Soyad", gender: "unknown", ...p }) as Person;

/* ── Yıl okuma: tahmine yer yok ──────────────────────────────────────────── */

check(yearOf("2026") === 2026, "YYYY okunuyor");
check(yearOf("2026-04") === 2026, "YYYY-MM okunuyor");
check(yearOf("2026-04-23") === 2026, "YYYY-MM-DD okunuyor");
check(yearOf(undefined) === null, "boş tarih yıl vermiyor");
check(yearOf("") === null, "boş metin yıl vermiyor");
for (const belirsiz of ["1950 civarı", "?", "195x", "yaklaşık 1900", "20260423"]) {
  check(yearOf(belirsiz) === null, `belirsiz tarih atılıyor: "${belirsiz}"`);
}

/* ── ASIL AYRIM: "olan" ile "kayda geçen" karışmıyor ─────────────────────── */
/*
 * Bu dosyanın var oluş nedeni. 1890 doğumlu bir dedeyi bu yıl ağaca eklemek
 * 2026'da bir doğum DEĞİLDİR; karışsalardı kullanıcıya ailesi hakkında
 * yanlış bir cümle söylenmiş olurdu.
 */
{
  const dede = kisi({ id: "d", firstName: "Mehmed", birthDate: "1890", deathDate: "1961" });
  const l = lifeYear([dede], 2026);
  check(l.births.length === 0, "1890 doğumlu kişi 2026 doğumu sayılmıyor");
  check(l.deaths.length === 0, "1961 ölümü 2026 ölümü sayılmıyor");

  // Aynı kişi "kayda geçen" tarafında görünür — ama orada.
  const r = recordYear([], [dede], "2026-01-01");
  check(r.people === 1, "aynı kişi kayda geçenlerde sayılıyor");
  check(lifeYear([dede], 2026).births.length === 0, "yine de doğum listesine girmiyor");
}

/* ── Ailede olanlar ──────────────────────────────────────────────────────── */
{
  const people = [
    kisi({ id: "1", firstName: "Bebek", birthDate: "2026-03-01" }),
    kisi({ id: "2", firstName: "Dede", deathDate: "2026-07-14" }),
    kisi({ id: "3", firstName: "Başkası", birthDate: "2025" }),
  ];
  const l = lifeYear(people, 2026);
  check(l.births.length === 1 && l.births[0].name === "Bebek Soyad", "yılın doğumu");
  check(l.deaths.length === 1 && l.deaths[0].name === "Dede Soyad", "yılın ölümü");
  check(!l.births.some((b) => b.id === "3"), "başka yılın doğumu girmiyor");
}
{
  // Aynı yıl doğup ölen bebek İKİSİNDE de görünmeli — ikisi de olmuş.
  const p = kisi({ id: "1", birthDate: "2026-02-01", deathDate: "2026-02-09" });
  const l = lifeYear([p], 2026);
  check(l.births.length === 1 && l.deaths.length === 1, "aynı yıl doğup ölen iki listede de var");
}
{
  const p = kisi({
    id: "1",
    events: [
      { id: "e1", date: "2026-06-01", type: "evlilik", title: "Nikâh" },
      { id: "e2", date: "2001", type: "mezuniyet", title: "Lise" },
      { id: "e3", type: "goc", title: "Tarihsiz" },
    ],
  });
  const l = lifeYear([p], 2026);
  check(l.events.length === 1 && l.events[0].title === "Nikâh", "yılın yaşam olayı");
  check(!l.events.some((e) => e.title === "Tarihsiz"), "tarihsiz olay girmiyor");
}
{
  // Çevre bağları soy ağacının olayları değil.
  const cevre = kisi({ id: "c", kind: "cevre", birthDate: "2026" });
  check(lifeYear([cevre], 2026).births.length === 0, "çevre kişisi karneye girmiyor");
}

/* ── Yıl dönümleri: her yıl haber değil ──────────────────────────────────── */

for (const y of [10, 20, 50, 100, 25, 75]) check(isRoundAnniversary(y), `${y}. yıl yuvarlak`);
for (const y of [1, 3, 7, 13, 26, 99]) check(!isRoundAnniversary(y), `${y}. yıl yuvarlak değil`);
check(!isRoundAnniversary(0), "sıfırıncı yıl dönüm değil (o zaten doğum/ölüm listesinde)");
{
  const people = [
    kisi({ id: "1", firstName: "Yüzlük", birthDate: "1926" }),   // 100
    kisi({ id: "2", firstName: "Onluk", birthDate: "2016" }),    // 10
    kisi({ id: "3", firstName: "Yedilik", birthDate: "2019" }),  // 7 → yok
    kisi({ id: "4", firstName: "Anma", deathDate: "1976" }),     // 50. yıl
  ];
  const l = lifeYear(people, 2026);
  check(l.anniversaries.length === 3, "yalnız yuvarlak dönümler");
  check(l.anniversaries[0].years === 100, "en büyük dönüm başta");
  check(l.anniversaries.some((a) => a.kind === "olum" && a.years === 50), "ölüm yıl dönümü de var");
  check(!l.anniversaries.some((a) => a.id === "3"), "7. yıl listede yok");
}
{
  // GELECEKTEKİ bir tarih geriye dönük karnede dönüm üretmemeli.
  const p = kisi({ id: "1", birthDate: "2036" });
  check(lifeYear([p], 2026).anniversaries.length === 0, "gelecek tarih dönüm üretmiyor");
}

/* ── Gizlilik: karne bir istisna değil ───────────────────────────────────── */
{
  const p = kisi({ id: "1", firstName: "Gizli", lastName: "Kişi", confidential: true, birthDate: "2026" });
  const l = lifeYear([p], 2026);
  check(l.births.length === 1, "gizli kayıt sayılıyor");
  check(l.births[0].name === "" && l.births[0].confidential, "gizli kaydın ADI karnede yok");
}
{
  const p = kisi({ id: "1", firstName: "Gizli", confidential: true, deathDate: "1976" });
  check(lifeYear([p], 2026).anniversaries[0].name === "", "gizli kaydın yıl dönümü de adsız");
}

/* ── Kayda geçenler ──────────────────────────────────────────────────────── */
{
  const once = [kisi({ id: "1" })];
  const simdi = [
    kisi({ id: "1", photos: ["a", "b"], memories: [{ id: "m" }], birthDate: "1950" }),
    kisi({ id: "2" }),
  ];
  const r = recordYear(once, simdi, "2026-01-01");
  check(r.people === 1, "eklenen kişi");
  check(r.photos === 2, "eklenen fotoğraf");
  check(r.memories === 1, "eklenen anı");
  check(r.filledIn === 1, "boş kayıt dolduruldu");
  check(r.since === "2026-01-01", "karşılaştırma tarihi taşınıyor");
}
{
  /*
   * EKSİLME gizlenmiyor. Sıfıra kırpılsaydı "bu yıl 3 kişi eksildi" gerçeği
   * kaybolur, karne yalancı olurdu.
   */
  const r = recordYear([kisi({ id: "1" }), kisi({ id: "2" })], [kisi({ id: "1" })], "x");
  check(r.people === -1, "silme negatif olarak görünüyor");
}
{
  const r = recordYear([kisi({ id: "1", photo: "u" })], [kisi({ id: "1", photo: "u" })], "x");
  check(r.photos === 0, "değişmeyen sayı sıfır");
}

/* ── Karne: geçmiş yoksa uydurulmuyor ────────────────────────────────────── */
{
  const c = reportCard([kisi({ id: "1", birthDate: "2026" })], 2026);
  check(c.record === null, "geçmiş görüntüsü yoksa 'kayda geçen' bölümü yok");
  check(!c.empty, "doğum varsa karne boş değil");
}
{
  const c = reportCard([kisi({ id: "1", birthDate: "2026" })], 2026, {
    before: [], since: "2026-01-01",
  });
  check(c.record?.people === 1, "geçmiş varsa bölüm doluyor");
}
{
  const c = reportCard([kisi({ id: "1", birthDate: "1890" })], 2026);
  check(c.empty, "hiçbir şey olmayan yıl BOŞ olarak bildiriliyor");
}
{
  // Yalnız kayda geçen varsa da boş değil.
  const c = reportCard([kisi({ id: "1", birthDate: "1890" })], 2026, { before: [], since: "x" });
  check(!c.empty, "yalnız kayıt hareketi de karneyi doldurur");
}

/* ── Yıl seçici ──────────────────────────────────────────────────────────── */
{
  const people = [
    kisi({ id: "1", birthDate: "1950", deathDate: "2020" }),
    kisi({ id: "2", birthDate: "1950" }),
    kisi({ id: "3", events: [{ id: "e", date: "1975", type: "x", title: "y" }] }),
    kisi({ id: "4", birthDate: "belirsiz" }),
  ];
  const y = reportYears(people);
  check(y.join(",") === "2020,1975,1950", "yalnız gerçekten bir şey olan yıllar, yeniden eskiye");
  check(reportYears(people, 2).length === 2, "sınır uygulanıyor");
}
{
  // 400 yıllık ağaçta 400 seçenek olmamalı — yalnız dolu yıllar.
  const people = Array.from({ length: 30 }, (_, i) => kisi({ id: `p${i}`, birthDate: String(1600 + i * 10) }));
  check(reportYears(people).length === 12, "varsayılan sınır 12");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
