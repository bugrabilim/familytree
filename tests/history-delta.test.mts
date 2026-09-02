import type { Person } from "../types/family.ts";
import {
  applyDelta,
  deltaSize,
  diffDelta,
  emptyHistory,
  parseHistory,
  pushSnapshot,
  snapshotAt,
  snapshotById,
  snapshotsWithPeople,
  trimHistory,
  type HistoryFileV2,
} from "../lib/history-delta.ts";

let ok = 0, fail = 0;
function eq<T>(got: T, want: T, msg: string) {
  if (JSON.stringify(got) === JSON.stringify(want)) ok++;
  else { fail++; console.log(`✗ ${msg}: bekl ${JSON.stringify(want)}, geldi ${JSON.stringify(got)}`); }
}
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

const P = (id: string, extra: Partial<Person> = {}): Person => ({
  id, firstName: `Ad${id}`, lastName: "Soy", gender: "male",
  parentIds: [], spouseIds: [], ...extra,
});
const ids = (ps: readonly Person[]) => ps.map((p) => p.id);

/* --- diffDelta / applyDelta: gidiş-dönüş ------------------------------- */
{
  const a = [P("1"), P("2"), P("3")];
  const b = [P("1"), P("2", { birthDate: "1950" }), P("4")];
  const d = diffDelta(a, b);
  eq(ids(d.put), ["2", "4"], "değişen ve yeni kişiler put'ta");
  eq(d.del, ["3"], "silinen kişi del'de");
  eq(applyDelta(a, d), b, "fark uygulanınca hedef aynen çıkıyor");
}
{
  // Değişmeyen kişi farka HİÇ girmemeli — farkın tüm amacı bu.
  const a = [P("1"), P("2"), P("3")];
  const b = [P("1"), P("2"), P("3", { bio: "not" })];
  const d = diffDelta(a, b);
  eq(ids(d.put), ["3"], "yalnız değişen taşınır");
  eq(d.del, [], "silinen yok");
  check(deltaSize(d) < JSON.stringify(b).length / 2, "fark tam kopyadan belirgin küçük");
}
{
  eq(diffDelta([], []), { put: [], del: [] }, "boş→boş: boş fark");
  eq(applyDelta([], { put: [], del: [] }), [], "boş fark hiçbir şey yapmaz");
  const d = diffDelta([P("1")], []);
  eq(d.del, ["1"], "hepsi silinince del dolu");
  eq(applyDelta([P("1")], d), [], "hepsi silinir");
}

/* --- Sıra: yalnız gerektiğinde taşınır --------------------------------- */
{
  const a = [P("1"), P("2")];
  const b = [P("1"), P("2"), P("3")];
  const d = diffDelta(a, b);
  check(d.order === undefined, "sona ekleme sırayı taşımayı gerektirmiyor");
  eq(ids(applyDelta(a, d)), ["1", "2", "3"], "yeni kişi sona eklenir");
}
{
  // Gerçekten yer değiştirme: sıra taşınmalı, yoksa geri yükleme birebir olmaz.
  const a = [P("1"), P("2"), P("3")];
  const b = [P("3"), P("1"), P("2")];
  const d = diffDelta(a, b);
  check(d.order !== undefined, "yeniden sıralama `order` gerektiriyor");
  eq(ids(applyDelta(a, d)), ["3", "1", "2"], "sıra birebir kuruluyor");
}
{
  // `order` bozuksa VERİ KAYBI olmamalı — yanlış sıra, kayıp kayıttan iyidir.
  const a = [P("1"), P("2")];
  const kirik = { put: [], del: [], order: ["2"] };
  eq(ids(applyDelta(a, kirik)), ["2", "1"], "order'da anılmayan kişi düşmüyor");
  const hayalet = { put: [], del: [], order: ["9", "1", "2"] };
  eq(ids(applyDelta(a, hayalet)), ["1", "2"], "order'daki hayalet kimlik yok sayılıyor");
}

/* --- pushSnapshot: sıcak yol zinciri açmaz ----------------------------- */
{
  let f = emptyHistory();
  const s1 = [P("1")];
  const s2 = [P("1"), P("2")];
  const s3 = [P("1", { bio: "x" }), P("2")];

  f = pushSnapshot(f, { id: "a", at: "2026-01-01" }, s1, 10);
  eq(f.stamps.length, 1, "ilk görüntü");
  eq(f.deltas.length, 0, "tek görüntüde fark yok");
  eq(f.head, s1, "head = en yeni");

  f = pushSnapshot(f, { id: "b", at: "2026-01-02" }, s2, 10);
  f = pushSnapshot(f, { id: "c", at: "2026-01-03" }, s3, 10);

  eq(f.stamps.map((s) => s.id), ["c", "b", "a"], "en yeni başta");
  eq(f.deltas.length, 2, "fark sayısı = damga - 1");
  eq(f.head, s3, "head en son eklenen");
  eq(f.stamps[0].count, 2, "damga kişi sayısını taşıyor");
}

/* --- Zinciri açmak: her görüntü birebir geri gelmeli -------------------- */
{
  const durumlar: Person[][] = [
    [P("1")],
    [P("1"), P("2")],
    [P("1"), P("2"), P("3")],
    [P("1", { bio: "düzeltildi" }), P("3")],           // 2 silindi, 1 değişti
    [P("3"), P("1", { bio: "düzeltildi" }), P("9")],   // yeniden sıralama + ekleme
  ];
  let f = emptyHistory();
  durumlar.forEach((d, i) => {
    f = pushSnapshot(f, { id: `s${i}`, at: `2026-01-0${i + 1}` }, d, 20);
  });
  // stamps[0] en yeni = durumlar[son]
  for (let i = 0; i < durumlar.length; i++) {
    const beklenen = durumlar[durumlar.length - 1 - i];
    eq(snapshotAt(f, i), beklenen, `görüntü ${i} birebir geri geliyor`);
  }
  eq(snapshotById(f, "s0"), durumlar[0], "kimlikle de bulunuyor");
  eq(snapshotById(f, "yok"), null, "olmayan kimlik null");
  eq(snapshotAt(f, 99), null, "sınır dışı indis null");
  eq(snapshotAt(f, -1), null, "negatif indis null");
}

/* --- Budama ------------------------------------------------------------ */
{
  let f = emptyHistory();
  for (let i = 0; i < 8; i++) {
    f = pushSnapshot(f, { id: `s${i}`, at: `x${i}` }, [P("1", { bio: `v${i}` })], 3);
  }
  eq(f.stamps.length, 3, "sınır uygulanıyor");
  eq(f.deltas.length, 2, "budamadan sonra da fark = damga - 1");
  eq(f.stamps.map((s) => s.id), ["s7", "s6", "s5"], "en YENİLER tutuluyor");
  eq(snapshotAt(f, 2)![0].bio, "v5", "budamadan sonra en eski hâlâ doğru kuruluyor");
  // trimHistory doğrudan da tutarlı olmalı.
  const t = trimHistory(f, 1);
  eq(t.stamps.length, 1, "tek görüntüye inebilir");
  eq(t.deltas.length, 0, "tek görüntüde fark kalmaz");
  eq(trimHistory(f, 0).stamps.length, 1, "sıfır istense de en az bir görüntü kalır");
}

/* --- snapshotsWithPeople ------------------------------------------------ */
{
  let f = emptyHistory();
  const a = [P("1")];
  const b = [P("1"), P("2")];
  const c = [P("1"), P("2"), P("3")];
  f = pushSnapshot(f, { id: "a", at: "1" }, a, 10);
  f = pushSnapshot(f, { id: "b", at: "2" }, b, 10);
  f = pushSnapshot(f, { id: "c", at: "3" }, c, 10);

  const hepsi = snapshotsWithPeople(f, 10);
  eq(hepsi.map((s) => s.id), ["c", "b", "a"], "en yeni önce");
  eq(hepsi.map((s) => ids(s.people)), [["1", "2", "3"], ["1", "2"], ["1"]], "her biri doğru liste");
  eq(snapshotsWithPeople(f, 2).length, 2, "limit uygulanıyor");
  eq(snapshotsWithPeople(f, 0).length, 0, "sıfır limit boş");
}

/* --- parseHistory: eski biçimden geçiş ---------------------------------- */
{
  const eski = {
    snapshots: [
      { id: "c", at: "3", by: "u1", people: [P("1"), P("2"), P("3")] },
      { id: "b", at: "2", people: [P("1"), P("2")] },
      { id: "a", at: "1", people: [P("1")] },
    ],
  };
  const f = parseHistory(eski);
  eq(f.v, 2, "yeni biçime çevrildi");
  eq(f.stamps.map((s) => s.id), ["c", "b", "a"], "sıra korunuyor");
  eq(f.stamps[0].by, "u1", "yazar korunuyor");
  eq(f.stamps[0].count, 3, "sayı hesaplanıyor");
  eq(f.deltas.length, 2, "fark zinciri kuruldu");
  eq(snapshotById(f, "a"), [P("1")], "eski görüntü birebir kurtarılıyor");
  eq(snapshotById(f, "b"), [P("1"), P("2")], "ortadaki de");
  eq(snapshotById(f, "c"), [P("1"), P("2"), P("3")], "en yeni de");
}
{
  // Bozuk / eksik girdiler sessizce boş günlüğe düşmeli, patlamamalı.
  eq(parseHistory(null), emptyHistory(), "null → boş");
  eq(parseHistory("x"), emptyHistory(), "dize → boş");
  eq(parseHistory({}), emptyHistory(), "alansız nesne → boş");
  eq(parseHistory({ snapshots: [] }), emptyHistory(), "boş eski günlük → boş");
  eq(parseHistory({ snapshots: [{ id: "a", at: "1" }] }), emptyHistory(), "kişisiz eski kayıt atılır");
}
{
  // Yeni biçim aynen geri okunmalı.
  let f = emptyHistory();
  f = pushSnapshot(f, { id: "a", at: "1" }, [P("1")], 10);
  f = pushSnapshot(f, { id: "b", at: "2" }, [P("1"), P("2")], 10);
  const geri = parseHistory(JSON.parse(JSON.stringify(f)));
  eq(geri, f, "yeni biçim gidiş-dönüş aynı");
}
{
  /*
   * Zincir tutarsızsa (fark sayısı damga sayısıyla uyuşmuyorsa) fazlası
   * atılır. Yanlış bir duruma geri yüklemektense az sayıda görüntü sunmak
   * yeğdir — kullanıcı "geri aldım ama başka bir şey geldi" durumuna
   * düşmemeli.
   */
  const bozuk: HistoryFileV2 = {
    v: 2,
    head: [P("1")],
    stamps: [
      { id: "a", at: "1", count: 1 },
      { id: "b", at: "2", count: 1 },
      { id: "c", at: "3", count: 1 },
    ],
    deltas: [{ put: [], del: [] }], // 3 damga için 2 fark gerekirdi
  };
  const f = parseHistory(bozuk);
  eq(f.stamps.length, 2, "fark sayısına göre damgalar kısaldı");
  eq(f.deltas.length, 1, "fark sayısı korundu");
  check(snapshotAt(f, f.stamps.length - 1) !== null, "kalan zincir açılabiliyor");
}

/* --- Asıl kazanç: boyut ------------------------------------------------- */
{
  /*
   * Bu testin ölçtüğü şey maddenin gerekçesi: eski biçimde her görüntü tüm
   * listenin kopyasıydı ve `MAX` tam da bu yüzden düşük tutulmuştu.
   */
  const buyuk = Array.from({ length: 300 }, (_, i) => P(`p${i}`, { bio: "x".repeat(40) }));
  let f = emptyHistory();
  const eskiBoyut: number[] = [];
  const eskiGoruntuler: Person[][] = [];
  for (let i = 0; i < 15; i++) {
    // Her turda tek bir kişi değişiyor — tipik bir düzenleme.
    const durum = buyuk.map((p, j) => (j === i ? { ...p, bio: `değişti ${i}` } : p));
    eskiGoruntuler.push(durum);
    f = pushSnapshot(f, { id: `s${i}`, at: `${i}` }, durum, 15);
    eskiBoyut.push(JSON.stringify(durum).length);
  }
  const yeni = JSON.stringify(f).length;
  const eski = eskiBoyut.reduce((a, b) => a + b, 0);
  check(yeni < eski / 5, `fark tabanlı dosya en az 5 kat küçük (eski ${eski}, yeni ${yeni})`);
  // Ve küçüklük doğruluktan çalmıyor:
  eq(snapshotAt(f, 14), eskiGoruntuler[0], "en eski görüntü hâlâ birebir");
  eq(snapshotAt(f, 0), eskiGoruntuler[14], "en yeni görüntü hâlâ birebir");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
