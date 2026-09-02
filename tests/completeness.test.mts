import { completeness, lineLabelKey, MAX_DEPTH } from "../lib/completeness.ts";
import type { Person } from "../types/family.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) {
  if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); }
}
function eq<T>(got: T, want: T, msg: string) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) ok++; else { fail++; console.log(`✗ ${msg}: bekl ${w}, geldi ${g}`); }
}

const P = (
  id: string,
  gender: "male" | "female" | "unknown",
  parentIds: string[] = [],
  extra: Partial<Person> = {}
): Person => ({
  id, firstName: id, lastName: "X", gender, parentIds, spouseIds: [], ...extra,
} as Person);

/**
 * Tam ikili ağaç üretici: kökten `depth` göbek yukarı, tüm yuvalar dolu.
 * Kimlikler yol adına eşit ("F", "MM", …), kök "".
 */
function fullTree(depth: number): Person[] {
  const out: Person[] = [];
  const build = (path: string, d: number): string => {
    const id = path === "" ? "root" : path;
    const parents: string[] = [];
    if (d < depth) {
      parents.push(build(path + "F", d + 1), build(path + "M", d + 1));
    }
    const last = path.slice(-1);
    out.push(P(id, path === "" ? "male" : last === "F" ? "male" : "female", parents));
    return id;
  };
  build("", 0);
  return out;
}

/* --- Tam ağaç ----------------------------------------------------------- */

const full7 = completeness("root", fullTree(7));
eq(full7.unbrokenDepth, 7, "tam ağaçta 7 göbek kesintisiz");
eq(full7.deepestChain, 7, "tam ağaçta en uzun zincir 7");
eq(full7.total, 254, "7 göbekte 254 yuva");
eq(full7.known, 254, "tam ağaçta 254 ata bilinir");
eq(full7.gaps.length, 0, "tam ağaçta boşluk yok");
eq(full7.generations.map((g) => g.total), [2, 4, 8, 16, 32, 64, 128], "göbek başına yuva");
eq(full7.generations.map((g) => g.known), [2, 4, 8, 16, 32, 64, 128], "göbek başına bilinen");

// 7'den derin ağaçta bile 7 ile sınırlı sayılır
const full9 = completeness("root", fullTree(9));
eq(full9.known, 254, "9 göbeklik ağaçta da 254 sayılır");
eq(full9.deepestChain, 7, "sayım MAX_DEPTH ile sınırlı");
eq(MAX_DEPTH, 7, "yedi göbek sabiti");

/* --- Boş / eksik -------------------------------------------------------- */

const alone = completeness("root", [P("root", "male")]);
eq(alone.unbrokenDepth, 0, "yalnız kişide 0 göbek");
eq(alone.known, 0, "yalnız kişide bilinen ata yok");
eq(alone.gaps.length, 2, "yalnız kişide iki boşluk (anne+baba)");
eq(alone.gaps.map((g) => g.missing).sort(), ["father", "mother"], "boşluklar anne ve baba");
eq(alone.gaps[0].childId, "root", "boşluğun çocuğu kök");

eq(completeness("yok", [P("root", "male")]).known, 0, "olmayan kök → boş sonuç");
eq(completeness("root", []).gaps.length, 0, "boş ağaç → boşluk yok");

/* --- ASIL MESELE: anne hattı ayrı puanlanmalı --------------------------- */

// Baba tarafı 3 göbek dolu, anne tarafı hiç yok (e-Devlet'in bıraktığı hâl)
const paternalOnly: Person[] = [
  P("root", "male", ["f", "m"]),
  P("m", "female"),                       // anne var, onun ebeveyni yok
  P("f", "male", ["ff", "fm"]),
  P("ff", "male", ["fff", "ffm"]),
  P("fm", "female"),
  P("fff", "male"), P("ffm", "female"),
];
const pat = completeness("root", paternalOnly);
eq(pat.unbrokenDepth, 1, "anne tarafı boşken kesintisiz derinlik 1");
eq(pat.deepestChain, 3, "baba tarafından 3 göbek inilebiliyor");

const fLine = pat.lines.find((l) => l.path === "F")!;
const mLine = pat.lines.find((l) => l.path === "M")!;
check(fLine.known > mLine.known, `baba hattı anne hattından dolu (${fLine.known} > ${mLine.known})`);
eq(mLine.known, 1, "anne hattında yalnız annenin kendisi");
eq(pat.weakest?.path, "M", "en zayıf hat: anne hattı");

// Aynı ağacın aynası — bu kez anne tarafı dolu
const maternalOnly = paternalOnly.map((p) => {
  const flip = (id: string) => id.replace(/f/g, "@").replace(/m/g, "f").replace(/@/g, "m");
  return P(
    p.id === "root" ? "root" : flip(p.id),
    p.gender === "male" ? "female" : "male",
    p.parentIds.map(flip)
  );
});
const mat = completeness("root", maternalOnly);
eq(mat.weakest?.path, "F", "ayna ağaçta en zayıf hat: baba hattı");
eq(mat.deepestChain, 3, "ayna ağaçta da 3 göbek");

/* --- Dört büyük hat ayrı sayılır ---------------------------------------- */

const fourLines = completeness("root", paternalOnly);
const mm = fourLines.lines.find((l) => l.path === "MM");
eq(mm?.known, 0, "anneanne hattı boş");
const ff = fourLines.lines.find((l) => l.path === "FF");
check((ff?.known ?? 0) >= 3, `baba tarafı dede hattı dolu (${ff?.known})`);
eq(fourLines.lines.map((l) => l.path), ["F", "M", "FF", "FM", "MF", "MM"], "altı hat");

/* --- Kan bağı: evlatlık sayılmaz ---------------------------------------- */

const adopted: Person[] = [
  P("root", "male", ["af", "am"], {
    parentLinks: { af: { kind: "adoptive" }, am: { kind: "adoptive" } },
  }),
  P("af", "male"), P("am", "female"),
];
eq(completeness("root", adopted).known, 0, "evlat edinen ebeveyn kan sayacına girmez");
eq(completeness("root", adopted).gaps.length, 2, "evlatlıkta iki boşluk kalır");
eq(completeness("root", adopted, { biologicalOnly: false }).known, 2,
  "biologicalOnly:false ile evlatlık sayılır");

// kind belirtilmemişse biyolojik sayılır
const noKind: Person[] = [P("root", "male", ["f"]), P("f", "male")];
eq(completeness("root", noKind).known, 1, "kind yoksa biyolojik sayılır");

const stepped: Person[] = [
  P("root", "male", ["f", "s"], { parentLinks: { s: { kind: "step" } } }),
  P("f", "male"), P("s", "female"),
];
eq(completeness("root", stepped).known, 1, "üvey ebeveyn sayılmaz");

/* --- Belirsiz cinsiyet → sıraya göre yuva ------------------------------- */

const unknownGender: Person[] = [
  P("root", "male", ["a", "b"]),
  P("a", "unknown"), P("b", "unknown"),
];
const ug = completeness("root", unknownGender);
eq(ug.known, 2, "cinsiyeti belirsiz iki ebeveyn de sayılır");
eq(ug.unbrokenDepth, 1, "belirsiz cinsiyette de 1. göbek dolu");

// Tek ebeveyn, cinsiyeti belirsiz → baba yuvasına
const oneUnknown: Person[] = [P("root", "male", ["a"]), P("a", "unknown")];
eq(
  completeness("root", oneUnknown).gaps.filter((g) => g.generation === 1).map((g) => g.missing),
  ["mother"],
  "tek belirsiz ebeveyn baba yuvasına, 1. göbekte yalnız anne boş kalır"
);

// İki anne → biri anne yuvası, diğeri boş babaya
const twoMothers: Person[] = [
  P("root", "male", ["m1", "m2"]),
  P("m1", "female"), P("m2", "female"),
];
eq(completeness("root", twoMothers).known, 2, "iki kadın ebeveyn de sayılır");

/* --- Boşluklar eyleme dönük olmalı -------------------------------------- */

const gapped: Person[] = [
  P("root", "male", ["f", "m"]),
  P("f", "male", ["ff"]), P("ff", "male"),
  P("m", "female"),
];
const g = completeness("root", gapped);
check(g.gaps.length > 0, "eksik ağaçta boşluk var");
check(g.gaps.every((x) => gapped.some((p) => p.id === x.childId)),
  "her boşluk mevcut bir kişiye bağlı");
eq(g.gaps[0].generation, 2, "en yakın boşluk 2. göbekte");
check(g.gaps.some((x) => x.childId === "m" && x.missing === "father"),
  "annenin babası eksik olarak işaretlendi");
check(g.gaps.some((x) => x.childId === "f" && x.missing === "mother"),
  "babanın annesi eksik olarak işaretlendi");
// Boşluklar göbeğe göre sıralı
check(g.gaps.every((x, i, arr) => i === 0 || arr[i - 1].generation <= x.generation),
  "boşluklar yakından uzağa sıralı");
eq(completeness("root", gapped, { gapLimit: 2 }).gaps.length, 2, "gapLimit uygulanıyor");

/* --- Döngüye karşı güvenlik --------------------------------------------- */

const cycle: Person[] = [
  P("a", "male", ["b"]),
  P("b", "female", ["a"]),
];
const cy = completeness("a", cycle);
check(cy.deepestChain <= MAX_DEPTH, `döngüde sonlanıyor (zincir ${cy.deepestChain})`);
check(cy.known > 0, "döngüde de sayım üretiliyor");

/* --- maxDepth ayarı ------------------------------------------------------ */

const d3 = completeness("root", fullTree(7), { maxDepth: 3 });
eq(d3.total, 14, "3 göbekte 14 yuva");
eq(d3.known, 14, "3 göbekte 14 bilinen");
eq(d3.unbrokenDepth, 3, "3 göbek kesintisiz");

/* --- Hat etiketleri ------------------------------------------------------ */

eq(lineLabelKey("MM"), "lineage.maternalGrandmother", "anneanne anahtarı");
eq(lineLabelKey("FM"), "lineage.paternalGrandmother", "babaanne anahtarı");
eq(lineLabelKey("MMF"), null, "adı olmayan yol → null");

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
