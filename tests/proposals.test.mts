import {
  applyProposal, bosMu, buildChanges, buildNewPerson, decide, isCoherent, kindOf,
  normalizeValue, pendingCount, planProposal, proposableKeys, sameValue, visibleTo,
  MAX_CHANGES, MAX_PROPOSALS, MAX_VALUE,
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

/*
 * BU İDDİA DEĞİŞTİ — ve değiştirilme sebebi, önceki hâlinin bir HATAYI
 * doğru diye kilitlemesiydi.
 *
 * Eskiden "false boş DEĞİL" ve "boş dizi boş DEĞİL" yazıyordu. İstemci
 * öneri gövdesinde her zaman `[]`/`false` gönderdiği için, kayıtta o alanlar
 * hiç YOKKEN "değişmiş" sayılıyorlardı: tek alan değiştiren bir öneri on bir
 * alanlık çıkıyordu. Daha kötüsü, o kişi için bir öneri onaylandığı anda
 * kalan bütün öneriler kalıcı olarak "bayat" olup bir daha onaylanamıyordu.
 *
 * Test yeşildi çünkü yanlış olanı kanıtlıyordu.
 */
check(bosMu(undefined) && bosMu(null) && bosMu("") && bosMu("   "), "yokluk ve boş dize boş");
check(bosMu([]) && bosMu({}), "boş dizi ve boş nesne de boş");
check(bosMu(false), "false boş (isteğe bağlı bayrakta yokluk = false)");
check(sameValue(undefined, []), "alan yok ile boş dizi AYNI");
check(sameValue(undefined, false), "alan yok ile false AYNI");
/*
 * SAYILAR boş sayılmıyor: `siblingOrder: 0` gerçek bir sıra. Boolean'la
 * farklı davranmaları veri modelinden geliyor, tutarsızlıktan değil.
 */
check(!bosMu(0), "sıfır boş DEĞİL");
check(!sameValue(0, ""), "sıfır ile boş aynı DEĞİL");
check(!sameValue(true, ""), "true ile boş aynı değil");
check(!sameValue(["a"], []), "dolu dizi ile boş dizi aynı değil");

/*
 * ANAHTAR SIRASI. Karşılaştırma `JSON.stringify` ile yapılıyor ve o sıraya
 * duyarlı. Depoda gerçek bir üretici çifti var: GEDCOM olayları
 * `{id,type,title,date,place}` sırasıyla yazıyor, form `{id,date,type,...}`
 * sırasıyla yeniden kuruyor — sıralanmasaydı içerikçe aynı olay "değişmiş"
 * görünürdü.
 */
check(sameValue({ lat: 1, lng: 2 }, { lng: 2, lat: 1 }), "nesnede anahtar sırası önemsiz");
check(sameValue([{ a: 1, b: 2 }], [{ b: 2, a: 1 }]), "dizi içindeki nesnelerde de");

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

{
  /*
   * SESSİZ KIRPMA YOK. Eskiden 4500 karakterlik bir biyografi önerisi 4000'e
   * kırpılıyor, düzenleyici tam metni gördüğünü sanarak onaylıyor ve 500
   * karakter kayboluyordu — üstelik aynı metni düzenleyici doğrudan
   * kaydetseydi sınır hiç yoktu.
   */
  const r = buildChanges(kisi(), { bio: "x".repeat(MAX_VALUE + 500) });
  check(!r.ok && r.fail === "cok-uzun", "çok uzun değer REDDEDİLİYOR, kırpılmıyor");
  const r2 = buildChanges(kisi(), { bio: "x".repeat(MAX_VALUE) });
  check(r2.ok, "sınırdaki değer kabul ediliyor");
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

/* ── GERÇEK İSTEMCİ GÖVDESİ — bu özelliği kilitleyen hata ────────────────── */
/*
 * Bu blok, testlerin ilk hâlindeki KÖR NOKTANIN karşılığı. Eskiden
 * `buildChanges` her yerde tek anahtarlı bir istekle çağrılıyordu
 * (`{ birthDate: "1943" }`), oysa form gövdenin TAMAMINI gönderiyor ve
 * doldurulmamış alanlar için `[]`/`false`/`"uye"` yolluyor. Gerçek gövde hiç
 * denenmediği için hata görünmüyordu.
 */
{
  const eski = kisi({ birthDate: "1943" } as Partial<Person>);
  // Formun gönderdiği gövde: yalnız doğum tarihi değişti, gerisi boş.
  const govde: Record<string, unknown> = {
    firstName: "Ayşe", lastName: "Yılmaz", gender: "female",
    birthDate: "1945",
    nickname: "", patronymic: "", lineage: "",
    photos: [], videos: [], documents: [], events: [], sources: [],
    memories: [], associations: [], privateFields: [],
    kind: "uye", confidential: false,
  };
  const r = buildChanges(eski, govde);
  if (!r.ok) { fail++; console.log("✗ öneri kurulmalıydı"); }
  else eq(Object.keys(r.changes), ["birthDate"], "yalnız GERÇEKTEN değişen alan öneriye giriyor");

  /*
   * BAYAT ÇIĞI. İki katkı verici aynı kişi için AYRI alanlarda öneri
   * açıyor; düzenleyici birincisini onaylıyor. Boş denkliği olmadan
   * ikincisi, katkı vericinin hiç dokunmadığı on alan gerekçe gösterilerek
   * KALICI olarak onaylanamaz hâle geliyordu.
   */
  const r2 = buildChanges(eski, { ...govde, birthDate: "1943", occupation: "Demirci" });
  if (r.ok && r2.ok) {
    const a1 = applyProposal(eski, oneri({ changes: r.changes }));
    check(a1.ok, "birinci öneri uygulanıyor");
    if (a1.ok) {
      const a2 = applyProposal(a1.person, oneri({ id: "o2", changes: r2.changes }));
      check(a2.ok, "birincisi onaylandıktan sonra İKİNCİSİ de onaylanabiliyor");
    }
  }
}
{
  // `kind: "uye"` varsayılan; kayıtta alan hiç yokken "değişmiş" sayılmamalı.
  const r = buildChanges(kisi(), { kind: "uye" });
  check(!r.ok && r.fail === "degisiklik-yok", "varsayılan `kind` değişiklik değil");
  const r2 = buildChanges(kisi(), { kind: "cevre" });
  check(r2.ok, "gerçek `kind` değişikliği öneriye giriyor");
}

/* ── İdempotentlik ve temizleme ──────────────────────────────────────────── */
{
  /*
   * ZATEN UYGULANMIŞ öneri bayat DEĞİL. Onay iki adımlı: önce ağaç yazılıyor,
   * sonra öneri damgalanıyor. İkinci adım düşerse değişiklik ağaçta duruyor
   * ama öneri "bekliyor" kalıyor — bu ayrım olmadan o öneri bir daha ASLA
   * onaylanamaz, kurtarılamaz bir duruma düşerdi.
   */
  const uygulanmis = kisi({ birthDate: "1943" } as Partial<Person>);
  const r = applyProposal(uygulanmis, oneri({ changes: { birthDate: { from: "", to: "1943" } } }));
  check(r.ok, "zaten uygulanmış öneri yeniden onaylanabiliyor (idempotent)");
}
{
  /*
   * BOŞ DEĞER ALANI SİLİYOR, `""` YAZMIYOR — kayıt defterinin semantiği bu.
   * Ayrıştığında sessiz yanlış çıktı üretiyordu: doğum tarihi öneriyle
   * temizlenen kardeş, `a.birthDate ?? "9999"` sıralamasında en sona değil
   * en BAŞA düşüyordu.
   */
  const dolu = kisi({ birthDate: "1943" } as Partial<Person>);
  const r = applyProposal(dolu, oneri({ changes: { birthDate: { from: "1943", to: "" } } }));
  check(r.ok, "temizleme önerisi uygulanıyor");
  if (r.ok) {
    const kayit = r.person as unknown as Record<string, unknown>;
    check(!("birthDate" in kayit), "temizlenen alan KAYITTAN SİLİNİYOR");
    check(kayit.birthDate !== "", "boş dize yazılmıyor");
  }
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

/* ── Öneri TÜRLERİ (ekleme / silme) ──────────────────────────────────────── */
/*
 * İlk sürümde tek tür vardı ve bu, rolün yapabildiklerini sessizce
 * sınırlıyordu: yeni kişi eklemek ve silmek öneri kuyruğundan geçemiyor,
 * ancak DOĞRUDAN yazma yetkisiyle yapılabiliyordu. Rolleri daraltmadan önce
 * bu boşluk kapanmalı — yoksa daraltma bir yeteneği yok eder.
 */
eq(kindOf({ kind: undefined }), "alan", "tür yoksa 'alan' (eski kayıtlar göç istemiyor)");
eq(kindOf({ kind: "silme" }), "silme", "tür varsa o okunuyor");

{
  const r = buildNewPerson({ firstName: "Zeynep", lastName: "Kaya", birthDate: "1950" });
  check(r.ok, "geçerli ekleme önerisi kuruluyor");
  if (r.ok) eq(Object.keys(r.person).sort(), ["birthDate", "firstName", "lastName"], "alanlar taşınıyor");
}
{
  // Boş alanlar taşınmıyor: kayıtta olmayan alan, "boş" diye yazılmamalı.
  const r = buildNewPerson({ firstName: "Zeynep", nickname: "", photos: [], confidential: false });
  check(r.ok, "boş alanlar süzülüp öneri yine kuruluyor");
  if (r.ok) eq(Object.keys(r.person), ["firstName"], "yalnız dolu alanlar");
}
{
  /*
   * Defter dışı anahtar reddediliyor — `buildChanges` ile aynı gerekçe:
   * onay anında doğrudan kayda yazılırdı ve öneri akışı, kapatmaya
   * çalıştığımız kapının etrafından dolanmanın yolu olurdu.
   */
  const r = buildNewPerson({ firstName: "X", addedBy: "baskasi" });
  check(!r.ok && r.fail === "alan-yok", "ekleme önerisinde de defter dışı alan reddediliyor");
}
{
  const r = buildNewPerson({ nickname: "", photos: [] });
  check(!r.ok && r.fail === "degisiklik-yok", "tamamen boş ekleme önerisi reddediliyor");
}
{
  const r = buildNewPerson({ bio: "x".repeat(MAX_VALUE + 1) });
  check(!r.ok && r.fail === "cok-uzun", "ekleme önerisinde de uzun değer reddediliyor");
}

/* ── Tür tutarlılığı ─────────────────────────────────────────────────────── */
/*
 * Depoya girmeden sorulmalı: türü "ekleme" olup `personId` taşıyan bir kayıt,
 * onay anında hangi kod yolunun çalışacağını belirsiz kılar. Belirsizliği
 * yazma anında kesmek, onay anında keşfetmekten ucuz.
 */
{
  const temel = { id: "o", personName: "", by: "u", byName: "", at: "", status: "bekliyor" } as const;
  check(isCoherent({ ...temel, personId: "p1", changes: { a: { from: "", to: "x" } } } as Proposal),
    "alan önerisi: personId + changes");
  check(!isCoherent({ ...temel, personId: "", changes: { a: { from: "", to: "x" } } } as Proposal),
    "alan önerisi personId'siz olamaz");
  check(!isCoherent({ ...temel, personId: "p1", changes: {} } as Proposal),
    "boş `changes` ile alan önerisi olmaz");

  check(isCoherent({ ...temel, kind: "ekleme", personId: "", changes: {}, person: { firstName: "Z" } } as Proposal),
    "ekleme önerisi: personId YOK, person VAR");
  check(!isCoherent({ ...temel, kind: "ekleme", personId: "p1", changes: {}, person: { firstName: "Z" } } as Proposal),
    "ekleme önerisi personId taşıyamaz");
  check(!isCoherent({ ...temel, kind: "ekleme", personId: "", changes: {}, person: {} } as Proposal),
    "boş `person` ile ekleme önerisi olmaz");
  check(!isCoherent({ ...temel, kind: "ekleme", personId: "", changes: { a: { from: "", to: "x" } }, person: { firstName: "Z" } } as Proposal),
    "ekleme önerisi `changes` taşıyamaz");

  check(isCoherent({ ...temel, kind: "silme", personId: "p1", changes: {} } as Proposal),
    "silme önerisi: personId VAR, gerisi boş");
  check(!isCoherent({ ...temel, kind: "silme", personId: "", changes: {} } as Proposal),
    "silme önerisi personId'siz olamaz");
  check(!isCoherent({ ...temel, kind: "silme", personId: "p1", changes: { a: { from: "", to: "x" } } } as Proposal),
    "silme önerisi `changes` taşıyamaz");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
