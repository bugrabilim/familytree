import { applyProposal, invert, kindOf, type Proposal, type RemovedRef, type UndoRecord } from "@/lib/proposals";
import { createPerson } from "@/lib/person-create";
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
  | { kod: "kayit-yok" };

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
    return { ok: true, undo: { createdId: kur.person.id } };
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
    const refs: RemovedRef[] = [];
    for (const x of data.people) {
      if (x.id === silinen) continue;
      const assoc = x.associations?.find((a) => a.personId === silinen);
      const ref: RemovedRef = {
        id: x.id,
        ...((x.parentIds ?? []).includes(silinen) ? { parent: true } : {}),
        ...((x.spouseIds ?? []).includes(silinen) ? { spouse: true } : {}),
        ...((x.formerSpouseIds ?? []).includes(silinen) ? { former: true } : {}),
        ...(assoc ? { assoc } : {}),
      };
      if (ref.parent || ref.spouse || ref.former || ref.assoc) refs.push(ref);
    }
    data.people = data.people
      .filter((x) => x.id !== silinen)
      .map((x) => ({
        ...x,
        parentIds: (x.parentIds ?? []).filter((id) => id !== silinen),
        spouseIds: (x.spouseIds ?? []).filter((id) => id !== silinen),
        ...(x.formerSpouseIds ? { formerSpouseIds: x.formerSpouseIds.filter((id) => id !== silinen) } : {}),
        ...(x.associations ? { associations: x.associations.filter((a) => a.personId !== silinen) } : {}),
      }));
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
    /*
     * Eklenen kayıt siliniyor — bağlarıyla birlikte, doğrudan silmeyle aynı
     * kural. Kayıt yoksa (biri elle silmişse) geri alacak bir şey de yok.
     */
    if (!u.createdId) return { ok: false, fail: { kod: "kayit-yok" } };
    const sil: Proposal = { ...p, kind: "silme", personId: u.createdId, changes: {} };
    const r = applyToTree(data, sil);
    return r.ok ? { ok: true } : r;
  }

  if (kindOf(p) === "silme") {
    if (!u.person) return { ok: false, fail: { kod: "kayit-yok" } };
    const geri = u.person as Person;
    // Zaten geri konmuşsa (ikinci istek, yeniden deneme) sessizce geçiyoruz.
    if (!data.people.some((x) => x.id === geri.id)) data.people.push(geri);
    /*
     * Bağlar EKLEMELİ konuyor: dizinin tamamı geri yazılsaydı, silmeden
     * SONRA o kayda eklenen bir eş/ebeveyn sessizce kaybolurdu.
     */
    for (const ref of u.refs ?? []) {
      const x = data.people.find((y) => y.id === ref.id);
      if (!x) continue;
      if (ref.parent && !x.parentIds.includes(geri.id)) x.parentIds.push(geri.id);
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
  }
}
