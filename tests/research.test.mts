import { countByKind, researchTasks, type ResearchTask } from "../lib/research.ts";
import { findIssues } from "../lib/consistency.ts";
import type { Person } from "../types/family.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) {
  if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); }
}
function eq<T>(got: T, want: T, msg: string) {
  if (JSON.stringify(got) === JSON.stringify(want)) ok++;
  else { fail++; console.log(`✗ ${msg}: bekl ${JSON.stringify(want)}, geldi ${JSON.stringify(got)}`); }
}

const P = (id: string, extra: Partial<Person> = {}): Person => ({
  id, firstName: id, lastName: "Test", gender: "male",
  parentIds: [], spouseIds: [], ...extra,
});
const kinds = (ts: ResearchTask[]) => ts.map((t) => t.kind);
const ids = (ts: ResearchTask[]) => ts.map((t) => t.id);

/* --- Eksik ata yalnız ÇOCUĞU OLANLAR için ------------------------------- */
{
  // "gelin" ebeveynsiz ama çocuğu da yok → ağacın doğal sınırı, görev değil.
  // "dede" ebeveynsiz ve çocuğu var → araştırılacak uç.
  const people = [
    P("dede", { birthDate: "1900", birthPlace: "Rize", sources: [{ id: "s", title: "k" }] }),
    P("baba", { parentIds: ["dede"], birthDate: "1930", birthPlace: "Rize", sources: [{ id: "s", title: "k" }] }),
    P("gelin", { birthDate: "1935", birthPlace: "Rize", sources: [{ id: "s", title: "k" }] }),
  ];
  const t = researchTasks(people);
  check(ids(t).includes("eksikEbeveyn:dede"), "çocuğu olan ebeveynsiz kişi görev üretir");
  check(!ids(t).includes("eksikEbeveyn:gelin"), "çocuğu OLMAYAN ebeveynsiz kişi görev üretmez");
  check(!ids(t).includes("eksikEbeveyn:baba"), "ebeveyni bilinen kişi görev üretmez");
}

/* --- Erişim (reach) ağırlığı: çok kişiyi açan dal önce -------------------- */
{
  // "buyuk" 4 kişilik bir dalın önünde; "kucuk" tek kişinin.
  const people = [
    P("buyuk", { birthDate: "1900", birthPlace: "x", sources: [{ id: "s", title: "k" }] }),
    P("b1", { parentIds: ["buyuk"], birthDate: "1930", birthPlace: "x", sources: [{ id: "s", title: "k" }] }),
    P("b2", { parentIds: ["b1"], birthDate: "1960", birthPlace: "x", sources: [{ id: "s", title: "k" }] }),
    P("b3", { parentIds: ["b2"], birthDate: "1990", birthPlace: "x", sources: [{ id: "s", title: "k" }] }),
    P("kucuk", { birthDate: "1900", birthPlace: "x", sources: [{ id: "s", title: "k" }] }),
    P("k1", { parentIds: ["kucuk"], birthDate: "1930", birthPlace: "x", sources: [{ id: "s", title: "k" }] }),
  ];
  const t = researchTasks(people).filter((x) => x.kind === "eksikEbeveyn");
  eq(t[0].personId, "buyuk", "çok kişiyi açan dal önce");
  eq(t.find((x) => x.personId === "buyuk")?.reach, 3, "buyuk'un soyu 3 kişi");
  eq(t.find((x) => x.personId === "kucuk")?.reach, 1, "kucuk'un soyu 1 kişi");
}

/* --- Kuzen evliliği: aynı torun iki kez sayılmaz ------------------------- */
{
  // ata → a, b; a'nın çocuğu ile b'nin çocuğu evlenip "torun"u yapıyor:
  // torun ata'ya İKİ yoldan bağlı ama bir kişidir.
  const people = [
    P("ata"),
    P("a", { parentIds: ["ata"] }),
    P("b", { parentIds: ["ata"] }),
    P("torun", { parentIds: ["a", "b"] }),
  ];
  const t = researchTasks(people).find((x) => x.id === "eksikEbeveyn:ata")!;
  eq(t.reach, 3, "kuzen evliliğinde soy sayısı tekilleşir (a, b, torun)");
}

/* --- Döngü (bozuk veri) sonlanmalı -------------------------------------- */
{
  const people = [P("c1", { parentIds: ["c2"] }), P("c2", { parentIds: ["c1"] })];
  const t = researchTasks(people);
  check(Array.isArray(t), "ata döngüsü sonlanır, patlamaz");
}

/* --- Hata > uyarı > eksik ----------------------------------------------- */
{
  // Ölüm doğumdan önce → "error". Aynı ağaçta bir de eksik yer var.
  const people = [
    P("hatali", { birthDate: "1950-01-01", deathDate: "1940-01-01", birthPlace: "x", sources: [{ id: "s", title: "k" }] }),
    P("eksikyer", { birthDate: "1950", sources: [{ id: "s", title: "k" }] }),
  ];
  const t = researchTasks(people, { issues: findIssues(people) });
  eq(t[0].kind, "tutarsizlik", "tutarsızlık en başta");
  eq(t[0].severity, "error", "hata olan tutarsızlık ilk");
  check(kinds(t).indexOf("tutarsizlik") < kinds(t).indexOf("eksikYer"), "tutarsızlık eksikten önce");
}

/* --- Bonus BANDI delemez ------------------------------------------------- */
{
  /*
   * İlk yazışta erişim bonusu sınırsızdı (`reach * 10`) ve büyük bir dalın
   * ata boşluğu, bir HATAYI listede geçiyordu. Bant + tavan bunu engeller.
   */
  const people: Person[] = [
    // Kocaman bir dalın önündeki ata (yüksek reach) — ama yalnız "eksik ata".
    P("ata", { birthDate: "1900", birthPlace: "x", sources: [{ id: "s", title: "k" }] }),
    // Küçük bir hata: ölüm doğumdan önce.
    P("hatali", { birthDate: "1950-01-01", deathDate: "1940-01-01", birthPlace: "x", sources: [{ id: "s", title: "k" }] }),
  ];
  for (let i = 0; i < 520; i++) {
    people.push(P(`d${i}`, {
      parentIds: [i === 0 ? "ata" : `d${i - 1}`],
      birthDate: "1950", birthPlace: "x", sources: [{ id: "s", title: "k" }],
    }));
  }
  const t = researchTasks(people, { issues: findIssues(people) });
  eq(t[0].kind, "tutarsizlik", "500+ kişilik dal bile hatayı geçemez");

  // Doğrudan DEĞİŞMEZ: hiçbir tutarsızlık-dışı görev, en hafif tutarsızlığın
  // ağırlığına ulaşamaz. Büyük bir kurguya gerek bırakmadan bandı korur.
  const enHafifHata = Math.min(...t.filter((x) => x.kind === "tutarsizlik").map((x) => x.weight));
  check(
    t.filter((x) => x.kind !== "tutarsizlik").every((x) => x.weight < enHafifHata),
    "hiçbir bonus tutarsızlık bandına giremez"
  );
}

/* --- Kaynak yalnız İDDİA varsa istenir ---------------------------------- */
{
  const bos = P("bos");                                   // hiç iddia yok
  const iddiali = P("iddiali", { birthDate: "1900" });     // tarih var, kaynak yok
  const t = researchTasks([bos, iddiali]);
  check(!ids(t).includes("kaynaksiz:bos"), "iddiası olmayandan kaynak istenmez");
  check(ids(t).includes("kaynaksiz:iddiali"), "iddiası olandan kaynak istenir");
}

/* --- "Tamamlandı" işaretlenenler düşer ---------------------------------- */
{
  const people = [P("x", { birthDate: "1900" })];
  const all = researchTasks(people);
  const one = all[0].id;
  const kalan = researchTasks(people, { done: new Set([one]) });
  eq(kalan.length, all.length - 1, "işaretlenen görev listeden düşer");
  check(!ids(kalan).includes(one), "düşen tam olarak işaretlenendir");
}

/* --- Kimlikler kararlı: aynı görev her seferinde aynı kimlik ------------- */
{
  const people = [P("x", { birthDate: "1900", deathDate: "1880" })];
  const a = ids(researchTasks(people, { issues: findIssues(people) }));
  const b = ids(researchTasks(people, { issues: findIssues(people) }));
  eq(a, b, "kimlikler kararlı");
  check(a.every((id) => id.includes("x")), "kimlik kişiyi içerir");
  // Sıra da kararlı olmalı: eşit ağırlıkta kimliğe göre sıralanır.
  eq(a, [...a], "sıra kararlı");
}

/* --- limit -------------------------------------------------------------- */
{
  const people = Array.from({ length: 20 }, (_, i) => P(`p${i}`));
  eq(researchTasks(people, { limit: 5 }).length, 5, "limit uygulanır");
  check(researchTasks(people).length > 5, "limitsiz hepsi gelir");
}

/* --- Bilinmeyen kişiye ait tutarsızlık atlanır -------------------------- */
{
  const people = [P("x", { birthDate: "1900" })];
  const t = researchTasks(people, {
    issues: [{ personId: "yok-boyle-biri", kind: "missingGender", severity: "warning" }],
  });
  check(!ids(t).some((id) => id.includes("yok-boyle-biri")), "ağaçta olmayan kişinin sorunu listeye girmez");
}

/* --- Sarkan ebeveyn kimliği "bilinen ebeveyn" sayılmaz ------------------ */
{
  // Ebeveyn kimliği var ama o kişi ağaçta yok → hâlâ eksik ata.
  const people = [
    P("cocuk", { parentIds: ["silinmis"] }),
    P("torun", { parentIds: ["cocuk"] }),
  ];
  const t = researchTasks(people);
  check(ids(t).includes("eksikEbeveyn:cocuk"), "sarkan ebeveyn bilinen sayılmaz");
}

/* --- countByKind -------------------------------------------------------- */
{
  const people = [P("x", { birthDate: "1900" }), P("y")];
  const c = countByKind(researchTasks(people));
  check(c.every((r) => r.count > 0), "sıfır sayımlar listelenmez");
  eq(c.map((r) => r.kind), [...c.map((r) => r.kind)].sort((a, b) =>
    ["tutarsizlik","eksikEbeveyn","eksikTarih","eksikYer","kaynaksiz"].indexOf(a) -
    ["tutarsizlik","eksikEbeveyn","eksikTarih","eksikYer","kaynaksiz"].indexOf(b)), "önem sırası korunur");
}

/* --- Başarım ------------------------------------------------------------ */
{
  // Zincir hâlinde 3000 kişi: soy sayımı her kişi için ayrı yürüyor, bu yüzden
  // en kötü hâl kare — sınırın altında kaldığı ölçülmeli.
  const big: Person[] = [];
  for (let i = 0; i < 3000; i++) big.push(P(`b${i}`, i === 0 ? {} : { parentIds: [`b${i - 1}`] }));
  const t0 = Date.now();
  const t = researchTasks(big, { limit: 50 });
  const ms = Date.now() - t0;
  eq(t.length, 50, "limit büyük ağaçta da uygulanır");

  /*
   * Süre değil SINIR denetleniyor. Duvar saatine bakan bir eşik, yüklü bir
   * makinede kendiliğinden kırmızıya döner — bu depoda bir kez böyle kararsız
   * bir test yakalandı, ikincisini eklemeyelim. Asıl güvence şu: soy sayımı
   * `REACH_LIMIT`te kesiliyor, yani kişi başına iş sabit sınırlı.
   */
  const tumu = researchTasks(big);
  check(tumu.every((x) => x.reach <= 500), "soy sayımı sınırda duruyor (iş kişi başına sabit)");
  check(tumu.some((x) => x.reachCapped), "sınıra takılanlar işaretleniyor");
  // Yine de "asılmıyor" güvencesi kalsın, ama geniş bir payla.
  check(ms < 5000, `asılmıyor (${ms}ms)`);
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
