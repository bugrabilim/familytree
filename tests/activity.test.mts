import { buildActivity, diffActivity, type ActivityItem } from "../lib/activity.ts";
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
  id, firstName: `Ad-${id}`, lastName: "Soy", gender: "male",
  parentIds: [], spouseIds: [], ...extra,
});
const M = { at: "2026-09-02T10:00:00.000Z", by: "hesap-1" };
const kinds = (x: ActivityItem[]) => x.map((i) => i.kind);

/* --- Kişi eklendi / silindi ---------------------------------------------- */
{
  const d = diffActivity([P("a")], [P("a"), P("b")], M);
  eq(kinds(d), ["kisiEklendi"], "yeni kişi");
  eq(d[0].personId, "b", "doğru kişi");
  eq(d[0].by, "hesap-1", "yazar taşınır");
}
{
  const d = diffActivity([P("a"), P("b")], [P("a")], M);
  eq(kinds(d), ["kisiSilindi"], "silinen kişi");
  // Ad ÖNCEKİ listeden okunmalı; sonrakinde kişi yok.
  eq(d[0].personName, "Ad-b Soy", "silinenin adı önceki listeden");
}

/* --- Fotoğraf: kapak + galeri TEK katkı --------------------------------- */
{
  /*
   * Bu dalı önce iki ayrı yerde hesaplamıştım: kapak eklenip galeri
   * büyümediğinde aynı katkı iki kez çıkıyordu. Tek yerde toplandı.
   */
  const sadeceKapak = diffActivity([P("a")], [P("a", { photo: "k.jpg" })], M);
  eq(kinds(sadeceKapak), ["fotograf"], "yalnız kapak → TEK kayıt");
  eq(sadeceKapak[0].count, undefined, "tek fotoğrafta sayı gösterilmez");

  const kapakVeGaleri = diffActivity(
    [P("a")],
    [P("a", { photo: "k.jpg", photos: ["1.jpg", "2.jpg"] })],
    M
  );
  eq(kinds(kapakVeGaleri), ["fotograf"], "kapak + galeri tek kayıt");
  eq(kapakVeGaleri[0].count, 3, "kapak galeriye eklenir (2+1)");

  const galeriBuyudu = diffActivity(
    [P("a", { photos: ["1.jpg"] })],
    [P("a", { photos: ["1.jpg", "2.jpg", "3.jpg"] })],
    M
  );
  eq(galeriBuyudu[0].count, 2, "yalnız artış sayılır");

  // Silme katkı DEĞİL.
  const silindi = diffActivity([P("a", { photos: ["1.jpg", "2.jpg"] })], [P("a", { photos: ["1.jpg"] })], M);
  check(!kinds(silindi).includes("fotograf"), "fotoğraf silmek katkı sayılmaz");
}

/* --- Anı / kaynak / olay -------------------------------------------------- */
{
  const d = diffActivity(
    [P("a")],
    [P("a", {
      memories: [{ id: "m1", text: "x" }, { id: "m2", text: "y" }],
      sources: [{ id: "s", title: "Nüfus" }],
      events: [{ id: "e", type: "evlilik", title: "Düğün" }],
    })],
    M
  );
  eq(kinds(d).sort(), ["ani", "kaynak", "olay"], "üç ayrı katkı");
  eq(d.find((x) => x.kind === "ani")?.count, 2, "iki anı sayılır");
}

/* --- Metin: BOŞTAN DOLUYA katkıdır, düzeltme değil ----------------------- */
{
  const eklendi = diffActivity([P("a")], [P("a", { bio: "hikâye" })], M);
  eq(kinds(eklendi), ["hikaye"], "hikâye eklendi");

  const duzeltildi = diffActivity([P("a", { bio: "eski" })], [P("a", { bio: "yeni" })], M);
  eq(kinds(duzeltildi), ["duzenleme"], "var olan metnin düzeltilmesi 'hikâye eklendi' DEĞİL");

  const silindi = diffActivity([P("a", { bio: "eski" })], [P("a")], M);
  eq(kinds(silindi), ["duzenleme"], "metin silmek katkı sayılmaz");

  // Boşluk yalnızca boşluksa dolu sayılmaz.
  const bosluk = diffActivity([P("a")], [P("a", { bio: "   " })], M);
  eq(kinds(bosluk), ["duzenleme"], "yalnız boşluk 'hikâye' sayılmaz");
}
{
  const d = diffActivity([P("a")], [P("a", { birthDate: "1950", birthPlace: "Rize" })], M);
  eq(kinds(d).sort(), ["tarih", "yer"], "tarih ve yer ayrı katkı");
  // İki tarih alanı da dolarsa iki kayıt olur; akış bunu öbeklemez ama
  // tekrarı da gizlemez.
  const iki = diffActivity([P("a")], [P("a", { birthDate: "1950", deathDate: "2020" })], M);
  eq(kinds(iki), ["tarih", "tarih"], "iki tarih alanı iki kayıt");
}

/* --- Bağlar --------------------------------------------------------------- */
{
  const d = diffActivity([P("a")], [P("a", { parentIds: ["x"] })], M);
  eq(kinds(d), ["bag"], "ebeveyn bağı");
  const e = diffActivity([P("a", { spouseIds: ["y"] })], [P("a")], M);
  eq(kinds(e), ["bag"], "bağ KOPMASI da bağ değişikliğidir");
}

/* --- Hiçbir şey değişmediyse boş ---------------------------------------- */
{
  eq(diffActivity([P("a")], [P("a")], M), [], "değişiklik yoksa akış boş");
}

/* --- Kararlı kimlik ------------------------------------------------------ */
{
  const a = diffActivity([P("a")], [P("a", { bio: "x" })], M);
  const b = diffActivity([P("a")], [P("a", { bio: "x" })], M);
  eq(a.map((x) => x.id), b.map((x) => x.id), "kimlikler kararlı");
  check(a[0].id.includes("a"), "kimlik kişiyi içerir");
}

/* --- buildActivity: sıra ve yazar eşlemesi ------------------------------ */
{
  /*
   * Anlık görüntüler EN YENİ ÖNCE ve her biri bir kaydetmeden ÖNCEKİ durumu
   * tutar. Yani en yeni katkı `snapshots[0] → current` farkıdır ve yazarı
   * `snapshots[0].by`dir. Kafa karıştırıcı olan tam olarak bu eşleme.
   */
  const s0 = { at: "2026-09-02T12:00:00.000Z", by: "ayse", people: [P("a")] };
  const s1 = { at: "2026-09-01T12:00:00.000Z", by: "mehmet", people: [] as Person[] };
  const current = [P("a", { bio: "hikâye" })];

  const akis = buildActivity([s0, s1], current);
  eq(akis.map((x) => [x.kind, x.by]), [["hikaye", "ayse"], ["kisiEklendi", "mehmet"]],
    "en yeni katkı başta ve yazarlar doğru eşleşiyor");
  eq(akis[0].at, s0.at, "en yeni katkının zamanı snapshots[0]'dan");
}
{
  // limit
  const snaps = Array.from({ length: 10 }, (_, i) => ({
    at: `2026-09-${String(10 - i).padStart(2, "0")}T00:00:00.000Z`,
    people: Array.from({ length: 10 - i }, (_, j) => P(`p${j}`)),
  }));
  const current = Array.from({ length: 11 }, (_, j) => P(`p${j}`));
  eq(buildActivity(snaps, current, 3).length, 3, "limit uygulanır");
  check(buildActivity(snaps, current).length <= 50, "varsayılan limit");
}
{
  // Yazar bilinmiyorsa akış yine kurulur.
  const akis = buildActivity([{ at: "2026-09-02T00:00:00.000Z", people: [] }], [P("a")]);
  eq(akis[0].by, undefined, "yazarsız katkı da kaydedilir");
  eq(akis[0].kind, "kisiEklendi", "katkı yine doğru");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
