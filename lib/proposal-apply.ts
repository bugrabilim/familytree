import { applyProposal, kindOf, type Proposal } from "@/lib/proposals";
import { createPerson } from "@/lib/person-create";
import type { FamilyData } from "@/types/family";

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
  | { kod: "bayat"; stale: string[] };

export function applyToTree(
  data: FamilyData,
  p: Proposal
): { ok: true } | { ok: false; fail: ApplyFail } {
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
    return { ok: true };
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
    const silinen = data.people[i].id;
    data.people = data.people
      .filter((x) => x.id !== silinen)
      .map((x) => ({
        ...x,
        parentIds: (x.parentIds ?? []).filter((id) => id !== silinen),
        spouseIds: (x.spouseIds ?? []).filter((id) => id !== silinen),
        ...(x.formerSpouseIds ? { formerSpouseIds: x.formerSpouseIds.filter((id) => id !== silinen) } : {}),
        ...(x.associations ? { associations: x.associations.filter((a) => a.personId !== silinen) } : {}),
      }));
    return { ok: true };
  }

  const uygula = applyProposal(data.people[i], p);
  if (!uygula.ok) return { ok: false, fail: { kod: "bayat", stale: uygula.stale } };
  data.people[i] = uygula.person;
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
      return "Bu öneri yazıldığından beri alanlar değişmiş; onaylamak yeni bilgiyi silerdi.";
  }
}
