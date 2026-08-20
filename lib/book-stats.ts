import type { Person } from "@/types/family";

// Bu modül KENDİNE YETER: yalnız `Person` tür'ünü içe aktarır, çalışma-zamanı
// (değer) bağımlılığı yoktur. Böylece hem üretim derlemesinde hem de
// strip-types birim testinde sorunsuz çalışır (CLAUDE.md: test edilebilir alan
// mantığı bağımlılık-hafif tutulur). Gereken küçük yardımcılar aşağıda gömülü.

/** Doğumdan ölüme (ya da bugüne) tam yıl. Bilinmiyorsa null. */
function yearsLived(birth?: string, death?: string): number | null {
  const b = birth ? Number(birth.slice(0, 4)) : NaN;
  if (Number.isNaN(b)) return null;
  const end = death ? Number(death.slice(0, 4)) : new Date().getFullYear();
  if (Number.isNaN(end)) return null;
  const age = end - b;
  return age >= 0 && age < 150 ? age : null;
}

/**
 * Aile kitabı "Rakamlarla Aile" bölümü için saf, test edilebilir istatistik
 * türetimi (Madde 12). Panel'deki sayısal detaylar burada tek yerde toplanır;
 * hem ekran kitabı (BookView) hem yazdırılan kitap (PrintView) aynı kaynaktan
 * beslenir. Yalnız `Person` tür'ü + `lib/date`/`lib/relations` (saf) kullanır.
 */

/** Kişinin kuşağı: en uzun ata zincirinin uzunluğu (köksüz = 1). */
export function computeGenerations(people: Person[]): Map<string, number> {
  const idx = new Map(people.map((p) => [p.id, p]));
  const cache = new Map<string, number>();
  const depth = (p: Person, seen: Set<string>): number => {
    const hit = cache.get(p.id);
    if (hit !== undefined) return hit;
    if (seen.has(p.id)) return 1;
    seen.add(p.id);
    const parents = p.parentIds.map((id) => idx.get(id)).filter((x): x is Person => !!x);
    const d = parents.length === 0 ? 1 : 1 + Math.max(...parents.map((pa) => depth(pa, seen)));
    seen.delete(p.id);
    cache.set(p.id, d);
    return d;
  };
  const m = new Map<string, number>();
  for (const p of people) m.set(p.id, depth(p, new Set()));
  return m;
}

/** Yaş sıralamalı listelerde bir satır (kimlik + yaş + yaşıyor mu). */
export interface RankRow {
  id: string;
  age: number;
  living: boolean;
}

export interface BookAlmanac {
  /** Her kuşaktaki kişi sayısı (1'den başlayarak artan). */
  perGeneration: Array<{ gen: number; count: number }>;
  /** En eski doğumlular (bilinen doğum tarihine göre kronolojik). */
  eldest: string[];
  /** Yaşayan en yaşlılar (yaşa göre azalan). */
  livingOldest: RankRow[];
  /** En uzun yaşamışlar — yaşayan + vefat (yaşa göre azalan). */
  longestLived: RankRow[];
}

/**
 * Kitap almanağı — kuşak dağılımı + en eski / en yaşlı / en uzun ömürlü
 * listeleri. `limit` her listenin uzunluğunu sınırlar. Gizlilik: çağıran taraf
 * maskeli kopya (`view`) geçmelidir; bu fonksiyon veriyi olduğu gibi işler.
 */
export function computeAlmanac(people: Person[], limit = 8): BookAlmanac {
  // Kuşak dağılımı
  const genOf = computeGenerations(people);
  const genCount = new Map<number, number>();
  for (const g of genOf.values()) genCount.set(g, (genCount.get(g) ?? 0) + 1);
  const perGeneration = [...genCount.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([gen, count]) => ({ gen, count }));

  // En eski doğumlular
  const eldest = people
    .filter((p) => p.birthDate)
    .sort((a, b) => (a.birthDate ?? "").localeCompare(b.birthDate ?? ""))
    .slice(0, limit)
    .map((p) => p.id);

  // Yaşa göre satırlar (yaşayan = bugüne, vefat = ölüme kadar)
  const byAge: RankRow[] = [];
  for (const p of people) {
    if (!p.birthDate) continue;
    const age = yearsLived(p.birthDate, p.deathDate);
    if (age === null) continue;
    byAge.push({ id: p.id, age, living: !p.deathDate });
  }

  const livingOldest = byAge
    .filter((r) => r.living)
    .sort((a, b) => b.age - a.age)
    .slice(0, limit);
  const longestLived = [...byAge].sort((a, b) => b.age - a.age).slice(0, limit);

  return { perGeneration, eldest, livingOldest, longestLived };
}
