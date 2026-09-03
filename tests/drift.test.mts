import { readFileSync } from "node:fs";
import type { Person } from "../types/family.ts";
import {
  columnDrift,
  DENORM_COLUMNS,
  diffPeople,
  driftReport,
  isPrivateField,
  normalizeValue,
  personDiff,
  preview,
  repairPlan,
  stableJson,
  treeDrift,
} from "../lib/drift.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

const kisi = (p: Partial<Person> & { id: string }): Person =>
  ({ firstName: "", lastName: "", gender: "unknown", ...p }) as Person;

/* ── Normalleştirme: boşun bütün yazılışları aynı şey ────────────────────── */

for (const bos of [undefined, null, "", false, [], {}] as unknown[]) {
  check(normalizeValue(bos) === undefined, `boş yazılışı normalleşiyor: ${JSON.stringify(bos)}`);
}
check(normalizeValue(0) === 0, "0 boş DEĞİL");
check(normalizeValue(true) === true, "true korunuyor");
check(normalizeValue("x") === "x", "dolu metin korunuyor");
check(stableJson({ b: 1, a: 2 }) === stableJson({ a: 2, b: 1 }), "anahtar sırası fark etmiyor");
check(stableJson({ a: 1, bos: "" }) === stableJson({ a: 1 }), "boş alan ile eksik alan aynı");
check(stableJson([1, 2]) !== stableJson([2, 1]), "dizi SIRASI korunuyor (gerçek fark)");
check(stableJson({ a: { b: "" } }) === "", "iç içe boş nesne tamamen düşüyor");

/* ── Kişi karşılaştırması ────────────────────────────────────────────────── */

{
  const a = kisi({ id: "1", firstName: "Ali", bio: undefined, photos: [] });
  const b = kisi({ id: "1", firstName: "Ali", bio: "", photos: undefined });
  check(personDiff(a, b).length === 0, "yalnız yazılış farkı kayma sayılmıyor");
}
{
  const a = kisi({ id: "1", firstName: "Ali", deathDate: "1990" });
  const b = kisi({ id: "1", firstName: "Ali" });
  const d = personDiff(a, b);
  check(d.length === 1 && d[0].field === "deathDate", "dolu ↔ boş GERÇEK kayma");
  check(d[0].blob === '"1990"' && d[0].db === "—", "iki taraf da gösteriliyor");
}
{
  // Postgres'te FAZLADAN duran bir alan da görünmeli.
  const a = kisi({ id: "1" });
  const b = { ...kisi({ id: "1" }), eskiAlan: "kalıntı" } as unknown as Person;
  const d = personDiff(a, b);
  check(d.some((x) => x.field === "eskiAlan"), "yalnız DB'de olan alan da yakalanıyor");
}
{
  const a = kisi({ id: "1", parentIds: ["p1"] });
  const b = kisi({ id: "1", parentIds: ["p1", "p2"] });
  check(personDiff(a, b).some((x) => x.field === "parentIds"), "ilişki grafiği kayması yakalanıyor");
}

/* ── Gizlilik: rapor içerik SIZDIRMIYOR ──────────────────────────────────── */

check(isPrivateField("healthCondition"), "sağlık alanı gizli grupta");
check(isPrivateField("bio"), "hikâye alanı gizli grupta");
check(!isPrivateField("firstName"), "ad gizli grupta değil");
{
  const a = kisi({ id: "1", healthCondition: "şeker hastası" });
  const b = kisi({ id: "1" });
  const d = personDiff(a, b);
  check(d.length === 1, "sağlık kayması bildiriliyor");
  check(!d[0].blob.includes("şeker"), "gizli alanın İÇERİĞİ raporda yok");
  check(/^•••\(\d+\)$/.test(d[0].blob), "gizli alan maskeli gösteriliyor");
}
{
  // Gizli KAYIT: alanın kendisi gizli grupta olmasa bile maskelenir.
  const a = kisi({ id: "1", confidential: true, occupation: "hâkim" });
  const b = kisi({ id: "1", confidential: true });
  const d = personDiff(a, b);
  check(d.length === 1 && !d[0].blob.includes("hâkim"), "gizli kaydın her alanı maskeli");
}
{
  // Tek taraf gizliyse de maskeli — gizlilik iki kaydın BİRLEŞİMİ.
  const a = kisi({ id: "1", confidential: true, occupation: "hâkim" });
  const b = kisi({ id: "1", occupation: "avukat" });
  const d = personDiff(a, b);
  check(d.every((x) => !x.blob.includes("hâkim") && !x.db.includes("avukat")),
    "tek taraf gizliyse de maskeleniyor");
}
check(preview("a".repeat(500)).length < 60, "uzun değer kırpılıyor");
check(preview(undefined) === "—", "boş değer '—' gösteriliyor");

/* ── Yön: eksik / fazla / farklı ─────────────────────────────────────────── */

{
  const blob = [kisi({ id: "1", firstName: "Ali" }), kisi({ id: "2", firstName: "Ayşe" })];
  const db = [kisi({ id: "1", firstName: "Ali" }), kisi({ id: "3", firstName: "Veli" })];
  const r = diffPeople(blob, db);
  check(r.missing === 1, "Blob'da olup DB'de olmayan = eksik");
  check(r.extra === 1, "DB'de olup Blob'da olmayan = fazla");
  check(r.same === 1, "aynı kayıt sayılıyor");
  check(r.changed === 0, "farklı yok");
  check(r.items.find((i) => i.id === "2")?.kind === "eksik", "2 eksik olarak işaretli");
  check(r.items.find((i) => i.id === "3")?.kind === "fazla", "3 fazla olarak işaretli");
  check(r.items.find((i) => i.id === "2")?.label === "Ayşe", "ad raporda okunur");
}
{
  const r = diffPeople([kisi({ id: "1", confidential: true, firstName: "Ali" })], []);
  check(r.items[0].label === undefined, "gizli kaydın adı raporda yok");
}

/* ── ASIL MESELE: sayı eşitliği eşitlik değildir ─────────────────────────── */
/*
 * Madde 43'ün var oluş nedeni. Eski ölçü (`postgresPeople === people.length`)
 * bu durumda "eşleşiyor" diyordu; oysa bir kişi eklenmiş, başkası silinmiş.
 */
{
  const blob = [kisi({ id: "1" }), kisi({ id: "2" })];
  const db = [kisi({ id: "1" }), kisi({ id: "9" })];
  const t = treeDrift({ treeId: "t1", name: "Ağaç", inDb: true, blobPeople: blob, dbPeople: db });
  check(t.countsEqual, "sayılar eşit (eski ölçü 'tamam' derdi)");
  check(!t.clean, "AMA rapor temiz değil — sessiz ayrışma yakalandı");
  check(t.people.missing === 1 && t.people.extra === 1, "biri eksik biri fazla");
}
{
  // İçerik kayması da sayıya hiç yansımaz.
  const blob = [kisi({ id: "1", deathDate: "1990" })];
  const db = [kisi({ id: "1" })];
  const t = treeDrift({ treeId: "t1", name: "Ağaç", inDb: true, blobPeople: blob, dbPeople: db });
  check(t.countsEqual && !t.clean, "aynı sayı, ayrışmış içerik → temiz değil");
  check(t.people.changed === 1, "içerik kayması sayılıyor");
}

/* ── Göç edilmemiş ağaç TEMİZ değildir ───────────────────────────────────── */
{
  const t = treeDrift({ treeId: "t1", name: "Ağaç", inDb: false, blobPeople: [], dbPeople: [] });
  check(t.countsEqual, "iki taraf da boş → sayılar eşit");
  check(!t.clean, "Postgres'te olmayan ağaç temiz sayılmıyor");
}
{
  const t = treeDrift({ treeId: "t1", name: "Ağaç", inDb: true, blobPeople: [], dbPeople: [] });
  check(t.clean, "göç etmiş ve boş ağaç temiz");
}

/* ── Ağaç adı kayması ────────────────────────────────────────────────────── */
{
  const t = treeDrift({
    treeId: "t1", name: "Yılmaz", dbName: "Yilmaz",
    inDb: true, blobPeople: [], dbPeople: [],
  });
  check(t.meta.some((m) => m.field === "name"), "ağaç adı kayması yakalanıyor");
  check(!t.clean, "ad kayması raporu kirletiyor");
}
{
  const t = treeDrift({
    treeId: "t1", name: "Yılmaz", dbName: "Yılmaz",
    inDb: true, blobPeople: [], dbPeople: [],
  });
  check(t.meta.length === 0 && t.clean, "aynı ad kayma değil");
}

/* ── Çift id ─────────────────────────────────────────────────────────────── */
{
  const blob = [kisi({ id: "1", firstName: "A" }), kisi({ id: "1", firstName: "B" })];
  const r = diffPeople(blob, [kisi({ id: "1", firstName: "B" })]);
  check(r.duplicateIds.includes("1"), "çift id bildiriliyor");
  const t = treeDrift({ treeId: "t", name: "x", inDb: true, blobPeople: blob, dbPeople: [kisi({ id: "1", firstName: "B" })] });
  check(!t.clean, "çift id raporu kirletiyor");
}

/* ── Sütun kayması: satır kendi `data`sıyla çelişiyor ────────────────────── */
{
  const p = kisi({ id: "1", firstName: "Ali", lastName: "Yılmaz", birthDate: "1950" });
  const temiz = [{ person_id: "1", data: p, first_name: "Ali", last_name: "Yılmaz",
    gender: "unknown", birth_date: "1950", death_date: null, sibling_order: null }];
  check(columnDrift(temiz).length === 0, "tutarlı satırda sütun kayması yok");

  const kayik = [{ ...temiz[0], first_name: "Veli" }];
  const d = columnDrift(kayik);
  check(d.length === 1 && d[0].column === "first_name", "sütun ile data çelişkisi yakalanıyor");
  check(d[0].row === '"Veli"' && d[0].data === '"Ali"', "iki taraf da gösteriliyor");
}
{
  // Sütun boş, `data` dolu — Faz 4 sorgusu bu kişiyi doğum yılına göre bulamaz.
  const p = kisi({ id: "1", firstName: "Ali", birthDate: "1950" });
  const d = columnDrift([{ person_id: "1", data: p, first_name: "Ali", gender: "unknown", birth_date: null }]);
  check(d.some((x) => x.column === "birth_date"), "boş sütun ↔ dolu data kayma");
}
{
  // `personToRow` boş adı "" yazıyor; null sütun da "" ile aynı sayılmalı.
  const p = kisi({ id: "1" });
  check(columnDrift([{ person_id: "1", data: p, first_name: "", last_name: null, gender: "unknown" }]).length === 0,
    "'' ve null aynı boşluk");
}
{
  /*
   * `personToRow` boş alanlara VARSAYILAN yazıyor: `gender ?? "unknown"`,
   * ad/soyad `?? ""`. Denetim aynı varsayılanı uygulamazsa, doğru yazılmış
   * her satır "kaymış" görünür — yani denetim kendi yalancı alarmını üretir.
   */
  const p = { id: "1", firstName: "Ali", lastName: "Ay" } as unknown as Person;
  check(columnDrift([{ person_id: "1", data: p, first_name: "Ali", last_name: "Ay", gender: "unknown" }]).length === 0,
    "eksik cinsiyet ↔ 'unknown' sütunu kayma DEĞİL");
  check(columnDrift([{ person_id: "1", data: p, first_name: "Ali", last_name: "Ay", gender: "female" }])
    .some((x) => x.column === "gender"), "gerçek cinsiyet çelişkisi yine yakalanıyor");
}
{
  const p = kisi({ id: "1", confidential: true, firstName: "Ali" });
  const d = columnDrift([{ person_id: "1", data: p, first_name: "Veli", gender: "unknown" }]);
  check(d.length === 1 && !d[0].row.includes("Veli"), "gizli kaydın sütun değeri de maskeli");
}
{
  /*
   * Eşleme `lib/db.ts`teki `personToRow` ile AYNI kalmalı. Orada bir sütun
   * eklenip burada unutulursa denetim o sütunu hiç görmez — sessiz bir kör
   * nokta. Bu yüzden kaynak düzeyinde karşılaştırılıyor.
   */
  const db = readFileSync(new URL("../lib/db.ts", import.meta.url), "utf8");
  const govde = db.slice(db.indexOf("function personToRow"), db.indexOf("dbUpsertTree"));
  const sutunlar = [...govde.matchAll(/^\s{4}([a-z_]+):/gm)].map((m) => m[1])
    .filter((c) => !["tree_id", "person_id", "data", "updated_at"].includes(c));
  for (const c of sutunlar) {
    check(DENORM_COLUMNS.some((d) => d.column === c), `${c} sütunu denetimde kayıtlı`);
  }
  check(sutunlar.length === DENORM_COLUMNS.length, `sütun sayısı örtüşüyor (${sutunlar.length})`);
}

/* ── Onarım planı: Blob kaynak, yön doğru ────────────────────────────────── */
{
  const blob = [kisi({ id: "1", deathDate: "1990" }), kisi({ id: "2" })];
  const db = [kisi({ id: "1" }), kisi({ id: "9" })];
  const t = treeDrift({ treeId: "t", name: "x", inDb: true, blobPeople: blob, dbPeople: db });
  const plan = repairPlan(t);
  check(plan.upsert.includes("1"), "ayrışan kayıt yeniden yazılıyor");
  check(plan.upsert.includes("2"), "eksik kayıt yeniden yazılıyor");
  check(plan.delete.includes("9"), "fazla kayıt SİLİNİYOR (Blob kaynak)");
  check(!plan.upsert.includes("9"), "fazla kayıt yazılmıyor");
  check(!plan.partial, "kırpılma yok → plan tam");
}
{
  // Sütunu kaymış kayıt da yeniden yazılır: satır tazelendiğinde sütun düzelir.
  const p = kisi({ id: "1", firstName: "Ali" });
  const t = treeDrift({
    treeId: "t", name: "x", inDb: true, blobPeople: [p], dbPeople: [p],
    rows: [{ person_id: "1", data: p, first_name: "Veli", gender: "unknown" }],
  });
  check(t.people.same === 1, "kaynaklar aynı");
  check(!t.clean, "ama sütun kayması raporu kirletiyor");
  check(repairPlan(t).upsert.includes("1"), "sütunu kaymış kayıt yeniden yazılıyor");
}
{
  /*
   * KIRPILMIŞ rapordan çıkarılan plan EKSİKTİR. Bayrak olmasa onarım
   * sessizce yarım kalır ve "tamam" denirdi.
   */
  const blob = Array.from({ length: 10 }, (_, i) => kisi({ id: `b${i}` }));
  const t = treeDrift({ treeId: "t", name: "x", inDb: true, blobPeople: blob, dbPeople: [] }, { max: 3 });
  check(t.people.missing === 10, "sayım kırpılmadan doğru");
  check(t.people.items.length === 3 && t.people.truncated === 7, "ayrıntı listesi kırpıldı");
  check(repairPlan(t).partial, "kırpılmış plan 'eksik' olarak işaretli");
}

/* ── Toplu rapor ─────────────────────────────────────────────────────────── */
{
  const temiz = treeDrift({ treeId: "a", name: "A", inDb: true, blobPeople: [kisi({ id: "1" })], dbPeople: [kisi({ id: "1" })] });
  const kirli = treeDrift({ treeId: "b", name: "B", inDb: true, blobPeople: [kisi({ id: "2" })], dbPeople: [] });
  check(driftReport([temiz], "t").clean, "hepsi temizse rapor temiz");
  check(!driftReport([temiz, kirli], "t").clean, "tek kirli ağaç raporu kirletiyor");
  const r = driftReport([temiz, kirli], "t");
  check(r.totals.missing === 1 && r.totals.same === 1, "toplamlar ağaçlar boyunca birikiyor");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
