import {
  applyProposal, buildChanges, decide, normalizeValue, pendingCount, planProposal,
  proposableKeys, sameValue, visibleTo, MAX_CHANGES, MAX_PROPOSALS,
  type Proposal,
} from "../lib/proposals.ts";
import type { Person } from "../types/family.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }
function eq(a: unknown, b: unknown, msg: string) {
  const g = JSON.stringify(a) === JSON.stringify(b);
  if (!g) console.log(`✗ ${msg}\n   beklenen: ${JSON.stringify(b)}\n   gelen:    ${JSON.stringify(a)}`);
  if (g) ok++; else fail++;
}

const kisi = (o: Partial<Person> = {}): Person => ({
  id: "p1", firstName: "Ayşe", lastName: "Yılmaz", gender: "female",
  parentIds: [], spouseIds: [], ...o,
} as Person);

const oneri = (o: Partial<Proposal> = {}): Proposal => ({
  id: "o1", personId: "p1", personName: "Ayşe Yılmaz",
  changes: { birthDate: { from: "", to: "1943" } },
  by: "u1", byName: "Mehmet", at: "2026-09-06T10:00:00.000Z", status: "bekliyor",
  ...o,
});

/* ── Değer normalleştirme ─────────────────────────────────────────────────── */
eq(normalizeValue(undefined), "", "undefined → boş");
eq(normalizeValue(null), "", "null → boş");
eq(normalizeValue("  a  "), "a", "metin kırpılıyor");
eq(normalizeValue(5), 5, "sayı korunuyor");
eq(normalizeValue(false), false, "false korunuyor (boş sayılmıyor)");
eq(normalizeValue(["  a", null]), ["a", ""], "dizi öğe öğe normalleşiyor");
/*
 * Bu üçü aynı şeyi anlatıyor (alan boş) ama JavaScript'te birbirine eşit
 * değil. Ayrılsalardı "boş alanı boş yapan" bir öneri değişiklik sayılır ve
 * bayatlık denetimi durduk yere tetiklenirdi.
 */
check(sameValue(undefined, ""), "undefined ile boş dize aynı");
check(sameValue(null, ""), "null ile boş dize aynı");
check(sameValue("  x ", "x"), "boşluk farkı önemsiz");
check(!sameValue(0, ""), "sıfır boş DEĞİL");
check(!sameValue(false, ""), "false boş DEĞİL");

/* ── Önerilebilir alanlar ─────────────────────────────────────────────────── */
{
  const k = proposableKeys();
  check(k.has("birthDate"), "defterdeki alan önerilebilir");
  /*
   * Sunucunun sahip olduğu alanlar defterde YOK; olsaydı öneri gövdesi
   * onay anında doğrudan kayda yazılır ve öneri akışı, kapatmaya
   * çalıştığımız yetki kapısının etrafından dolanmanın yolu olurdu.
   */
  check(!k.has("addedBy"), "addedBy önerilemez");
  check(!k.has("code"), "code önerilemez");
  check(!k.has("id"), "id önerilemez");
  check(!k.has("parentIds"), "ilişki grafiği önerilemez");
  check(!k.has("contactEmail"), "iletişim adresi önerilemez");
}

/* ── Öneri kurma ──────────────────────────────────────────────────────────── */
{
  const r = buildChanges(kisi(), { birthDate: "1943" });
  check(r.ok, "geçerli istek öneri kuruyor");
  if (r.ok) eq(r.changes.birthDate, { from: "", to: "1943" }, "boş alandan doluya");
}
{
  const r = buildChanges(kisi({ birthDate: "1945" } as Partial<Person>), { birthDate: "1943" });
  if (r.ok) eq(r.changes.birthDate, { from: "1945", to: "1943" }, "`from` KAYITTAN okunuyor");
  else { fail++; console.log("✗ öneri kurulmalıydı"); }
}
{
  /*
   * `from`u istemci yazabilseydi, öneriyi açan taraf onu kaydın şimdiki
   * değerine eşitleyip bayatlık denetiminden geçebilirdi — denetim de
   * kendi kendini iptal ederdi.
   */
  const r = buildChanges(kisi({ birthDate: "1945" } as Partial<Person>),
    { birthDate: "1943", from: "uydurma" } as Record<string, unknown>);
  check(!r.ok, "gövdeye sokuşturulmuş `from` isteği reddediyor");
}
{
  const r = buildChanges(kisi(), { addedBy: "baskasi" });
  check(!r.ok && r.fail === "alan-yok", "defter dışı alan reddediliyor");
}
{
  const r = buildChanges(kisi({ birthDate: "1943" } as Partial<Person>), { birthDate: "1943" });
  check(!r.ok && r.fail === "degisiklik-yok", "aynı değer öneri değil");
}
{
  const r = buildChanges(kisi(), { birthDate: "  1943  " });
  check(r.ok, "yalnız boşluk farkı olmayan gerçek değişiklik geçiyor");
}
{
  const cok: Record<string, unknown> = {};
  for (const k of [...proposableKeys()].slice(0, MAX_CHANGES + 5)) cok[k] = "x";
  const r = buildChanges(kisi(), cok);
  check(!r.ok && r.fail === "cok-alan", `en fazla ${MAX_CHANGES} alan`);
}

/* ── Karar ────────────────────────────────────────────────────────────────── */
{
  const r = decide(oneri(), "onaylandi", "u2", "Sahip", "2026-09-07T00:00:00.000Z");
  check(r.ok, "bekleyen öneri karara bağlanıyor");
  if (r.ok) {
    eq(r.proposal.status, "onaylandi", "durum yazıldı");
    eq(r.proposal.decidedBy, "u2", "kararı veren yazıldı");
  }
}
{
  /*
   * İkinci karar serbest olsaydı, onaylanmış bir öneri sonradan
   * "reddedildi" gösterilebilir ve kayıt, ağaçta gerçekte ne olduğunu
   * anlatmaz hâle gelirdi.
   */
  const r = decide(oneri({ status: "onaylandi" }), "reddedildi", "u2", "Sahip", "2026-09-07T00:00:00.000Z");
  check(!r.ok && r.fail === "karar-verilmis", "karara bağlanmış öneri yeniden karara bağlanamaz");
}
{
  const r = decide(oneri({ status: "reddedildi" }), "onaylandi", "u2", "S", "2026-09-07T00:00:00.000Z");
  check(!r.ok, "reddedilmiş öneri de yeniden karara bağlanamaz");
}
{
  const r = decide(oneri(), "silindi" as "onaylandi", "u2", "S", "2026-09-07T00:00:00.000Z");
  check(!r.ok && r.fail === "gecersiz-karar", "tanımsız karar reddediliyor");
}

/* ── Uygulama ve BAYATLIK ─────────────────────────────────────────────────── */
{
  const r = applyProposal(kisi(), oneri());
  check(r.ok, "dayandığı değer duruyorsa uygulanıyor");
  if (r.ok) eq((r.person as unknown as Record<string, unknown>).birthDate, "1943", "değer yazıldı");
}
{
  /*
   * BU DOSYANIN EN ÖNEMLİ İDDİASI.
   *
   * Katkı verici "1943 olsun" der, ertesi gün düzenleyici alanı 1945 yapar,
   * üç gün sonra sahip eski öneriyi onaylar. Denetim olmasaydı YENİ bilgi
   * sessizce eskiyle ezilirdi — üstelik ekranda "onaylandı" yazarken.
   */
  const r = applyProposal(kisi({ birthDate: "1945" } as Partial<Person>), oneri());
  check(!r.ok, "arada değişen alan BAYAT sayılıyor");
  if (!r.ok) eq(r.stale, ["birthDate"], "hangi alanın bayatladığı söyleniyor");
}
{
  // Boş ile undefined farkı bayatlık ÜRETMEMELİ.
  const r = applyProposal(kisi({ birthDate: undefined } as Partial<Person>),
    oneri({ changes: { birthDate: { from: "", to: "1943" } } }));
  check(r.ok, "undefined ile boş dize farkı bayatlık saymıyor");
}
{
  const cokAlan = oneri({
    changes: { birthDate: { from: "", to: "1943" }, birthPlace: { from: "", to: "Trabzon" } },
  });
  const r = applyProposal(kisi({ birthPlace: "Rize" } as Partial<Person>), cokAlan);
  check(!r.ok, "tek alan bayatsa öneri kısmen UYGULANMIYOR");
  if (!r.ok) eq(r.stale, ["birthPlace"], "yalnız bayat alan bildiriliyor");
}
{
  // Uygulama kaydı YERİNDE değiştirmemeli (kopya dönmeli).
  const k = kisi();
  applyProposal(k, oneri());
  check((k as unknown as Record<string, unknown>).birthDate === undefined,
    "özgün kayıt değişmiyor (kopya üstünde çalışılıyor)");
}

/* ── Liste ve tavan ───────────────────────────────────────────────────────── */
{
  const r = planProposal([], oneri());
  check(r.ok && r.list.length === 1, "ilk öneri ekleniyor");
}
{
  const dolu = Array.from({ length: MAX_PROPOSALS }, (_, i) =>
    oneri({ id: `x${i}`, status: "onaylandi" }));
  const r = planProposal(dolu, oneri({ id: "yeni" }));
  check(r.ok, "tavan dolu ama kararlılar var → en eski kararlı düşüyor");
  if (r.ok) {
    eq(r.list.length, MAX_PROPOSALS, "tavan korunuyor");
    check(r.list.some((p) => p.id === "yeni"), "yeni öneri listede");
    check(!r.list.some((p) => p.id === "x0"), "en eski KARARLI düştü");
  }
}
{
  /*
   * Bekleyen bir öneriyi tavan yüzünden atmak, birinin yazdığı katkıyı kimse
   * görmeden çöpe atmak olurdu. Gürültülü "kuyruk dolu" hatası, sessiz
   * kayıptan iyidir.
   */
  const dolu = Array.from({ length: MAX_PROPOSALS }, (_, i) => oneri({ id: `x${i}` }));
  const r = planProposal(dolu, oneri({ id: "yeni" }));
  check(!r.ok && r.fail === "kuyruk-dolu", "hepsi bekliyorsa yeni öneri REDDEDİLİYOR");
}
eq(pendingCount([oneri(), oneri({ status: "onaylandi" }), oneri()]), 2, "bekleyen sayısı");

/* ── Görünürlük ───────────────────────────────────────────────────────────── */
{
  const liste = [oneri({ id: "a", by: "u1" }), oneri({ id: "b", by: "u9" })];
  eq(visibleTo(liste, "u1", true).length, 2, "karar verebilen hepsini görüyor");
  eq(visibleTo(liste, "u1", false).map((p) => p.id), ["a"], "katkı verici yalnız kendi önerisini görüyor");
  eq(visibleTo(liste, "u9", false).map((p) => p.id), ["b"], "başkasının önerisi görünmüyor");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
