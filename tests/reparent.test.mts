import type { Person } from "../types/family.ts";
import { applyReparent, planReparent, summarize } from "../lib/reparent.ts";

let ok = 0, fail = 0;
function eq<T>(got: T, want: T, msg: string) {
  if (JSON.stringify(got) === JSON.stringify(want)) ok++;
  else { fail++; console.log(`✗ ${msg}: bekl ${JSON.stringify(want)}, geldi ${JSON.stringify(got)}`); }
}
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

const P = (id: string, extra: Partial<Person> = {}): Person => ({
  id, firstName: id, lastName: "Soy", gender: "male",
  parentIds: [], spouseIds: [], ...extra,
});

/*
 * dede → baba → torun
 * anne, uvey  : ek ebeveyn adayları
 * dost        : çevre kişisi (soy ağacına katılmaz)
 */
const people: Person[] = [
  P("dede"),
  P("nine", { gender: "female" }),
  P("baba", { parentIds: ["dede", "nine"] }),
  P("anne", { gender: "female" }),
  P("torun", { parentIds: ["baba"] }),
  P("uvey"),
  P("yalniz"),
  P("dost", { kind: "cevre" }),
];

const hata = (r: ReturnType<typeof planReparent>) => (r.ok ? "(başarılı)" : r.error);

/* --- Reddedilenler: sessiz bozulmanın önündeki duvar -------------------- */
eq(hata(planReparent("torun", "torun", people)), "ayni", "kişi kendisinin ebeveyni olamaz");
eq(hata(planReparent("torun", "yokkisi", people)), "yok", "olmayan kişi");
eq(hata(planReparent("yokkisi", "baba", people)), "yok", "olmayan çocuk");
eq(hata(planReparent("torun", "baba", people)), "zaten", "var olan bağ tekrar kurulmaz");

// Çevre kişisi iki yönde de reddedilmeli.
eq(hata(planReparent("torun", "dost", people)), "cevre", "çevre kişisi ebeveyn olamaz");
eq(hata(planReparent("dost", "baba", people)), "cevre", "çevre kişisine ebeveyn eklenemez");

/* --- Döngü: bu testin asıl konusu -------------------------------------- */
/*
 * Bir kişinin kendi torununu ebeveyni yapmak ağacı sonsuz halkaya çevirir;
 * kuşak hesabı ve yerleşim durmadan dönerdi.
 */
eq(hata(planReparent("dede", "torun", people)), "dongu", "torun, dedenin ebeveyni olamaz");
eq(hata(planReparent("baba", "torun", people)), "dongu", "torun, babanın ebeveyni olamaz");
// Ters yön SORUN DEĞİL: dede zaten babanın atası, ama torunun doğrudan
// ebeveyni yapmak döngü kurmaz (yalnız kuşak atlar).
check(planReparent("torun", "dede", people).ok, "dede doğrudan ebeveyn olabilir (döngü değil)");
// Alakasız iki kişi arasında döngü yok.
check(planReparent("yalniz", "dede", people).ok, "ilgisiz kişiye ebeveyn eklenebilir");

/* --- Boş yer varsa doğrudan eklenir ------------------------------------- */
{
  const r = planReparent("torun", "anne", people);
  check(r.ok, "tek ebeveynli çocuğa ikinci ebeveyn eklenir");
  if (r.ok) {
    eq(r.plan.nextParentIds, ["baba", "anne"], "yeni ebeveyn sona eklenir");
    check(r.plan.replaces === undefined, "kimsenin yerine geçilmiyor");
  }
}
{
  const r = planReparent("yalniz", "dede", people);
  if (r.ok) eq(r.plan.nextParentIds, ["dede"], "ebeveynsiz kişide tek bağ kurulur");
}

/* --- İki ebeveyn doluysa SORULUR, sessizce değiştirilmez ---------------- */
{
  const r = planReparent("baba", "uvey", people);
  eq(hata(r), "secim", "iki ebeveyn doluyken seçim isteniyor");
  if (!r.ok) eq(r.current, ["dede", "nine"], "mevcut ebeveynler seçim için dönüyor");
}
{
  const r = planReparent("baba", "uvey", people, { replace: "dede" });
  check(r.ok, "yerine geçecek ebeveyn belirtilince plan çıkıyor");
  if (r.ok) {
    eq(r.plan.nextParentIds, ["uvey", "nine"], "yerine geçen, çıkanın YERİNDE durur");
    eq(r.plan.replaces, "dede", "kopan bağ planda yazılı");
  }
}
{
  // Ebeveyni olmayan birini "yerine geç" diye vermek geçersiz.
  eq(hata(planReparent("baba", "uvey", people, { replace: "yalniz" })), "yok",
    "ebeveyn olmayan biri değiştirilemez");
}
{
  // Üçüncü ebeveyn ASLA eklenmiyor: model en fazla iki ebeveyn tutuyor.
  const r = planReparent("baba", "uvey", people, { replace: "nine" });
  if (r.ok) eq(r.plan.nextParentIds.length, 2, "ebeveyn sayısı ikiyi geçmiyor");
}

/* --- applyReparent: parentLinks temizliği ------------------------------- */
{
  /*
   * Bu, gözden kaçarsa sessiz bozulma doğuran ayrıntı: kopan ebeveyne ait
   * `kind`/`estranged`/`note` kaydı kişide kalırsa, o kişi ileride yeniden
   * ebeveyn olarak eklendiğinde eski ve alakasız notu diriltir.
   */
  const child = P("baba", {
    parentIds: ["dede", "nine"],
    parentLinks: {
      dede: { kind: "adoptive", note: "1999 depreminde evlat edindi" },
      nine: { kind: "biological" },
    },
  });
  // Ağacın `baba` kaydını bu (bağ notlu) kopyayla değiştir.
  const liste = people.map((p) => (p.id === "baba" ? child : p));
  const r = planReparent("baba", "uvey", liste, { replace: "dede" });
  check(r.ok, "plan üretildi");
  if (r.ok) {
    const out = applyReparent(child, r.plan);
    eq(out.parentIds, ["uvey", "nine"], "parentIds güncellendi");
    /*
     * `?? {}` ile bakmak YETMEZ: alan hiç yazılmazsa boş nesneye düşer ve
     * "dede yok" denetimi boşuna geçer. Kişi rotası `?? existing`
     * kullandığından alanın YAZILMAMASI eski notun aynen kalması demek —
     * yani tam da engellemeye çalıştığımız şey. Bu yüzden önce alanın
     * gerçekten üretildiğini doğruluyoruz.
     */
    check(out.parentLinks !== undefined, "bir bağ kaldığı için parentLinks YAZILIYOR");
    const links = out.parentLinks ?? {};
    check(!("dede" in links), "kopan ebeveynin bağ notu SİLİNDİ");
    check("nine" in links, "duran ebeveynin notu korundu");
    check(!("uvey" in links), "yeni ebeveyne uydurma not yazılmıyor");
  }
}
{
  // Tüm bağlar koparsa alan boş nesne DEĞİL, `undefined` olmalı: kişi
  // rotası `?? existing` kullanıyor, boş nesne "değişmedi" sanılabilirdi.
  const child = P("x", { parentIds: ["a"], parentLinks: { a: { kind: "step" } } });
  const out = applyReparent(child, { childId: "x", parentId: "b", replaces: "a", nextParentIds: ["b"] });
  eq(out.parentLinks, undefined, "boşalan parentLinks temizleniyor");
}
{
  // parentLinks hiç yoksa alan uydurulmuyor.
  const child = P("x", { parentIds: [] });
  const out = applyReparent(child, { childId: "x", parentId: "b", nextParentIds: ["b"] });
  check(!("parentLinks" in out), "olmayan parentLinks oluşturulmuyor");
  eq(out.parentIds, ["b"], "yalnız parentIds yazılıyor");
}

/* --- summarize: onay ekranı gerçek adları göstermeli -------------------- */
{
  const ad = (p: Person) => `${p.firstName} ${p.lastName}`.trim();
  const s = summarize(
    { childId: "baba", parentId: "uvey", replaces: "dede", nextParentIds: ["uvey", "nine"] },
    people,
    ad
  );
  eq(s.childName, "baba Soy", "çocuk adı");
  eq(s.parentName, "uvey Soy", "yeni ebeveyn adı");
  eq(s.removedName, "dede Soy", "kopan ebeveyn adı");

  const s2 = summarize({ childId: "torun", parentId: "anne", nextParentIds: ["baba", "anne"] }, people, ad);
  check(s2.removedName === undefined, "kopan bağ yoksa ad da yok");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
