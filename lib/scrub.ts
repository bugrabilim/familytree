import type { Person } from "../types/family.ts";

/**
 * Silinen kişilere yapılan başvuruları temizler — saf, test edilebilir.
 *
 * ## Neden ayrı bir dosya
 *
 * Bu mantık İKİ rotada birden gerekiyor (tekli `DELETE` ve toplu silme) ve
 * ikisi birbirinden ayrı düşmüştü: toplu silme `formerSpouseIds`i de
 * temizliyordu, tekli silme temizlemiyordu — üstelik toplu silmenin yorumu
 * "tekli DELETE ile aynı mantık" diyordu. İkisi de `associations` ve
 * `parentLinks`e hiç dokunmuyordu.
 *
 * Sonuç ölçüldü: eski eşi ya da "çevre" bağı olan bir kişiyi silmek,
 * uygulamanın KENDİ bütünlük tarayıcısının (`lib/refcheck.ts`) `error`
 * seviyesinde bildirdiği iki sorun bırakıyordu — bir de öksüz `parentLinks`
 * uyarısı. Yani sıradan bir işlem, kalıcı bir veri hatası üretiyordu.
 *
 * Ayrıca GEDCOM dışa aktarımında öksüz `formerSpouseIds`, eşi olmayan tek
 * taraflı bir aile kaydı üretiyordu: `1 HUSB @I1@ / 1 DIV Y` — partneri
 * olmayan bir boşanma.
 */
export function scrubDeleted(people: readonly Person[], deleted: Iterable<string>): Person[] {
  const del = deleted instanceof Set ? deleted : new Set(deleted);
  if (del.size === 0) return people as Person[];

  return (people as Person[])
    .filter((p) => !del.has(p.id))
    .map((p) => {
      const out: Person = {
        ...p,
        parentIds: p.parentIds.filter((id) => !del.has(id)),
        spouseIds: p.spouseIds.filter((id) => !del.has(id)),
      };

      /*
       * İsteğe bağlı alanlar YOKSA yaratılmıyor: `formerSpouseIds` hiç
       * olmayan bir kişide boş dizi bırakmak, kaydı gereksiz büyütür ve
       * "eskiden eşi vardı" izlenimi verir.
       */
      if (p.formerSpouseIds) {
        out.formerSpouseIds = p.formerSpouseIds.filter((id) => !del.has(id));
      }
      if (p.associations) {
        out.associations = p.associations.filter((a) => !del.has(a.personId));
      }
      if (p.parentLinks) {
        const kalan = Object.fromEntries(
          Object.entries(p.parentLinks).filter(([pid]) => !del.has(pid))
        );
        /*
         * Boşalırsa alanı TEMİZLE. Boş bir nesne bırakmak, kaydı okuyan
         * yerlerde "bağ notu var" gibi görünürdü; ve bir gün o kişi yeniden
         * ebeveyn olarak eklenirse bayat bir notu diriltme riski doğardı.
         */
        out.parentLinks = Object.keys(kalan).length ? kalan : undefined;
      }

      return out;
    });
}
