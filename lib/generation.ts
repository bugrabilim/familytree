import type { Person } from "@/types/family";
import {
  findRelationPath,
  NAMED_ANCESTOR_DEPTH,
  NAMED_DESCENDANT_DEPTH,
  type PersonIndex,
} from "./relations.ts";

/**
 * KUŞAK ADI / RÜTBESİ — hesaplanan etiket (yol haritası md. 61).
 *
 * ## Neden `Person`'a alan EKLENMİYOR — buraya bakan herkes önce bunu okusun
 *
 * Kuşak adı bir ÖLÇÜMDÜR, bir kayıt değil: "iki kişi arasında kaç doğum var"
 * sorusunun cevabı. Cevabı belirleyen tek şey ebeveyn bağları, ve o bağlar
 * ağaç düzenlendikçe değişiyor — bir kişiye ebeveyn eklenmesi, yanlış bağın
 * kopartılması, iki kaydın birleştirilmesi (`lib/duplicates.ts`), evlat
 * edinme bağının kan bağına çevrilmesi… hepsi aynı kişinin rütbesini
 * kaydırır.
 *
 * Bu değer `Person`'a yazılsaydı (elle girilerek ya da "performans olsun"
 * diye bir kez hesaplanıp saklanarak) ilk ebeveyn düzenlemesinde SESSİZCE
 * yanlışa dönerdi: hiçbir doğrulama patlamaz, hiçbir uyarı çıkmaz, kart
 * yalnızca yanlış bir şey yazar ve kimse fark etmez. Türetilmiş bir değerin
 * tek doğru yeri türetildiği yerdir — yani burası.
 *
 * Ayrıca rütbe MUTLAK değil, GÖRELİdir: aynı kişi dedesinin gözünden
 * "torun kuşağı", torununun gözünden "dede kuşağı"dır. Tek bir kişiye
 * yazılabilecek tek bir doğru değer zaten yok.
 *
 * Kapı testi: `tests/generation.test.mts` — `Person`'da kuşak alanı olmadığını
 * ve etiketin kaynakta türetildiğini kaynak düzeyinde doğrular.
 *
 * ## Neden ayrı dosya, `lib/relations.ts` değil
 *
 * `relations.ts` "bu kişi bana kimdir?" sorusunu cevaplıyor: TEKİL, cinsiyetli
 * ve taraflı bir ad üretiyor ("Anneanne", "Baldız"). Buradaki soru başka:
 * "bu kişi hangi basamakta?" — ÇOĞUL bir kümenin adı, cinsiyetsiz ve
 * tarafsız. İkisi aynı dosyada olsaydı 750 satırlık `relations.ts` büyümeye
 * devam ederdi. Ama sözlük ÇATALLANMIYOR: basamak adlarının nerede bitip
 * sayıya döndüğü `relations.ts`'ten (`NAMED_ANCESTOR_DEPTH` /
 * `NAMED_DESCENDANT_DEPTH`) İTHAL EDİLİYOR, burada yeniden yazılmıyor.
 * Böylece çekmecedeki akrabalık rozeti "Büyük büyük dede" derken kuşak
 * rozetinin "5. kuşak ata" demesi mümkün değil.
 *
 * ## Terminolojinin kaynağı
 *
 * - Kavram: `docs/REKABET-ARASTIRMASI-2.md` — Kore'deki **항렬 (kuşak rütbesi)**
 *   satırı; aynı ocaktan iki kişinin kuşak SIRASINI hesaplayan kural.
 * - Ölçü birimi: `docs/REKABET-ARASTIRMASI-2.md` "yedi göbek / yedi ceddini
 *   bilmek" ve `lib/completeness.ts` — "göbek" zaten bu depoda ata basamağının
 *   birimi.
 * - Sözcükler: `lib/relations.ts` merdiveni — yukarı `dede`/`nine` + `büyük`
 *   önekleri, aşağı `çocuk` → `torun` → `torun çocuğu`. Sözcüklerin kendisi
 *   `lib/i18n-dict.ts`'te (bu depoda kullanıcıya giden her metin orada), ama
 *   HANGİ mesafeye kadar adın olduğu buradan geliyor.
 *
 * ## Saf ve bağımlılıksız
 *
 * Çalışma zamanında yalnızca `./relations.ts` (o da yalnız tip düzeyinde
 * `@/…` kullanıyor) içe aktarılıyor; böylece `node --experimental-strip-types`
 * altında birim testi koşulabiliyor (bkz. `CLAUDE.md`).
 */

export type GenerationDirection = "same" | "up" | "down";

export interface GenerationRank {
  /** İşaretli kuşak farkı: + yukarı (ata yönü), − aşağı (soy yönü). */
  offset: number;
  /** Mutlak kuşak mesafesi — `|offset|`. 0 = aynı kuşak. */
  distance: number;
  direction: GenerationDirection;
  /** `lib/i18n-dict.ts` anahtarı. Görünüm `t(key, params)` ile basar. */
  key: string;
  /** `t()` interpolasyon parametreleri (sayısal biçim için `count`). */
  params: { count: number };
  /**
   * Yerleşik bir basamak adı bulundu mu (true), yoksa sayısal biçime mi
   * düşüldü (false)? Görünüm bunu bilmek zorunda değil ama test ve gelecekteki
   * "adı olan basamaklar" listeleri buna bakar.
   */
  named: boolean;
}

/**
 * Mesafeden etiket — grafik gerektirmez, tamamen saf.
 *
 * `offset` işaretli: pozitif yukarı (ata), negatif aşağı (soy). Yön ÖNEMLİ,
 * çünkü Türkçede iki yön aynı sözcüklerle adlandırılmıyor: yukarısı
 * dede/nine merdiveni, aşağısı torun merdiveni.
 *
 * ## Adın bittiği yer neden orası
 *
 * Yukarıda `NAMED_ANCESTOR_DEPTH`, aşağıda `NAMED_DESCENDANT_DEPTH`'e kadar
 * yerleşik ad var; ötesi `"{n}. kuşak ata"` / `"{n}. kuşak torun"` biçimine
 * düşüyor. Sınır keyfi değil: `lib/relations.ts` akrabalık adını TAM O
 * NOKTADA sayıya çeviriyor ("büyük büyük dede"den sonra "5. kuşak dede").
 * Aynı sınırı kullanmak, yan yana duran iki rozetin birbirini yalanlamamasını
 * garanti ediyor. Sonsuza kadar "büyük büyük büyük büyük…" üretmek de zaten
 * okunabilir bir ad değil, sayının uzun yazılmış hâli olurdu.
 */
export function describeGeneration(offset: number): GenerationRank {
  const distance = Math.abs(offset);
  const direction: GenerationDirection = offset === 0 ? "same" : offset > 0 ? "up" : "down";
  const params = { count: distance };

  if (direction === "same") {
    return { offset, distance, direction, key: "generation.same", params, named: true };
  }

  const sinir = direction === "up" ? NAMED_ANCESTOR_DEPTH : NAMED_DESCENDANT_DEPTH;
  const named = distance <= sinir;
  const key = named ? `generation.${direction}.${distance}` : `generation.${direction}`;
  return { offset, distance, direction, key, params, named };
}

/**
 * Kök (odak) kişinin gözünden hedef kişinin kuşak rütbesi.
 *
 * Mesafe, `lib/relations.ts`'in EN KISA akrabalık yolundan sayılıyor —
 * akrabalık adını üreten yolun aynısı, ki iki rozet aynı yoldan konuşsun:
 *   ebeveyn adımı → +1, çocuk adımı → −1, evlilik adımı → 0.
 *
 * Evlilik adımının 0 sayılması bilinçli: eş, soy zincirinin bir halkası
 * değil ama kuşak basamağı olarak eşiyle aynı sırada durur. Bu sayede
 * "eşinin dedesi" de "amca" da doğru basamağa düşüyor — amca kan hattında
 * yan dalda, ama kuşak rütbesi olarak ebeveyn kuşağındadır. `항렬`'in
 * yaptığı ayrım da tam budur.
 *
 * Bağlantısız / bilinmeyen kişide **null** döner — boş dize değil: "etiket
 * yok" ile "etiket boş" farklı şeyler, ve görünüm rozeti hiç çizmemeli.
 */
export function generationRank(
  rootId: string,
  targetId: string,
  people: Person[],
  idx: PersonIndex
): GenerationRank | null {
  if (!idx.has(rootId) || !idx.has(targetId)) return null;
  if (rootId === targetId) return describeGeneration(0);

  const path = findRelationPath(rootId, targetId, people, idx);
  if (!path) return null;

  let offset = 0;
  for (const step of path) {
    if (step.move === "parent") offset += 1;
    else if (step.move === "child") offset -= 1;
  }
  return describeGeneration(offset);
}
