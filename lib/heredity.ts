import type { Person } from "@/types/family";

/**
 * Kalıtsal durum örüntüsü — SAF, bağımlılıksız.
 *
 * Ağaçtaki sağlık kayıtlarını bir duruma göre gruplar ve o durumun aile
 * içinde nasıl dağıldığını **betimler**. Yeni alan eklemez: `congenitalCondition`,
 * `healthCondition` ve `deathCause` zaten var.
 *
 * ## Kural: RİSK HESAPLANMAZ
 *
 * Bu dosyada olasılık matematiği YOKTUR ve olmayacaktır. "Taşıma ihtimaliniz
 * %25" demek, yazılımı tıbbi cihaz mevzuatının kapsamına sokar. Burada yalnız
 * **kimde var, kimler arasında bağ var** bildirilir — betimleme, tahmin değil.
 * Buraya olasılık döndüren bir fonksiyon eklemek ürünün hukuki sınıfını
 * değiştirir; eklenmesi gerekiyorsa önce o karar verilmelidir.
 *
 * ## Gizlilik: `view()`'dan GEÇMİŞ veri bekler
 *
 * Sağlık alanları `lib/privacy.ts` içinde `health` grubundadır ve maskelenmiş
 * kişilerde silinir. Çağıran taraf **maskelenmiş** listeyi vermelidir; o zaman
 * gizlenmiş kayıtlar kendiliğinden eşleşmez. Ham listeyi vermek, gizlilik
 * katmanını atlatmak olur.
 *
 * ## Kan derecesi dışarıdan gelir
 *
 * `lib/relations.ts`'teki `bloodDegrees` çalışma zamanı bağımlılığı olurdu ve
 * bu dosyayı birim testi koşulamaz hâle getirirdi. Derece isteniyorsa çağıran
 * hesaplayıp `degrees` ile verir.
 */

export type ConditionSource =
  /** Doğuştan (`congenitalCondition`). */
  | "congenital"
  /** Sonradan (`healthCondition`). */
  | "acquired"
  /** Ölüm nedeni olarak kayıtlı (`deathCause`). */
  | "fatal";

/** Serbest metinde birden çok durum: "astım, tansiyon" → iki durum. */
function splitConditions(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;/]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** `lib/duplicates.ts` ve `lib/surnames.ts` ile aynı Türkçe katlama. */
function fold(s: string): string {
  return s
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u")
    .replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export interface PersonCondition {
  key: string;
  /** Özgün yazım. */
  label: string;
  source: ConditionSource;
}

/** Bir kişinin kayıtlı durumları (üç alandan da toplanır). */
export function conditionsOf(person: Person): PersonCondition[] {
  const out: PersonCondition[] = [];
  const push = (raw: string | undefined, source: ConditionSource) => {
    for (const label of splitConditions(raw)) {
      const key = fold(label);
      if (key) out.push({ key, label, source });
    }
  };
  push(person.congenitalCondition, "congenital");
  push(person.healthCondition, "acquired");
  push(person.deathCause, "fatal");
  return out;
}

export interface ConditionAggregate {
  key: string;
  /** Gösterilecek yazım — en sık geçen özgün biçim. */
  label: string;
  /** Bu durumu taşıyan kişi sayısı (bir kişi bir kez sayılır). */
  count: number;
  congenital: number;
  acquired: number;
  fatal: number;
  personIds: string[];
}

const collator = new Intl.Collator("tr");

/** Ağaçtaki durumlar, yaygınlığa göre. */
export function aggregateConditions(people: Person[]): ConditionAggregate[] {
  const groups = new Map<
    string,
    {
      key: string;
      spellings: Map<string, number>;
      byPerson: Map<string, Set<ConditionSource>>;
    }
  >();

  for (const p of people) {
    for (const c of conditionsOf(p)) {
      let g = groups.get(c.key);
      if (!g) { g = { key: c.key, spellings: new Map(), byPerson: new Map() }; groups.set(c.key, g); }
      g.spellings.set(c.label, (g.spellings.get(c.label) ?? 0) + 1);
      const set = g.byPerson.get(p.id) ?? new Set<ConditionSource>();
      set.add(c.source);
      g.byPerson.set(p.id, set);
    }
  }

  const out: ConditionAggregate[] = [...groups.values()].map((g) => {
    const label = [...g.spellings.entries()]
      .sort((a, b) => b[1] - a[1] || collator.compare(a[0], b[0]))[0][0];
    let congenital = 0, acquired = 0, fatal = 0;
    for (const sources of g.byPerson.values()) {
      if (sources.has("congenital")) congenital++;
      if (sources.has("acquired")) acquired++;
      if (sources.has("fatal")) fatal++;
    }
    return {
      key: g.key,
      label,
      count: g.byPerson.size,
      congenital, acquired, fatal,
      personIds: [...g.byPerson.keys()],
    };
  });

  return out.sort((a, b) => b.count - a.count || collator.compare(a.label, b.label));
}

export interface AffectedPerson {
  personId: string;
  sources: ConditionSource[];
  /**
   * Seçilen merkeze kan derecesi. `degrees` verilmediyse null.
   * **Bu bir risk değildir** — yalnız akrabalık uzaklığıdır.
   */
  bloodDegree: number | null;
}

/** Etkilenen bir ebeveyn ile etkilenen çocuğu — görünür kalıtım halkası. */
export interface InheritanceLink {
  parentId: string;
  childId: string;
}

export interface ConditionTrace {
  key: string;
  label: string;
  affected: AffectedPerson[];
  /**
   * Etkilenen ebeveyn → etkilenen çocuk çiftleri. Kalıtımın ağaçta
   * **görünen** kısmı; iddia değil gözlem.
   */
  links: InheritanceLink[];
  /**
   * Etkilenenler arasındaki en uzun kesintisiz ebeveyn-çocuk zincirinin
   * kaç kuşağa yayıldığı (tek kişi → 1).
   */
  generationsSpanned: number;
}

export interface TraceOptions {
  /** Merkeze göre kan dereceleri (`lib/relations.ts` → `bloodDegrees`). */
  degrees?: Map<string, number>;
}

/**
 * Bir durumun ağaçtaki izi.
 *
 * `key` katlanmış anahtardır (`aggregateConditions` çıktısındaki `key`).
 * Bulunamazsa boş bir iz döner.
 */
export function traceCondition(
  key: string,
  people: Person[],
  opts: TraceOptions = {}
): ConditionTrace {
  const wanted = fold(key);
  const sourcesById = new Map<string, Set<ConditionSource>>();
  const spellings = new Map<string, number>();

  for (const p of people) {
    for (const c of conditionsOf(p)) {
      if (c.key !== wanted) continue;
      const set = sourcesById.get(p.id) ?? new Set<ConditionSource>();
      set.add(c.source);
      sourcesById.set(p.id, set);
      spellings.set(c.label, (spellings.get(c.label) ?? 0) + 1);
    }
  }

  const label =
    [...spellings.entries()].sort((a, b) => b[1] - a[1] || collator.compare(a[0], b[0]))[0]?.[0] ?? "";

  const affected: AffectedPerson[] = [...sourcesById.entries()].map(([personId, set]) => ({
    personId,
    sources: [...set],
    bloodDegree: opts.degrees?.get(personId) ?? null,
  }));

  // Etkilenen ebeveyn → etkilenen çocuk
  const links: InheritanceLink[] = [];
  const childrenOf = new Map<string, string[]>();
  for (const p of people) {
    if (!sourcesById.has(p.id)) continue;
    for (const pid of p.parentIds ?? []) {
      if (!sourcesById.has(pid)) continue;
      links.push({ parentId: pid, childId: p.id });
      childrenOf.set(pid, [...(childrenOf.get(pid) ?? []), p.id]);
    }
  }

  /*
   * En uzun kesintisiz zincir — TOPOLOJİK sıra üzerinde, özyinelemesiz.
   *
   * Önceki sürüm her etkilenen kişi için ayrı bir özyineleme koşuyordu ve
   * bellekleme yoktu (yol-bağımlı olduğu gerekçesiyle). Akraba evliliğinde
   * yollar birleştiği için bu ÜSTEL davranıyordu: 22 kuşakta 44 kişi 1,6
   * saniye sürüyordu. Türkiye bağlamında akraba evliliği yaygın olduğundan
   * bu gerçekçi bir yük.
   *
   * Kahn sıralaması hem doğrusal hem de özyinelemesiz (derin zincirde yığın
   * taşmaz). Bozuk veride döngü kalırsa Kahn onu kendiliğinden tespit eder:
   * kuyruğa hiç giremeyen düğümler döngüdedir. O bileşen için ayrık bir zincir
   * en fazla düğüm sayısı kadar olabileceğinden, o sayı ÜST SINIR olarak
   * bildirilir (kesin değil — döngülü veride kesin cevap yoktur).
   */
  const affectedIds = [...sourcesById.keys()];
  const indeg = new Map<string, number>(affectedIds.map((id) => [id, 0]));
  for (const { childId } of links) indeg.set(childId, (indeg.get(childId) ?? 0) + 1);

  const chain = new Map<string, number>(affectedIds.map((id) => [id, 1]));
  const queue = affectedIds.filter((id) => (indeg.get(id) ?? 0) === 0);
  let processed = 0;

  for (let head = 0; head < queue.length; head++) {
    const id = queue[head];
    processed++;
    for (const child of childrenOf.get(id) ?? []) {
      chain.set(child, Math.max(chain.get(child) ?? 1, (chain.get(id) ?? 1) + 1));
      const left = (indeg.get(child) ?? 0) - 1;
      indeg.set(child, left);
      if (left === 0) queue.push(child);
    }
  }

  let generationsSpanned = 0;
  for (const v of chain.values()) generationsSpanned = Math.max(generationsSpanned, v);

  // Döngüde kalanlar: üst sınır olarak o düğümlerin sayısı.
  const inCycle = affectedIds.length - processed;
  if (inCycle > 0) generationsSpanned = Math.max(generationsSpanned, inCycle);

  return { key: wanted, label, affected, links, generationsSpanned };
}
