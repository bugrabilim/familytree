import type { Person } from "../types/family.ts";
import {
  countTree,
  deepestAncestry,
  milestones,
  nextMilestones,
  reachedMilestones,
  yearsCovered,
} from "../lib/milestones.ts";

let ok = 0, fail = 0;
function eq<T>(got: T, want: T, msg: string) {
  if (JSON.stringify(got) === JSON.stringify(want)) ok++;
  else { fail++; console.log(`✗ ${msg}: bekl ${JSON.stringify(want)}, geldi ${JSON.stringify(got)}`); }
}
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

const P = (id: string, extra: Partial<Person> = {}): Person => ({
  id, firstName: id, lastName: "Soy", gender: "male",
  parentIds: [], spouseIds: [], ...extra,
});
/** id → ebeveyn zinciri kur. */
const zincir = (n: number): Person[] =>
  Array.from({ length: n }, (_, i) => P(`k${i}`, i ? { parentIds: [`k${i - 1}`] } : {}));

/* --- deepestAncestry: "yedi göbek" ölçüsü ------------------------------- */
eq(deepestAncestry([]), 0, "boş ağaçta sıfır");
eq(deepestAncestry([P("a")]), 1, "tek kişi 1. göbek");
eq(deepestAncestry(zincir(7)), 7, "yedi kişilik zincir = 7 göbek");
{
  /*
   * ASIL AYRIM: geniş bir ağaç derin bir ağaç değildir. Bir ebeveyn ve on
   * çocuk hâlâ 2 göbektir. Toplam kuşak yayılımına baksaydık bu ayrım
   * kaybolurdu.
   */
  const genis = [P("ata"), ...Array.from({ length: 10 }, (_, i) => P(`c${i}`, { parentIds: ["ata"] }))];
  eq(deepestAncestry(genis), 2, "geniş ama sığ ağaç 2 göbek");
}
{
  // İki dal: yalnız EN DERİN olan sayılır.
  const p = [...zincir(4), P("yan", { parentIds: ["k0"] })];
  eq(deepestAncestry(p), 4, "en derin dal sayılır");
}
{
  // Ağaçta olmayan bir ebeveyn kimliği zinciri kesmeli, patlatmamalı.
  const p = [P("cocuk", { parentIds: ["hayalet"] })];
  eq(deepestAncestry(p), 1, "öksüz ebeveyn başvurusu zinciri kesiyor");
}
{
  // Bozuk veri: döngü. Sonsuz özyineleme OLMAMALI.
  const p = [P("a", { parentIds: ["b"] }), P("b", { parentIds: ["a"] })];
  const d = deepestAncestry(p);
  check(Number.isFinite(d) && d > 0, `döngülü veri sonlu sonuç veriyor (${d})`);
}
{
  // Çevre kişileri soy zincirine KATILMAZ.
  const p = [P("dost", { kind: "cevre" }), P("cocuk", { parentIds: ["dost"] })];
  eq(deepestAncestry(p), 1, "çevre kişisi göbek saymıyor");
}

/* --- yearsCovered -------------------------------------------------------- */
eq(yearsCovered([]), 0, "tarihsiz ağaçta sıfır");
eq(yearsCovered([P("a", { birthDate: "1900" })]), 0, "tek tarih aralık vermez");
eq(yearsCovered([P("a", { birthDate: "1850" }), P("b", { birthDate: "1990" })]), 140, "doğumlar arası");
{
  // Ölüm tarihi de aralığı genişletmeli: 1850 doğumlu biri 1930'da öldüyse
  // ağaç 80 yıl kapsıyordur, 0 değil.
  eq(yearsCovered([P("a", { birthDate: "1850", deathDate: "1930" })]), 80, "ölüm tarihi aralığa katılıyor");
}
eq(yearsCovered([P("a", { birthDate: "1900-05-17" })]), 0, "tam tarihten yıl okunuyor");
eq(yearsCovered([P("a", { birthDate: "bilinmiyor" }), P("b", { birthDate: "1900" })]), 0,
  "sayı olmayan tarih yok sayılıyor");

/* --- countTree ----------------------------------------------------------- */
{
  const p = [
    P("a", {
      birthPlace: "Rize",
      photo: "kapak.jpg",
      photos: ["kapak.jpg", "ikinci.jpg"],
      sources: [{ id: "s1", title: "Nüfus kaydı" }],
      memories: [
        { id: "m1", text: "Anlattı." },
        { id: "m2", audio: "ses.webm" },
        { id: "m3", text: "Hem yazı", audio: "hem ses.webm" },
      ],
    }),
    P("b", { birthPlace: "rize" }),   // aynı yer, farklı yazım
    P("c", { birthPlace: "Trabzon" }),
    P("d", { kind: "cevre", birthPlace: "Bursa", photos: ["x.jpg"] }),
  ];
  const c = countTree(p);
  eq(c.kisi, 3, "çevre kişisi kişi sayımına girmiyor");
  eq(c.hikaye, 2, "yazılı anılar sayıldı");
  eq(c.ses, 2, "sesli anılar sayıldı");
  // Kapak fotoğrafı `photos` içindeyse İKİ KEZ sayılmamalı.
  eq(c.fotograf, 2, "kapak fotoğrafı çift sayılmıyor");
  eq(c.kaynak, 1, "kaynak sayıldı");
  eq(c.yer, 2, "aynı yerin farklı yazımı tek sayılıyor");
}
{
  // Kapak fotoğrafı listede DEĞİLSE sayılmalı.
  const c = countTree([P("a", { photo: "kapak.jpg", photos: ["baska.jpg"] })]);
  eq(c.fotograf, 2, "listede olmayan kapak ayrıca sayılıyor");
}
{
  const c = countTree([]);
  eq([c.kisi, c.gobek, c.hikaye, c.yer], [0, 0, 0, 0], "boş ağaç her yerde sıfır");
}

/* --- milestones ---------------------------------------------------------- */
{
  const bos = milestones([]);
  check(bos.length > 0, "boş ağaçta bile hedef listesi var");
  check(bos.every((m) => !m.reached), "boş ağaçta hiçbiri ulaşılmamış");
  check(bos.every((m) => m.key === `milestone.${m.id}`), "i18n anahtarı kimlikle eşleşiyor");
  check(new Set(bos.map((m) => m.id)).size === bos.length, "kilometre taşı kimlikleri tekil");
}
{
  const m = milestones(zincir(7));
  const gobek7 = m.find((x) => x.id === "gobek.7")!;
  check(gobek7.reached, "yedi göbek ulaşıldı");
  eq(gobek7.value, 7, "değer taşınıyor");
  eq(gobek7.target, 7, "hedef taşınıyor");
  // Alt eşikler de ulaşılmış sayılmalı.
  check(m.find((x) => x.id === "gobek.3")!.reached, "alt eşik de ulaşılmış");
  check(!m.find((x) => x.id === "kisi.10")!.reached, "7 kişiyle 10 kişi hedefi ulaşılmamış");
}
{
  const r = reachedMilestones(zincir(7));
  check(r.length > 0 && r.every((x) => x.reached), "yalnız ulaşılanlar dönüyor");
}

/* --- nextMilestones: umut kırıcı sıralama olmasın ----------------------- */
{
  const m = nextMilestones(zincir(7), 3);
  check(m.length <= 3, "limit uygulanıyor");
  check(m.every((x) => !x.reached), "sıradakiler ulaşılmamış olanlar");
  // Her türden yalnız BİR hedef (en yakını).
  check(new Set(m.map((x) => x.kind)).size === m.length, "tür başına tek hedef");
  // Oransal olarak en yakın olan başta.
  const oran = m.map((x) => x.value / x.target);
  check(oran.every((v, i) => i === 0 || oran[i - 1] >= v), "en yakın hedef başta");
}
{
  /*
   * Türler arası kıyas MUTLAK farkla yapılamaz: 7 kişilik ağaçta "10 kişi"
   * hedefine 3 kişi kaldı, "3 göbek" hedefi ise zaten aşıldı. Sıralamanın
   * oransal olduğunu göstermek için sığ ama kalabalık bir ağaca bakalım.
   */
  const kalabalik = [P("ata"), ...Array.from({ length: 20 }, (_, i) => P(`c${i}`, { parentIds: ["ata"] }))];
  const m = nextMilestones(kalabalik, 8);
  const gobek = m.find((x) => x.kind === "gobek")!;
  const kisi = m.find((x) => x.kind === "kisi")!;
  eq(gobek.target, 3, "göbekte sıradaki hedef 3");
  eq(kisi.target, 25, "kişide sıradaki hedef 25");
  // 21/25 = 0.84 ; 2/3 = 0.67 → kişi önce gelmeli.
  check(m.indexOf(kisi) < m.indexOf(gobek), "oransal olarak daha yakın olan önce");
}
{
  eq(nextMilestones([], 0).length, 0, "sıfır limit boş liste");
  const hepsiBitmis = nextMilestones(
    Array.from({ length: 300 }, (_, i) => P(`p${i}`, i ? { parentIds: [`p${i - 1}`] } : {})),
    5
  );
  // Bu ağaçta kişi ve göbek eşikleri tükendi; kalan türlerde hedef var.
  check(hepsiBitmis.every((x) => x.kind !== "gobek" && x.kind !== "kisi"),
    "tükenen türler sıradakiler listesinde yok");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
