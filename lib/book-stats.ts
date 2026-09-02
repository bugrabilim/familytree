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

/**
 * Kişinin kuşağı.
 *
 * Temel kural: kuşak = en uzun BİLİNEN ata zincirinin uzunluğu (kökte 1).
 *
 * Ama tek başına bu kural yanlış cevap veriyordu. Ebeveyni kayıtlı olmayan
 * HERKES 1. kuşak sayılıyordu — 1521'de yaşamış kurucu da, 1721'de o aileye
 * gelin gelmiş biri de. Demo ağacında 370 kişinin 140'ı böyle "1. kuşak"
 * çıkıyordu; kitabın "1. KUŞAK" bölümü de, haritanın kuşak süzgeci de bunu
 * olduğu gibi gösteriyordu.
 *
 * Bu yüzden ebeveyni kayıtlı olmayan kişi AİLE BAĞLAMINDAN yerleştirilir:
 * · eşiyle aynı kuşaktadır,
 * · çocuğundan bir önceki kuşaktadır.
 *
 * Ebeveyni BİLİNEN kişilere bu iki kural uygulanmaz: kendi soyu onu zaten
 * bağlar. Eşler gerçekten farklı derinlikten olabilir (kuşak farkı gerçek bir
 * şeydir); birini diğerine çekmek, onu kendi anne-babasından koparırdı.
 *
 * Gevşetme (relaxation) ile sabit noktaya kadar yinelenir. Değerler yalnız
 * ARTAR, dolayısıyla döngü sonlanır; ata grafiğinde çevrim varsa (bozuk veri —
 * `lib/refcheck.ts`in işi) tur sayısı kişi sayısıyla sınırlıdır.
 */
export function computeGenerations(people: Person[]): Map<string, number> {
  const childrenOf = new Map<string, string[]>();
  const known = new Set(people.map((p) => p.id));
  for (const p of people) {
    for (const pid of p.parentIds) {
      if (!known.has(pid)) continue;
      const list = childrenOf.get(pid);
      if (list) list.push(p.id);
      else childrenOf.set(pid, [p.id]);
    }
  }

  const gen = new Map<string, number>(people.map((p) => [p.id, 1]));
  // Ebeveyni "kayıtlı olmayan": id'si listede bulunan bir ebeveyni yok.
  // Sarkan bir ebeveyn kimliği (silinmiş kişi) bağlam sayılmaz.
  const rootless = people.filter((p) => !p.parentIds.some((id) => known.has(id)));

  for (let pass = 0; pass < people.length; pass++) {
    let changed = false;
    for (const p of people) {
      let g = gen.get(p.id) ?? 1;
      for (const pid of p.parentIds) {
        const pg = gen.get(pid);
        if (pg !== undefined) g = Math.max(g, pg + 1);
      }
      if (g !== (gen.get(p.id) ?? 1)) { gen.set(p.id, g); changed = true; }
    }
    for (const p of rootless) {
      let g = gen.get(p.id) ?? 1;
      for (const sid of p.spouseIds) {
        const sg = gen.get(sid);
        if (sg !== undefined) g = Math.max(g, sg);
      }
      for (const cid of childrenOf.get(p.id) ?? []) {
        const cg = gen.get(cid);
        if (cg !== undefined) g = Math.max(g, cg - 1);
      }
      if (g !== (gen.get(p.id) ?? 1)) { gen.set(p.id, g); changed = true; }
    }
    if (!changed) break;
  }
  return gen;
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
