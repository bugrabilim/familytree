import type { Bond } from "../types/bond.ts";
import { BOND_TYPES } from "../types/bond.ts";
import {
  BOND_STYLES,
  MAX_NOTE,
  bondBetween,
  bondTypeKey,
  bondsOf,
  countByType,
  isBondType,
  normalizeBond,
  normalizeBonds,
  orderPair,
  otherEnd,
  pairKey,
  pruneBonds,
  zigzagPoints,
} from "../lib/bonds.ts";

let ok = 0, fail = 0;
function eq<T>(got: T, want: T, msg: string) {
  if (JSON.stringify(got) === JSON.stringify(want)) ok++;
  else { fail++; console.log(`✗ ${msg}: bekl ${JSON.stringify(want)}, geldi ${JSON.stringify(got)}`); }
}
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

const NOW = "2026-01-01T00:00:00.000Z";
const bond = (o: Partial<Bond>): Bond => ({
  id: "x", a: "a1", b: "b1", type: "yakin", createdAt: NOW, updatedAt: NOW, ...o,
});

/* --- Yönsüzlük: bu dosyanın tek asıl kuralı ----------------------------- */
eq(pairKey("veli", "ali"), pairKey("ali", "veli"), "pairKey uç sırasından bağımsız");
eq(orderPair("veli", "ali"), ["ali", "veli"], "orderPair sıralar");
eq(orderPair("ali", "veli"), ["ali", "veli"], "zaten sıralıysa dokunmaz");
check(pairKey("ali", "veli") !== pairKey("ali", "vel"), "farklı çift farklı anahtar");
// Kimliklerde boşluk geçemediği için ayırıcı çakışması olamaz.
check(!pairKey("a-b_1", "c-d_2").includes("  "), "anahtarda çift boşluk yok");

/* --- otherEnd ----------------------------------------------------------- */
eq(otherEnd(bond({ a: "x", b: "y" }), "x"), "y", "a ucundan bakınca b");
eq(otherEnd(bond({ a: "x", b: "y" }), "y"), "x", "b ucundan bakınca a");
eq(otherEnd(bond({ a: "x", b: "y" }), "z"), undefined, "uçta olmayan kişi → undefined");

/* --- normalizeBond: reddedilenler --------------------------------------- */
eq(normalizeBond({ a: "x", type: "yakin" }, NOW), null, "tek uçlu bağ reddedilir");
eq(normalizeBond({ a: "x", b: "x", type: "yakin" }, NOW), null, "kişinin kendisiyle bağı reddedilir");
eq(normalizeBond({ a: "x", b: "y" }, NOW), null, "türsüz bağ reddedilir");
eq(normalizeBond({ a: "x", b: "y", type: "dostane" as never }, NOW), null, "bilinmeyen tür reddedilir");
eq(normalizeBond({ a: " ", b: "y", type: "yakin" }, NOW), null, "boşluktan ibaret uç reddedilir");

/* --- normalizeBond: kabul edilenler ------------------------------------- */
{
  const b = normalizeBond({ a: "veli", b: "ali", type: "catismali" }, NOW)!;
  eq([b.a, b.b], ["ali", "veli"], "kayıt kanonik sırayla saklanır");
  eq(b.type, "catismali", "tür korunur");
  eq(b.createdAt, NOW, "createdAt kurulur");
  check(!("note" in b), "boş not alanı hiç yazılmaz");
}
{
  const b = normalizeBond({ a: "x", b: "y", type: "kopuk", note: "  2012'den beri  " }, NOW)!;
  eq(b.note, "2012'den beri", "not kırpılır");
}
{
  const b = normalizeBond({ a: "x", b: "y", type: "yakin", note: "n".repeat(MAX_NOTE + 50) }, NOW)!;
  eq(b.note!.length, MAX_NOTE, "not sınırı uygulanır");
}
{
  // Güncelleme: yalnız tür değişiyor, uçlar ve createdAt korunuyor.
  const eski = bond({ id: "k1", a: "ali", b: "veli", type: "yakin", createdAt: "2020-01-01T00:00:00.000Z" });
  const b = normalizeBond({ type: "mesafeli" }, NOW, eski)!;
  eq([b.id, b.a, b.b, b.type], ["k1", "ali", "veli", "mesafeli"], "güncellemede uçlar korunur");
  eq(b.createdAt, "2020-01-01T00:00:00.000Z", "createdAt güncellemede korunur");
  eq(b.updatedAt, NOW, "updatedAt tazelenir");
}
{
  // Notu SİLMEK mümkün olmalı: boş dize gönderilirse alan kalkar.
  const eski = bond({ note: "eski not" });
  const b = normalizeBond({ note: "" }, NOW, eski)!;
  check(!("note" in b), "boş dize notu siler");
  const c = normalizeBond({}, NOW, eski)!;
  eq(c.note, "eski not", "not gönderilmezse korunur");
}

/* --- normalizeBonds: depodan okuma -------------------------------------- */
{
  const ham = [
    { id: "1", a: "veli", b: "ali", type: "yakin", createdAt: NOW, updatedAt: NOW },
    // Aynı çift, ters sırada → KOPYA, elenmeli.
    { id: "2", a: "ali", b: "veli", type: "kopuk", createdAt: NOW, updatedAt: NOW },
    { id: "3", a: "ali", b: "ali", type: "yakin" },          // kendisiyle
    { id: "4", a: "ali", type: "yakin" },                     // tek uç
    { id: "5", a: "ali", b: "ayse", type: "sıcak" },          // bilinmeyen tür
    { a: "ali", b: "fatma", type: "yakin" },                  // id yok
    null,
    "bond",
  ];
  const out = normalizeBonds(ham);
  eq(out.length, 1, "yalnız geçerli ve tekil kayıt kalır");
  eq(out[0].id, "1", "kopyada İLK kayıt kazanır");
  eq([out[0].a, out[0].b], ["ali", "veli"], "okurken de kanonik sıraya sokulur");
  eq(normalizeBonds(null), [], "dizi olmayan girdi boş liste");
  eq(normalizeBonds({ bonds: [] }), [], "nesne girdi boş liste");
}
{
  // Tarihi olmayan eski kayıt okunabilir kalmalı, atılmamalı.
  const out = normalizeBonds([{ id: "1", a: "x", b: "y", type: "yakin" }]);
  eq(out.length, 1, "tarihsiz kayıt atılmaz");
  eq(out[0].createdAt, new Date(0).toISOString(), "tarihsize sıfır tarih verilir");
}

/* --- pruneBonds: silinen kişinin bağı ----------------------------------- */
{
  const liste = [
    bond({ id: "1", a: "ali", b: "veli" }),
    bond({ id: "2", a: "ali", b: "silinmis" }),
  ];
  eq(pruneBonds(liste, ["ali", "veli"]).map((x) => x.id), ["1"], "öksüz bağ ayıklanır");
  eq(pruneBonds(liste, new Set(["ali", "veli", "silinmis"])).length, 2, "hepsi varsa hepsi kalır");
  eq(pruneBonds(liste, []).length, 0, "hiç kişi yoksa hiç bağ yok");
}

/* --- bondsOf / bondBetween ---------------------------------------------- */
{
  const liste = [
    bond({ id: "1", a: "ali", b: "veli" }),
    bond({ id: "2", a: "ali", b: "ayse" }),
    bond({ id: "3", a: "veli", b: "ayse" }),
  ];
  eq(bondsOf(liste, "ali").map((x) => x.id), ["1", "2"], "kişiye dokunan bağlar");
  eq(bondsOf(liste, "yok").length, 0, "bağsız kişi");
  eq(bondBetween(liste, "veli", "ali")?.id, "1", "çift araması yönsüz");
  eq(bondBetween(liste, "ali", "yok"), undefined, "olmayan çift");
}

/* --- Türler ------------------------------------------------------------- */
eq(BOND_TYPES.length, 6, "altı tür");
check(new Set(BOND_TYPES).size === BOND_TYPES.length, "türler tekil");
for (const t of BOND_TYPES) {
  check(isBondType(t), `${t} geçerli tür`);
  check(!!BOND_STYLES[t], `${t} için çizim biçimi tanımlı`);
  eq(bondTypeKey(t), `bond.type.${t}`, `${t} i18n anahtarı`);
}
check(!isBondType("yakın"), "Türkçe karakterli varyant tür değil");
check(!isBondType(undefined), "undefined tür değil");

/*
 * Biçimler AYIRT EDİCİ olmalı. İki tür aynı kalınlık + desen + çizgi
 * sayısını paylaşırsa çizimde ayırt edilemezler; renk eklemek de çözüm
 * değil, çünkü renk körü okur için yine tek çizgi kalır.
 */
{
  const imza = BOND_TYPES.map((t) => {
    const s = BOND_STYLES[t];
    return `${s.lines}|${s.strokeWidth}|${s.dash}|${s.zigzag}`;
  });
  eq(new Set(imza).size, BOND_TYPES.length, "her türün çizim imzası benzersiz");
}

/* --- countByType -------------------------------------------------------- */
{
  const c = countByType([
    bond({ type: "yakin" }),
    bond({ type: "yakin" }),
    bond({ type: "kopuk" }),
  ]);
  eq(c.yakin, 2, "iki yakın");
  eq(c.kopuk, 1, "bir kopuk");
  eq(c.mesafeli, 0, "hiç olmayan tür sıfır (eksik değil)");
  eq(Object.keys(countByType([])).length, BOND_TYPES.length, "boş listede de tüm türler anahtarlı");
}

/* --- zigzagPoints ------------------------------------------------------- */
{
  const p = zigzagPoints(0, 0, 100, 0);
  eq(p[0], [0, 0], "ilk nokta başlangıç ucu");
  eq(p[p.length - 1], [100, 0], "son nokta bitiş ucu");
  check(p.length > 2, "arada salınım noktaları var");
  // Salınım dik yönde: yatay çizgide y değişmeli, uçlar hariç.
  check(p.slice(1, -1).every(([, y]) => Math.abs(y) > 0), "ara noktalar eksende değil");
  check(p.slice(1, -1).some(([, y]) => y > 0) && p.slice(1, -1).some(([, y]) => y < 0),
    "salınım iki yöne de gidiyor");
}
{
  // Çok kısa mesafede zikzak çizmek anlamsız — düz çizgiye düşer.
  const p = zigzagPoints(0, 0, 5, 0);
  eq(p, [[0, 0], [5, 0]], "kısa mesafede düz çizgi");
}
{
  // Sıfır uzunluk: hypot 0 → 0'a bölme olmamalı.
  const p = zigzagPoints(10, 10, 10, 10);
  eq(p, [[10, 10], [10, 10]], "aynı noktada NaN üretmez");
  check(p.flat().every((n) => Number.isFinite(n)), "sonlu sayılar");
}

console.log(`${ok} geçti, ${fail} kaldı`);
if (fail) process.exit(1);
