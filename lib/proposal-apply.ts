import { applyProposal, invert, kindOf, type Proposal, type RemovedRef, type UndoRecord } from "@/lib/proposals";
import { createPerson } from "@/lib/person-create";
import { scrubDeleted } from "@/lib/scrub";
import type { FamilyData, Person } from "@/types/family";

/**
 * ONAYLANAN ÖNERİYİ AĞACA UYGULAMA — tek yerde (madde 35/E).
 *
 * Bu mantık onay rotasının PATCH gövdesinde yaşıyordu ve tek bir öneriye
 * göre yazılmıştı. Toplu onay ikinci bir çağıran getirdi; kopyalansaydı iki
 * yol ayrışırdı ve ayrışmanın yönü kötü olurdu: tek tek onaylandığında
 * ilişkileri temizlenen bir silme, toplu onaylandığında temizlenmez ve geriye
 * var olmayan kimliğe işaret eden ebeveyn/eş bağları kalırdı. Depo bu hatayı
 * bir kez yaşadı (kişi oluşturma iki yere kopyalanmıştı — `person-create.ts`).
 *
 * `data` YERİNDE değiştiriliyor. Kopya üstünde çalışmak, toplu onayı imkânsız
 * kılardı: art arda uygulanan öneriler birbirinin sonucunu GÖRMEK zorunda,
 * yoksa ikinci öneri birincinin yazdığını ezerdi.
 */

/**
 * Bir kaydı gösteren BÜTÜN başvurular — geri almanın dayanağı.
 *
 * Hem silmede (koparılan bağları saklamak için) hem eklemede (kaydın
 * onaydan sonra yeni bağ kazanıp kazanmadığını anlamak için) aynı soru
 * soruluyordu ve iki yere ayrı yazılırsa ayrışırlar.
 */
function baglayanlar(people: readonly Person[], hedef: string): RemovedRef[] {
  const out: RemovedRef[] = [];
  for (const x of people) {
    if (x.id === hedef) continue;
    const assoc = x.associations?.find((a) => a.personId === hedef);
    const ref: RemovedRef = {
      id: x.id,
      ...((x.parentIds ?? []).includes(hedef) ? { parent: true } : {}),
      ...((x.spouseIds ?? []).includes(hedef) ? { spouse: true } : {}),
      ...((x.formerSpouseIds ?? []).includes(hedef) ? { former: true } : {}),
      ...(assoc ? { assoc } : {}),
    };
    if (ref.parent || ref.spouse || ref.former || ref.assoc) out.push(ref);
  }
  return out;
}

/** Karşılaştırılabilir biçim — anahtar sırası fark etmesin. */
function damga(v: unknown): string {
  return JSON.stringify(v, (_k, val) =>
    val && typeof val === "object" && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val as object).sort(([a], [b]) => (a < b ? -1 : 1)))
      : val
  );
}

export type ApplyFail =
  /** Öneri edilen kişi (artık) yok. */
  | { kod: "kisi-yok" }
  /** Ekleme önerisinde bağlanacak hedef yok. */
  | { kod: "hedef-yok" }
  /** Ekleme önerisinde hedefin zaten iki ebeveyni var. */
  | { kod: "iki-ebeveyn" }
  /** Öneri yazıldığından beri alanlar değişmiş. */
  | { kod: "bayat"; stale: string[] }
  /** Geri alınacak bir kayıt yok (öneri onaylanmamış ya da kaydı tutulmamış). */
  | { kod: "kayit-yok" }
  /** Kayıt onaydan SONRA değişmiş; geri almak o değişikliği de silerdi. */
  | { kod: "degismis" };

export function applyToTree(
  data: FamilyData,
  p: Proposal
): { ok: true; undo: UndoRecord } | { ok: false; fail: ApplyFail } {
  if (kindOf(p) === "ekleme") {
    /*
     * `addedBy` ÖNEREN kişi, onaylayan değil: kaydı isteyen odur. Böylece
     * öneriyle eklenen kaydı sonradan düzeltmek de önerene açık kalıyor.
     *
     * İlişki dizileri KAPALI: öneri gövdesi kayıt defterinden süzülüyor ve o
     * diziler zaten deftere girmiyor; bağ yalnız `relation` üstünden, tek bir
     * hedefe kuruluyor.
     */
    const kur = createPerson(data, {
      fields: p.person ?? {},
      relation: p.relation,
      allowLinkArrays: false,
      addedBy: p.by,
    });
    if (!kur.ok) return { ok: false, fail: { kod: kur.fail === "iki-ebeveyn" ? "iki-ebeveyn" : "hedef-yok" } };
    /*
     * Oluşan kaydın kimliği burada üretiliyor ve önerinin içinde YOK. Geri
     * alma "hangi kaydı sileceğim" sorusunu başka hiçbir yerden
     * yanıtlayamaz — ad üstünden aramak, aynı adlı iki kayıtta yanlış
     * kişiyi silerdi.
     */
    /*
     * Oluşan kaydın kimliği burada üretiliyor ve önerinin içinde YOK. Geri
     * alma "hangi kaydı sileceğim" sorusunu başka hiçbir yerden
     * yanıtlayamaz — ad üstünden aramak, aynı adlı iki kayıtta yanlış
     * kişiyi silerdi.
     *
     * Kaydın ANLIK GÖRÜNTÜSÜ ve o an ona bağlanan kayıtlar da saklanıyor:
     * geri alma, aradan geçen sürede kayda ne olduğunu bilmek zorunda.
     * Bilmeden silmek, onay sonrası eklenen biyografiyi, fotoğrafı, eşi ve
     * çocuğu kimseye sormadan çöpe atmak olurdu.
     */
    return {
      ok: true,
      undo: {
        createdId: kur.person.id,
        person: kur.person,
        refs: baglayanlar(data.people, kur.person.id),
      },
    };
  }

  const i = data.people.findIndex((x) => x.id === p.personId);
  /*
   * Kişi arada silinmiş olabilir. Öneriyi "onaylandı" diye işaretleyip
   * uygulayamamak, kayıtta olmayan bir değişikliği olmuş göstermek olurdu.
   */
  if (i === -1) return { ok: false, fail: { kod: "kisi-yok" } };

  if (kindOf(p) === "silme") {
    /*
     * İlişki grafiğinden de düşürülüyor: yalnız kaydı atmak, başkalarının
     * `parentIds`/`spouseIds` listelerinde OLMAYAN bir kimliğe işaret eden
     * bağlar bırakırdı ve o bağlar ekranda sessizce kaybolan ebeveyn/eş
     * olarak görünürdü.
     */
    const kayit = data.people[i];
    const silinen = kayit.id;
    /*
     * KOPARILAN BAĞLAR yazılıyor. Geri alma bunlar olmadan kaydı bağsız bir
     * yetim olarak geri getirirdi: çocukları artık onu ebeveyn olarak
     * listelemiyor ve bu bilgi kaydın kendi `parentIds`inden TÜRETİLEMEZ.
     * Yalnız koparılan bağın kendisi saklanıyor, kaydın tamamı değil —
     * geri koyma eklemeli olsun, aradaki başka düzenlemeleri ezmesin.
     */
    const refs = baglayanlar(data.people, silinen);
    /*
     * TEMİZLİK ORTAK İŞLEVDEN (`scrubDeleted`).
     *
     * Buradaki temizlik elle yazılmıştı ve `parentLinks`i UNUTUYORDU:
     * doğrudan silme yolu (`DELETE /api/family/person/[id]`) `scrubDeleted`
     * çağırıp onu da temizliyor. Yani aynı iş iki yerde ayrı yazılmış ve
     * ayrışmıştı — üstelik `lib/scrub.ts`in dosya başlığı tam olarak bu
     * hatanın bir önceki tekrarını anlatıyor. Öneri yolu üçüncü kopyaydı.
     *
     * Sonucu görünürdü: uygulamanın kendi bütünlük tarayıcısı silinen
     * ebeveyne işaret eden `parentLinks` kaydını `orphanParentLink` diye
     * bildiriyordu.
     */
    data.people = scrubDeleted(data.people, [silinen]);
    return { ok: true, undo: { person: kayit, refs } };
  }

  const uygula = applyProposal(data.people[i], p);
  if (!uygula.ok) return { ok: false, fail: { kod: "bayat", stale: uygula.stale } };
  data.people[i] = uygula.person;
  /*
   * "alan" türünde kayda gerek yok: `changes` zaten `{from, to}` çiftleri
   * taşıyor ve geri alma ikisini yer değiştirmek (`invert`).
   */
  return { ok: true, undo: {} };
}

export type UndoFail = ApplyFail;

/**
 * ONAYI GERİ AL — yapılanın tersini uygular (madde 35/F).
 *
 * Her tür kendi tersini biliyor ve her tersin KENDİ koruması var; ortak bir
 * "ağacı bir önceki hâline döndür" yolu seçilmedi, çünkü o, onaydan sonra
 * BAŞKALARININ yaptığı değişiklikleri de geri alırdı.
 */
export function undoApplied(
  data: FamilyData,
  p: Proposal
): { ok: true } | { ok: false; fail: UndoFail } {
  const u = p.undo;
  if (!u) return { ok: false, fail: { kod: "kayit-yok" } };

  if (kindOf(p) === "ekleme") {
    if (!u.createdId) return { ok: false, fail: { kod: "kayit-yok" } };
    const mevcut = data.people.find((x) => x.id === u.createdId);
    /* Kayıt zaten yok (biri elle silmiş): geri alacak bir şey de yok. */
    if (!mevcut) return { ok: true };

    /*
     * ARADA NE OLDUĞUNA BAKMADAN SİLMİYORUZ.
     *
     * "alan" dalı onaydan sonraki değişiklikleri bayatlık denetimiyle
     * koruyor; bu dalda öyle bir denetim YOKTU ve sonucu şuydu: üye "Nine"
     * eklemeyi öneriyor, yönetici onaylıyor, aile bir hafta boyunca Nine'ye
     * biyografi, fotoğraf, bir eş ve bir çocuk bağlıyor — sonra biri
     * kuyrukta "geri al"a basıyor ve hepsi kaydedilmeden gidiyor. Öneri
     * "bekliyor"a dönüyor; tekrar onaylanırsa BOMBOŞ, yeni kimlikli bir
     * kayıt oluşuyor. Tek kurtarma yolu güncelleme günlüğüydü ve kullanıcıya
     * söylenmiyordu.
     *
     * İki şeye birden bakılıyor, çünkü biri ötekini görmüyor:
     *  · kaydın KENDİSİ değişti mi (biyografi, fotoğraf, eş — eş bağı
     *    karşılıklı olduğu için kaydın kendi dizisine de yazılır),
     *  · kaydı GÖSTEREN başvurular değişti mi (çocuk eklenince yalnız
     *    ÇOCUĞUN `parentIds`i değişir, kaydın kendisi hiç değişmez).
     */
    if (u.person && damga(mevcut) !== damga(u.person))
      return { ok: false, fail: { kod: "degismis" } };
    if (u.refs && damga(baglayanlar(data.people, u.createdId)) !== damga(u.refs))
      return { ok: false, fail: { kod: "degismis" } };

    const sil: Proposal = { ...p, kind: "silme", personId: u.createdId, changes: {} };
    const r = applyToTree(data, sil);
    return r.ok ? { ok: true } : r;
  }

  if (kindOf(p) === "silme") {
    if (!u.person) return { ok: false, fail: { kod: "kayit-yok" } };
    const anlik = u.person as Person;
    const varOlan = new Set(data.people.map((x) => x.id));
    /*
     * KAYDIN KENDİ BAĞLARI DA SÜZÜLÜYOR.
     *
     * Anlık görüntü olduğu gibi geri konuyordu ve içindeki hedefler hâlâ
     * var mı diye bakılmıyordu. Karşı taraf (`refs`) için `if (!x) continue`
     * koruması vardı, kaydın kendi tarafı korunmuyordu.
     *
     * Senaryo: A (eşi B) siliniyor, yönetici arada B'yi de siliyor, sonra
     * A'nın silinmesi geri alınıyor → A.spouseIds hâlâ ["B"] ve B yok.
     * Uygulamanın bütünlük tarayıcısı bunu `error` seviyesinde
     * `danglingSpouse` diye bildiriyor.
     */
    const geri: Person = {
      ...anlik,
      parentIds: (anlik.parentIds ?? []).filter((id) => varOlan.has(id)),
      spouseIds: (anlik.spouseIds ?? []).filter((id) => varOlan.has(id)),
      ...(anlik.formerSpouseIds
        ? { formerSpouseIds: anlik.formerSpouseIds.filter((id) => varOlan.has(id)) }
        : {}),
      ...(anlik.associations
        ? { associations: anlik.associations.filter((a) => varOlan.has(a.personId)) }
        : {}),
      ...(anlik.parentLinks
        ? {
            parentLinks: Object.fromEntries(
              Object.entries(anlik.parentLinks).filter(([pid]) => varOlan.has(pid))
            ),
          }
        : {}),
    };
    // Zaten geri konmuşsa (ikinci istek, yeniden deneme) sessizce geçiyoruz.
    if (!varOlan.has(geri.id)) data.people.push(geri);
    /*
     * Bağlar EKLEMELİ konuyor: dizinin tamamı geri yazılsaydı, silmeden
     * SONRA o kayda eklenen bir eş/ebeveyn sessizce kaybolurdu.
     */
    for (const ref of u.refs ?? []) {
      const x = data.people.find((y) => y.id === ref.id);
      if (!x) continue;
      /*
       * İKİ EBEVEYN SINIRI GERİ ALMADA DA GEÇERLİ.
       *
       * Bağlar eklemeli konuyor ama sınır sınanmıyordu: A silinince C'nin
       * ebeveyni [B] kalıyor, yönetici boşalan yere D ekliyor, sonra silme
       * geri alınınca C üç ebeveynli oluyor — ve bütünlük tarayıcısı bunu
       * YAKALAMIYOR. Aynı sınır `createPerson` ve düzenleme formunda
       * zorlanıyor; yalnız bu yol dışarıda kalmıştı.
       *
       * Sessizce atlamak yerine REDDEDİYORUZ: atlamak, geri alındığı
       * sanılan bir bağı kimseye söylemeden kaybetmek olurdu.
       */
      if (ref.parent && !x.parentIds.includes(geri.id)) {
        if (x.parentIds.length >= 2) return { ok: false, fail: { kod: "iki-ebeveyn" } };
        x.parentIds.push(geri.id);
      }
      if (ref.spouse && !x.spouseIds.includes(geri.id)) x.spouseIds.push(geri.id);
      if (ref.former && !(x.formerSpouseIds ?? []).includes(geri.id))
        x.formerSpouseIds = [...(x.formerSpouseIds ?? []), geri.id];
      if (ref.assoc && !(x.associations ?? []).some((a) => a.personId === geri.id))
        x.associations = [...(x.associations ?? []), ref.assoc];
    }
    return { ok: true };
  }

  /*
   * "alan": ters öneri uygulanıyor. Bayatlık denetimi böylece "kayıt hâlâ
   * onaylandığı gibi mi?" sorusuna dönüşüyor — onaydan sonra biri aynı
   * alanı değiştirdiyse geri alma REDDEDİLİYOR, yoksa aradaki değişikliği
   * sessizce silerdi.
   */
  const i = data.people.findIndex((x) => x.id === p.personId);
  if (i === -1) return { ok: false, fail: { kod: "kisi-yok" } };
  const ters = applyProposal(data.people[i], invert(p));
  if (!ters.ok) return { ok: false, fail: { kod: "bayat", stale: ters.stale } };
  data.people[i] = ters.person;
  return { ok: true };
}

/** Uygulama hatasının kullanıcıya gösterilecek karşılığı. */
export function applyFailMessage(f: ApplyFail): string {
  switch (f.kod) {
    case "kisi-yok":
      return "Öneri edilen kişi artık yok.";
    case "hedef-yok":
      return "Öneride bağlanacak kişi artık yok.";
    case "iki-ebeveyn":
      return "Bağlanacak kişinin zaten iki ebeveyni var.";
    case "bayat":
      return "Bu öneri yazıldığından beri alanlar değişmiş; uygulamak yeni bilgiyi silerdi.";
    case "kayit-yok":
      return "Bu onayın geri alma kaydı yok.";
    case "degismis":
      return "Bu kayıt onaydan sonra değişti; geri almak o değişiklikleri de silerdi. Kaydı gerçekten kaldırmak istiyorsan doğrudan sil.";
  }
}
