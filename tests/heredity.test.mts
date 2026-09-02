import { conditionsOf, aggregateConditions, traceCondition } from "../lib/heredity.ts";
import { stripPrivateFields } from "../lib/privacy.ts";
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

/* --- Kişi düzeyi --------------------------------------------------------- */

eq(conditionsOf(P("a")), [], "kaydı olmayan kişide durum yok");

const three = P("a", {
  congenitalCondition: "Akdeniz anemisi",
  healthCondition: "Tansiyon",
  deathCause: "Kalp yetmezliği",
});
eq(conditionsOf(three).map((c) => c.source), ["congenital", "acquired", "fatal"],
  "üç alan da okunur");

// Serbest metinde birden çok durum — noktalı virgül ve eğik çizgi ayırır
eq(conditionsOf(P("a", { healthCondition: "astım; şeker / guatr" })).length, 3,
  "noktalı virgül ve eğik çizgi ayırır");

// VİRGÜL AYIRMAZ: Türkçede virgül cümle ayracı da olabiliyor ve gerçek veride
// "Şeker hastalığı, 46 yaşında konuldu" → "46 yaşında konuldu" gibi anlamsız
// bir "durum" doğuruyordu.
eq(conditionsOf(P("a", { healthCondition: "Şeker hastalığı, 46 yaşında konuldu" })).length, 1,
  "virgül bölmez — açıklama tek parça kalır");
eq(conditionsOf(P("a", { healthCondition: "Şeker hastalığı, 46 yaşında konuldu" }))[0].label,
  "Şeker hastalığı, 46 yaşında konuldu", "metin bozulmadan korunur");
eq(conditionsOf(P("a", { congenitalCondition: "Doğuştan işitme engelli — iki taraflı koklear implant" })).length, 1,
  "açıklamalı kayıt bir durumdur, iki değil");
eq(conditionsOf(P("a", { healthCondition: "  ;  / " })), [],
  "yalnız ayraçtan durum çıkmaz");
eq(conditionsOf(P("a", { healthCondition: " Astım " }))[0].label, "Astım",
  "özgün yazım korunur");

/* --- Toplama ------------------------------------------------------------- */

const people: Person[] = [
  P("dede", { congenitalCondition: "Akdeniz anemisi", deathCause: "Akdeniz anemisi" }),
  P("baba", { parentIds: ["dede"], congenitalCondition: "akdeniz anemisi" }),
  P("cocuk", { parentIds: ["baba"], congenitalCondition: "AKDENİZ ANEMİSİ" }),
  P("hala", { parentIds: ["dede"], healthCondition: "Tansiyon" }),
  P("yabanci", { healthCondition: "Tansiyon" }),
];

const agg = aggregateConditions(people);
eq(agg.map((a) => [a.label, a.count]), [["Akdeniz anemisi", 3], ["Tansiyon", 2]],
  "çoktan aza, gösterimde en sık yazım");

const anemi = agg[0];
eq(anemi.congenital, 3, "üçünde de doğuştan");
eq(anemi.fatal, 1, "birinde ölüm nedeni");
eq(anemi.acquired, 0, "hiçbirinde sonradan değil");
// Aynı kişi hem doğuştan hem ölüm nedeni olarak yazmışsa BİR kez sayılır
eq(anemi.count, 3, "kişi bir kez sayılır, kayıt iki kez geçse de");
eq(anemi.personIds.sort(), ["baba", "cocuk", "dede"], "kişi kimlikleri");

eq(aggregateConditions([]), [], "boş ağaç");
eq(aggregateConditions([P("a")]), [], "kayıt yoksa toplam yok");

/* --- ASIL İŞ: kalıtım izi ------------------------------------------------ */

const trace = traceCondition("akdeniz anemisi", people);
eq(trace.affected.length, 3, "üç kişi etkilenmiş");
eq(trace.label, "Akdeniz anemisi", "gösterim yazımı");

// Etkilenen ebeveyn → etkilenen çocuk halkaları
eq(trace.links.sort((a, b) => a.childId.localeCompare(b.childId)),
  [{ parentId: "dede", childId: "baba" }, { parentId: "baba", childId: "cocuk" }],
  "iki kalıtım halkası");
eq(trace.generationsSpanned, 3, "üç kuşağa yayılmış");

// Hala etkilenmemiş → dede-hala halkası yok
check(!trace.links.some((l) => l.childId === "hala"), "etkilenmeyen çocuk halkaya girmez");

// Akraba olmayan iki kişide halka yok
const tansiyon = traceCondition("tansiyon", people);
eq(tansiyon.affected.length, 2, "iki kişide tansiyon");
eq(tansiyon.links, [], "akraba olmayanlar arasında halka yok");
eq(tansiyon.generationsSpanned, 1, "tek kuşak");

eq(traceCondition("olmayan hastalık", people).affected, [], "olmayan durum → boş");
eq(traceCondition("olmayan hastalık", people).generationsSpanned, 0, "boşta kuşak 0");

// Katlanmamış anahtar da çalışır
eq(traceCondition("AKDENİZ ANEMİSİ", people).affected.length, 3, "anahtar katlanır");

/* --- Kan derecesi dışarıdan gelir, RİSK DEĞİLDİR ------------------------ */

const noDeg = traceCondition("akdeniz anemisi", people);
check(noDeg.affected.every((a) => a.bloodDegree === null), "derece verilmezse null");

const degrees = new Map([["dede", 2], ["baba", 1], ["cocuk", 0]]);
const withDeg = traceCondition("akdeniz anemisi", people, { degrees });
eq(withDeg.affected.find((a) => a.personId === "dede")?.bloodDegree, 2, "derece taşınır");
eq(withDeg.affected.find((a) => a.personId === "cocuk")?.bloodDegree, 0, "sıfır derece taşınır");

// Sözleşme: hiçbir alan olasılık/yüzde taşımaz
const keys = new Set(Object.keys(withDeg.affected[0]));
check(!keys.has("risk") && !keys.has("probability") && !keys.has("percent"),
  "çıktıda risk/olasılık alanı YOK");

/* --- Gizlilik: maskelenmiş kişi eşleşmemeli ----------------------------- */

const secret = P("gizli", {
  congenitalCondition: "Akdeniz anemisi",
  privateFields: ["health"],
});
// Ham veriyle bakılırsa görünür...
eq(conditionsOf(secret).length, 1, "ham veride durum görünür");
// ...ama view()'dan geçmiş veriyle görünmemeli
eq(conditionsOf(stripPrivateFields(secret)), [], "maskelenmiş kişide durum görünmez");

const mixed = [...people, secret].map(stripPrivateFields);
eq(traceCondition("akdeniz anemisi", mixed).affected.length, 3,
  "maskelenmiş kişi ize girmez");

/* --- Kenar durumlar ------------------------------------------------------ */

// Döngülü veri sonlanmalı
const cyclic: Person[] = [
  P("a", { parentIds: ["b"], congenitalCondition: "X" }),
  P("b", { parentIds: ["a"], congenitalCondition: "X" }),
];
const cy = traceCondition("x", cyclic);
// 2 kişilik döngü en fazla 2 kuşak olabilir — sahte kuşak üretilmemeli
eq(cy.generationsSpanned, 2, "döngüde kuşak sayısı kişi sayısını aşmaz");
eq(cy.affected.length, 2, "döngüde de kişiler bulunur");

// Kuşak atlaması: dede ve torun etkilenmiş, baba değil → halka yok
const skip: Person[] = [
  P("dede", { congenitalCondition: "Y" }),
  P("baba", { parentIds: ["dede"] }),
  P("torun", { parentIds: ["baba"], congenitalCondition: "Y" }),
];
const sk = traceCondition("y", skip);
eq(sk.affected.length, 2, "iki kişi etkilenmiş");
eq(sk.links, [], "arada etkilenmeyen varsa halka kurulmaz");
eq(sk.generationsSpanned, 1, "kesintisiz zincir yok");

// Giriş sırası sonucu değiştirmez
eq(
  aggregateConditions([...people].reverse()).map((a) => a.label),
  aggregateConditions(people).map((a) => a.label),
  "sıralama kararlı"
);

/* --- H6: akraba evliliğinde ÜSTEL olmamalı ------------------------------ */

// Yolların birleştiği yapı (her kuşakta iki kişi, çocuklar ikisinin de
// çocuğu) önceki sürümde üstel davranıyordu: 22 kuşak = 44 kişi 1,6 saniye.
// Türkiye bağlamında akraba evliliği yaygın, yani bu gerçekçi bir yük.
function birlesenZincir(kusak: number): Person[] {
  const out: Person[] = [P("a0", { congenitalCondition: "X" }), P("b0", { congenitalCondition: "X" })];
  for (let k = 1; k < kusak; k++) {
    out.push(
      P(`a${k}`, { parentIds: [`a${k - 1}`, `b${k - 1}`], congenitalCondition: "X" }),
      P(`b${k}`, { parentIds: [`a${k - 1}`, `b${k - 1}`], congenitalCondition: "X" })
    );
  }
  return out;
}
const t0 = Date.now();
const birlesen = traceCondition("x", birlesenZincir(24));
const birlesenMs = Date.now() - t0;
check(birlesenMs < 500, `24 kuşak birleşen zincir hızlı (${birlesenMs} ms)`);
eq(birlesen.affected.length, 48, "48 kişi etkilenmiş");
eq(birlesen.generationsSpanned, 24, "24 kuşağa yayılmış");

// Derin düz zincir: yığın taşmamalı (önceki özyinelemeli sürüm ~8000'de çöküyordu)
function duzZincir(n: number): Person[] {
  const out: Person[] = [P("p0", { congenitalCondition: "X" })];
  for (let i = 1; i < n; i++) out.push(P(`p${i}`, { parentIds: [`p${i - 1}`], congenitalCondition: "X" }));
  return out;
}
let derinOk = false;
let derinMs = 0;
try {
  const t1 = Date.now();
  const derin = traceCondition("x", duzZincir(10000));
  derinMs = Date.now() - t1;
  derinOk = derin.generationsSpanned === 10000;
} catch { derinOk = false; }
check(derinOk, `10.000 derinlikte yığın taşmıyor ve zincir doğru (${derinMs} ms)`);

// Zincir uzunluğu doğrusal ölçeklenmeli, üstel değil
const olc = (k: number) => { const t = Date.now(); traceCondition("x", birlesenZincir(k)); return Date.now() - t; };
const kucuk = Math.max(olc(16), 1);
const buyuk = Math.max(olc(24), 1);
check(buyuk < kucuk * 20, `16→24 kuşak arası büyüme üstel değil (${kucuk}ms → ${buyuk}ms)`);

/* --- Döngü: üst sınır bildirilir, çökmez -------------------------------- */

const halka: Person[] = [
  P("c1", { parentIds: ["c3"], congenitalCondition: "X" }),
  P("c2", { parentIds: ["c1"], congenitalCondition: "X" }),
  P("c3", { parentIds: ["c2"], congenitalCondition: "X" }),
];
const h = traceCondition("x", halka);
eq(h.affected.length, 3, "döngüde de kişiler bulunur");
eq(h.generationsSpanned, 3, "döngüde üst sınır düğüm sayısı");

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
