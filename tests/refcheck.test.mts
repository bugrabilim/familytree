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

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
