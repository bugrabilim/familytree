import type { Person } from "@/types/family";
import { assignParentSlots } from "./fan.ts";

/**
 * "Yedi Göbek" tamamlanma ölçeri — SAF, bağımlılıksız.
 *
 * Türkçede "yedi göbek" / "yedi ceddini bilmek" deyimi zaten var; ölçü birimi
 * hazır. Kazak *жеті ата* sayacının yaptığı işi yapar: soy bilgisini bir
 * **hedefe** çevirir ve paylaşılabilir bir sayı verir.
 *
 * ## Neden `lib/relations.ts`'teki `ancestorDepths` kullanılmıyor?
 *
 * O fonksiyon tüm ataları TEK bir `Map<id, derinlik>` içinde birleştiriyor.
 * Bu işin bütün amacı ise anne hattını baba hattından **ayrı** puanlamak:
 * e-Devlet'in en çok şikâyet edilen tarafı anne tarafının kesilmesi, ve
 * birleştirilmiş bir derinlik haritası tam da o ayrımı siliyor.
 *
 * Bu yüzden burada **ahnentafel** yürüyüşü var: her ata, kendisine giden
 * F/M adımlarının dizisiyle (`"MMF"` = annenin annesinin babası) adreslenir.
 *
 * ## Kan bağı
 *
 * "Yedi göbek" bir **kan** kavramıdır (yedi kuşak içinde evlenme yasağından
 * doğmuştur). Bu yüzden evlat edinen / üvey / koruyucu ebeveyn varsayılan
 * olarak SAYILMAZ — `biologicalOnly: false` ile katılabilir. Bağ silinmez,
 * yalnız bu sayaçta hesaba katılmaz.
 *
 * ## Belirsiz ebeveyn
 *
 * Baba yuvası cinsiyeti "male", anne yuvası "female" olan ilk ebeveyndir.
 * Cinsiyetler ayırt edilemiyorsa `parentIds` sırası kullanılır (0 → baba
 * yuvası, 1 → anne yuvası). Bu, veriyi değiştirmez; yalnız yuva atamasıdır.
 */

/** Kaç göbek sayılır. "Yedi göbek" deyimi bu 7'yi verir. */
export const MAX_DEPTH = 7;

export type ParentSlot = "father" | "mother";

/** Bir ata yuvası: `""` kişinin kendisi, `"F"` baba, `"MM"` anneanne… */
export type LineagePath = string;

export interface Gap {
  /** Eksik atanın yolu, ör. `"MMF"`. */
  path: LineagePath;
  /** Bu atanın çocuğu — kullanıcının kart ekleyeceği kişi. */
  childId: string;
  /** Çocuğun hangi ebeveyni eksik. */
  missing: ParentSlot;
  /** Kaçıncı göbek (1 = ebeveyn). */
  generation: number;
}

export interface GenerationScore {
  /** 1 = ebeveynler, 2 = büyükanne/babalar … */
  generation: number;
  known: number;
  /** 2^generation */
  total: number;
}

export interface LineScore {
  path: LineagePath;
  known: number;
  total: number;
  /** Bu hatta ulaşılan en derin göbek (kişiden itibaren). */
  deepest: number;
}

export interface Completeness {
  /** Tüm yuvaları dolu olan en derin göbek — "kesintisiz kaç göbek". */
  unbrokenDepth: number;
  /** En uzun tek zincir — tek bir koldan inilen en derin göbek. */
  deepestChain: number;
  known: number;
  /** 7 göbekteki olası ata sayısı: 2+4+…+128 = 254. */
  total: number;
  generations: GenerationScore[];
  /** Anne/baba hattı (1. göbek) ve dört büyük hat (2. göbek). */
  lines: LineScore[];
  /** Oranı en düşük hat — "buraya bak" demek için. Beraberlikte daha sığ olan. */
  weakest: LineScore | null;
  /** Doldurulabilecek en yakın boşluklar (göbeğe göre sıralı). */
  gaps: Gap[];
}

export interface CompletenessOptions {
  /** Evlat edinen/üvey/koruyucu bağları sayma (varsayılan: sayma). */
  biologicalOnly?: boolean;
  /** Kaç göbek sayılsın (varsayılan 7). */
  maxDepth?: number;
  /** Kaç boşluk döndürülsün (varsayılan 12). */
  gapLimit?: number;
}

/* ------------------------------------------------------------------ Yardımcı */

function isBiological(child: Person, parentId: string): boolean {
  const kind = child.parentLinks?.[parentId]?.kind;
  return kind === undefined || kind === "biological";
}

/** Kişinin baba/anne yuvalarını çözer. */
function slotsOf(
  person: Person,
  byId: Map<string, Person>,
  biologicalOnly: boolean
): { father?: Person; mother?: Person } {
  const ids = (person.parentIds ?? []).filter(
    (pid) => !biologicalOnly || isBiological(person, pid)
  );
  const parents = ids
    .map((pid) => byId.get(pid))
    .filter((p): p is Person => !!p);

  // Yuva ayrımı TEK yerde (`lib/fan.ts`): iki anneli kişide ikinci annenin
  // sessizce düşmesi tam da bu kuralın kopyalanmasından doğmuştu.
  const [father, mother] = assignParentSlots(parents);
  return { father, mother };
}

/** `"F"` → baba, `"MM"` → anneanne … i18n anahtarı (bilinen yollar için). */
export function lineLabelKey(path: LineagePath): string | null {
  const known: Record<string, string> = {
    F: "lineage.father",
    M: "lineage.mother",
    FF: "lineage.paternalGrandfather",
    FM: "lineage.paternalGrandmother",
    MF: "lineage.maternalGrandfather",
    MM: "lineage.maternalGrandmother",
  };
  return known[path] ?? null;
}

/* -------------------------------------------------------------------- Ölçer */

/**
 * Bir kişi için yedi göbek tamamlanma durumu.
 *
 * Döngüye karşı güvenli: yürüyüş `maxDepth` ile sınırlı olduğundan bozuk
 * veride bile sonlanır.
 */
export function completeness(
  rootId: string,
  people: Person[],
  opts: CompletenessOptions = {}
): Completeness {
  const biologicalOnly = opts.biologicalOnly ?? true;
  const maxDepth = opts.maxDepth ?? MAX_DEPTH;
  const gapLimit = opts.gapLimit ?? 12;

  const byId = new Map(people.map((p) => [p.id, p]));
  const root = byId.get(rootId);

  /** yol → ata. Kök `""` olarak durur ama sayıma girmez. */
  const filled = new Map<LineagePath, Person>();
  const gaps: Gap[] = [];

  if (root) {
    filled.set("", root);
    // Genişlik öncelikli: yakın göbekler önce, boşluklar da öyle sıralanır.
    const queue: Array<{ path: LineagePath; person: Person; depth: number }> = [
      { path: "", person: root, depth: 0 },
    ];
    while (queue.length) {
      const cur = queue.shift()!;
      if (cur.depth >= maxDepth) continue;
      const { father, mother } = slotsOf(cur.person, byId, biologicalOnly);
      const pairs: Array<[ParentSlot, Person | undefined, string]> = [
        ["father", father, "F"],
        ["mother", mother, "M"],
      ];
      for (const [slot, parent, letter] of pairs) {
        const path = cur.path + letter;
        if (parent) {
          filled.set(path, parent);
          queue.push({ path, person: parent, depth: cur.depth + 1 });
        } else {
          gaps.push({
            path,
            childId: cur.person.id,
            missing: slot,
            generation: cur.depth + 1,
          });
        }
      }
    }
  }

  /* --- Göbek başına sayım --- */
  const generations: GenerationScore[] = [];
  let known = 0;
  let total = 0;
  let unbrokenDepth = 0;
  for (let g = 1; g <= maxDepth; g++) {
    let count = 0;
    for (const path of filled.keys()) if (path.length === g) count++;
    const slots = 2 ** g;
    generations.push({ generation: g, known: count, total: slots });
    known += count;
    total += slots;
    if (count === slots && unbrokenDepth === g - 1) unbrokenDepth = g;
  }

  /* --- En uzun tek zincir --- */
  let deepestChain = 0;
  for (const path of filled.keys()) {
    if (path.length > deepestChain) deepestChain = path.length;
  }

  /* --- Hatlar: 1. göbekte 2, 2. göbekte 4 --- */
  const lines: LineScore[] = [];
  for (const prefix of ["F", "M", "FF", "FM", "MF", "MM"]) {
    const depthLeft = maxDepth - prefix.length;
    if (depthLeft < 0) continue;
    let count = 0;
    let deepest = 0;
    for (const path of filled.keys()) {
      if (path.length >= prefix.length && path.startsWith(prefix)) {
        count++;
        if (path.length > deepest) deepest = path.length;
      }
    }
    // Kendi yuvası + altındaki tüm yuvalar: 1 + 2 + 4 + … = 2^(depthLeft+1) - 1
    lines.push({ path: prefix, known: count, total: 2 ** (depthLeft + 1) - 1, deepest });
  }

  // En zayıf: oran en düşük; eşitlikte daha sığ olan.
  let weakest: LineScore | null = null;
  for (const l of lines) {
    if (l.path.length !== 1) continue; // anne/baba hattı düzeyinde karşılaştır
    if (
      !weakest ||
      l.known / l.total < weakest.known / weakest.total ||
      (l.known / l.total === weakest.known / weakest.total && l.deepest < weakest.deepest)
    ) {
      weakest = l;
    }
  }

  gaps.sort((a, b) => a.generation - b.generation || a.path.localeCompare(b.path));

  return {
    unbrokenDepth,
    deepestChain,
    known,
    total,
    generations,
    lines,
    weakest,
    gaps: gaps.slice(0, gapLimit),
  };
}
