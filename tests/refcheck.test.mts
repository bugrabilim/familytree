import { findRefIssues, repairRefs, type RefIssueKind } from "../lib/refcheck.ts";
import type { Person } from "../types/family.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) {
  if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); }
}
function eq<T>(got: T, want: T, msg: string) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) ok++; else { fail++; console.log(`✗ ${msg}: bekl ${w}, geldi ${g}`); }
}
const kinds = (people: Person[]): RefIssueKind[] =>
  [...new Set(findRefIssues(people).map((i) => i.kind))].sort();

const P = (id: string, extra: Partial<Person> = {}): Person => ({
  id, firstName: id, lastName: "X", gender: "unknown",
  parentIds: [], spouseIds: [], ...extra,
} as Person);

/* --- Temiz ağaçta hiç sorun olmamalı ------------------------------------ */

const clean: Person[] = [
  P("a", { spouseIds: ["b"], parentIds: ["c"], parentLinks: { c: { kind: "biological" } } }),
  P("b", { spouseIds: ["a"] }),
  P("c"),
];
eq(findRefIssues(clean), [], "temiz ağaçta sorun yok");
eq(repairRefs(clean).applied, [], "temiz ağaçta onarım yok");
eq(findRefIssues([]), [], "boş ağaçta sorun yok");

/* --- Sarkan referanslar -------------------------------------------------- */

const dangling: Person[] = [
  P("a", { parentIds: ["yok"], spouseIds: ["yok2"], formerSpouseIds: ["yok3"] }),
];
eq(kinds(dangling), ["danglingFormerSpouse", "danglingParent", "danglingSpouse"],
  "üç sarkan tür de bulunur");

const r1 = repairRefs(dangling);
eq(r1.people[0].parentIds, [], "sarkan ebeveyn temizlendi");
eq(r1.people[0].spouseIds, [], "sarkan eş temizlendi");
eq(r1.people[0].formerSpouseIds, [], "sarkan eski eş temizlendi");
eq(findRefIssues(r1.people), [], "onarım sonrası sorun kalmadı");
eq(r1.applied.length, 3, "üç onarım uygulandı");

// Girdi DEĞİŞMEMELİ — iyimser kilit akışı buna bağlı
eq(dangling[0].parentIds, ["yok"], "onarım girdiyi değiştirmez");
check(r1.people[0] !== dangling[0], "yeni nesne döndürülür");

/* --- Sarkan çevre bağı --------------------------------------------------- */

const assoc: Person[] = [
  P("a", { associations: [
    { id: "1", personId: "yok", type: "kirve" },
    { id: "2", personId: "b", type: "komsu" },
  ] }),
  P("b"),
];
eq(kinds(assoc), ["danglingAssociation"], "sarkan çevre bağı bulunur");
const r2 = repairRefs(assoc);
eq(r2.people[0].associations?.map((a) => a.personId), ["b"], "yalnız sarkan bağ silindi");

/* --- Öksüz parentLink ---------------------------------------------------- */

const orphanLink: Person[] = [
  P("a", { parentIds: ["b"], parentLinks: { b: { kind: "step" }, silinmis: { kind: "adoptive" } } }),
  P("b"),
];
eq(kinds(orphanLink), ["orphanParentLink"], "öksüz parentLink bulunur");
const r3 = repairRefs(orphanLink);
eq(Object.keys(r3.people[0].parentLinks ?? {}), ["b"], "öksüz anahtar silindi, geçerli kaldı");
eq(r3.people[0].parentLinks?.b?.kind, "step", "geçerli bağın niteliği korundu");

/* --- Kendine referans ---------------------------------------------------- */

const selfRef: Person[] = [
  P("a", { parentIds: ["a"], spouseIds: ["a"], associations: [{ id: "1", personId: "a", type: "dost" }] }),
];
eq(kinds(selfRef), ["selfReference"], "kendine referans bulunur");
eq(findRefIssues(selfRef).length, 3, "üç alanda birden bulunur");
const r4 = repairRefs(selfRef);
eq(r4.people[0].parentIds, [], "kendi ebeveynliği silindi");
eq(r4.people[0].spouseIds, [], "kendi eşliği silindi");
eq(r4.people[0].associations, [], "kendi çevre bağı silindi");

/* --- Yinelenen giriş ----------------------------------------------------- */

const dup: Person[] = [
  P("a", { parentIds: ["b", "b"], spouseIds: ["c", "c", "c"] }),
  P("b"), P("c", { spouseIds: ["a"] }),
];
eq(kinds(dup), ["duplicateParent", "duplicateSpouse"], "yinelenenler bulunur");
check(findRefIssues(dup).every((i) => i.kind === "duplicateParent" || i.severity === "warning"),
  "yinelenen kaydı uyarı düzeyinde");
const r5 = repairRefs(dup);
eq(r5.people[0].parentIds, ["b"], "yinelenen ebeveyn teke indi");
eq(r5.people[0].spouseIds, ["c"], "yinelenen eş teke indi");

/* --- Eş simetrisi -------------------------------------------------------- */

const asym: Person[] = [P("a", { spouseIds: ["b"] }), P("b")];
eq(kinds(asym), ["asymmetricSpouse"], "tek yönlü eş bağı bulunur");
const r6 = repairRefs(asym);
eq(r6.people.find((p) => p.id === "b")?.spouseIds, ["a"],
  "simetrikleştirme eksik geri referansı EKLER, bağı silmez");
eq(findRefIssues(r6.people), [], "simetriden sonra sorun kalmadı");

// Sarkan + asimetrik birlikte: önce temizlik, sonra simetri
const mixed: Person[] = [P("a", { spouseIds: ["b", "yok"] }), P("b")];
const r7 = repairRefs(mixed);
eq(r7.people[0].spouseIds, ["b"], "sarkan silindi");
eq(r7.people[1].spouseIds, ["a"], "kalan bağ simetrikleşti");
eq(findRefIssues(r7.people), [], "karışık durumda da temiz");

/* --- BİLEREK onarılmayanlar ---------------------------------------------- */

const dupId: Person[] = [P("a", { firstName: "Birinci" }), P("a", { firstName: "İkinci" })];
eq(kinds(dupId), ["duplicateId"], "yinelenen kimlik bulunur");
check(findRefIssues(dupId).every((i) => !i.repairable), "yinelenen kimlik onarılamaz işaretli");
const r8 = repairRefs(dupId);
eq(r8.applied, [], "yinelenen kimliğe dokunulmaz");
eq(r8.skipped.length, 1, "atlananlarda bildirilir");
eq(r8.people.length, 2, "kayıt silinmez");

const bothSpouse: Person[] = [
  P("a", { spouseIds: ["b"], formerSpouseIds: ["b"] }),
  P("b", { spouseIds: ["a"] }),
];
check(kinds(bothSpouse).includes("spouseAlsoFormer"), "eş+eski eş çelişkisi bulunur");
const r9 = repairRefs(bothSpouse);
check(r9.skipped.some((i) => i.kind === "spouseAlsoFormer"), "çelişki atlananlarda");
eq(r9.people[0].spouseIds, ["b"], "eş bağı korundu");
eq(r9.people[0].formerSpouseIds, ["b"], "eski eş bağı da korundu — niyet tahmin edilmez");

/* --- Kademeli onarım (only) ---------------------------------------------- */

const many: Person[] = [
  P("a", { parentIds: ["yok"], spouseIds: ["b"] }),
  P("b"),
];
const partial = repairRefs(many, ["danglingParent"]);
eq(partial.people[0].parentIds, [], "seçilen tür onarıldı");
eq(partial.people[1].spouseIds, [], "seçilmeyen tür (simetri) dokunulmadı");
check(partial.skipped.some((i) => i.kind === "asymmetricSpouse"), "onarılmayan tür atlananlarda");

/* --- Gerçekçi senaryo: kişi silindi -------------------------------------- */

// "dede" silinmiş; ondan geriye baba'nın parentIds'inde ve nine'nin
// spouseIds'inde referans kalmış, ayrıca parentLinks anahtarı öksüz.
const afterDelete: Person[] = [
  P("baba", { parentIds: ["dede", "nine"], parentLinks: { dede: { kind: "biological" }, nine: {} } }),
  P("nine", { spouseIds: ["dede"] }),
  P("cocuk", { parentIds: ["baba"] }),
];
// parentLinks.dede HÂLÂ parentIds içinde olduğundan öksüz DEĞİL — asıl sorun
// sarkan parentIds girdisi. Aynı kök nedeni iki kez bildirmeyiz.
eq(kinds(afterDelete), ["danglingParent", "danglingSpouse"],
  "silme sonrası iki kalıntı türü, öksüz link değil");
const r10 = repairRefs(afterDelete);
eq(findRefIssues(r10.people), [], "silme kalıntıları tamamen temizlendi");
eq(r10.people.find((p) => p.id === "baba")?.parentIds, ["nine"], "geçerli ebeveyn korundu");
// Kaskad: sarkan parentIds silinince ona ait parentLinks anahtarı da gider
eq(Object.keys(r10.people.find((p) => p.id === "baba")?.parentLinks ?? {}), ["nine"],
  "sarkan ebeveynin parentLinks anahtarı kaskadla silindi");
eq(r10.people.find((p) => p.id === "cocuk")?.parentIds, ["baba"], "ilgisiz bağlar korundu");
eq(r10.people.length, 3, "hiçbir kişi silinmedi");

/* --- Onarım kararlı (idempotent) olmalı ---------------------------------- */

const twice = repairRefs(repairRefs(afterDelete).people);
eq(twice.applied, [], "ikinci onarımda yapacak iş kalmaz");

/* --- H1: `only` GERÇEKTEN sınırlamalı ------------------------------------ */

// Önceki sürümde temizlik körlemesine koşuyordu: `only` verilse bile istenmeyen
// alanlarda silme oluyor, üstelik o silme `skipped` diye raporlanıyordu.
const h1: Person[] = [
  P("a", { spouseIds: ["b"], parentIds: ["HAYALET"] }),
  P("b", { spouseIds: [] }),
];
const only1 = repairRefs(h1, ["asymmetricSpouse"]);
eq(only1.people[0].parentIds, ["HAYALET"], "only dışındaki sarkan referans KORUNUR");
eq(only1.people[1].spouseIds, ["a"], "only içindeki simetri uygulanır");
check(only1.skipped.some((i) => i.kind === "danglingParent"), "dokunulmayan sorun skipped'ta");
check(!only1.applied.some((i) => i.kind === "danglingParent"), "dokunulmayan sorun applied'da DEĞİL");

// Rapor ile gerçek örtüşmeli: skipped denen hiçbir şey değişmemiş olmalı
const before1 = JSON.stringify(h1[0]);
check(JSON.stringify({ ...only1.people[0], spouseIds: h1[0].spouseIds }) === before1,
  "skipped edilen alanlar bire bir korunmuş");

// Tersi de doğru olmalı
const only2 = repairRefs(h1, ["danglingParent"]);
eq(only2.people[0].parentIds, [], "seçilen tür onarılır");
eq(only2.people[1].spouseIds, [], "seçilmeyen simetri uygulanmaz");

// Yinelenenler de only'ye uymalı
const dupOnly: Person[] = [P("a", { parentIds: ["b", "b"], spouseIds: ["c", "c"] }), P("b"), P("c", { spouseIds: ["a"] })];
const dOnly = repairRefs(dupOnly, ["duplicateParent"]);
eq(dOnly.people[0].parentIds, ["b"], "seçilen yinelenen tekilleşir");
eq(dOnly.people[0].spouseIds, ["c", "c"], "seçilmeyen yinelenen KORUNUR");

// Kendine referans da only'ye uymalı
const selfOnly: Person[] = [P("a", { parentIds: ["a"], spouseIds: ["a"] })];
eq(repairRefs(selfOnly, []).people[0].parentIds, ["a"], "boş only hiçbir şeyi silmez");

/* --- H2: onarım YENİ sorun doğurmamalı ----------------------------------- */

// A "hâlâ evliyiz" diyor, B "boşandık" diyor. Geri referans eklemek
// `spouseAlsoFormer` doğururdu — o da onarılamaz. Onarım onaramayacağı bir
// sorun üretmemeli; bu kayıt onarılamaz işaretlenir.
const h2: Person[] = [
  P("a", { spouseIds: ["b"] }),
  P("b", { spouseIds: [], formerSpouseIds: ["a"] }),
];
const disagreement = findRefIssues(h2).find((i) => i.kind === "asymmetricSpouse")!;
eq(disagreement.repairable, false, "karşı taraf 'eski eş' diyorsa asimetri onarılamaz");
const fixed2 = repairRefs(h2);
check(!findRefIssues(fixed2.people).some((i) => i.kind === "spouseAlsoFormer"),
  "onarım spouseAlsoFormer DOĞURMUYOR");
eq(fixed2.people[1].spouseIds, [], "çelişkili bağ eklenmedi");
eq(fixed2.people[1].formerSpouseIds, ["a"], "eski eş kaydı korundu");
check(fixed2.skipped.some((i) => i.kind === "asymmetricSpouse"), "anlaşmazlık bildirildi");

// Karşı taraf eski eş DEMİYORSA normal simetrikleştirme sürmeli
const plainPair: Person[] = [P("a", { spouseIds: ["b"] }), P("b")];
eq(findRefIssues(plainPair).find((i) => i.kind === "asymmetricSpouse")?.repairable, true,
  "çelişki yoksa asimetri onarılabilir");
eq(repairRefs(plainPair).people[1].spouseIds, ["a"], "çelişki yoksa simetrikleşir");

/* --- DEĞİŞMEZ: onarım hiçbir zaman yeni sorun doğurmamalı ---------------- */

// Rastgele bozuk ağaçlarda: onarım sonrası sorun kümesi, öncekinin ALT KÜMESİ
// olmalı — onarım hiçbir yeni tür üretmemeli.
function randTree(seed: number): Person[] {
  let x = seed;
  const rnd = () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
  const n = 3 + Math.floor(rnd() * 6);
  const ids = Array.from({ length: n }, (_, i) => `p${i}`);
  return ids.map((id) => {
    const pick = () => (rnd() < 0.25 ? "HAYALET" : ids[Math.floor(rnd() * n)]);
    const e: Partial<Person> = {};
    if (rnd() < 0.6) e.parentIds = [pick(), pick()].slice(0, 1 + Math.floor(rnd() * 2));
    if (rnd() < 0.6) e.spouseIds = [pick()];
    if (rnd() < 0.3) e.formerSpouseIds = [pick()];
    if (rnd() < 0.3) e.parentLinks = { [pick()]: { kind: "step" } };
    return P(id, e);
  });
}
let born = 0, checked = 0;
for (let seed = 1; seed <= 300; seed++) {
  const tree = randTree(seed);
  const beforeKinds = new Set(findRefIssues(tree).map((i) => i.kind));
  const after = repairRefs(tree);
  const afterKinds = new Set(findRefIssues(after.people).map((i) => i.kind));
  checked++;
  for (const k of afterKinds) if (!beforeKinds.has(k)) { born++; console.log(`  ✗ tohum ${seed}: onarım ${k} doğurdu`); }
}
eq(born, 0, `300 rastgele ağaçta onarım yeni sorun türü doğurmadı (${checked} ağaç)`);

// Ve onarım hâlâ idempotent
let notIdem = 0;
for (let seed = 1; seed <= 300; seed++) {
  const once = repairRefs(randTree(seed)).people;
  if (repairRefs(once).applied.length !== 0) notIdem++;
}
eq(notIdem, 0, "300 rastgele ağaçta onarım idempotent");

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
