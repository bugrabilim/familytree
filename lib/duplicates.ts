import type { Person } from "@/types/family";

/**
 * Ağaç-içi olası kopya (aynı kişi iki kez girilmiş) tespiti ve birleştirme —
 * Smart Matches'ın S0 (platform-içi, tek ağaç) seviyesi. SAF mantık, test
 * edilebilir (server-only değil). Yanlış-pozitifi azaltmak için ad eşleşmesine
 * ek en az bir doğrulayıcı (aynı yıl / ortak ebeveyn / ortak eş) aranır.
 */

export interface DuplicatePair {
  aId: string;
  bId: string;
  /** i18n anahtar eki: yearMatch | sharedParent | sharedSpouse */
  reason: "yearMatch" | "sharedParent" | "sharedSpouse";
}

function normName(s: string): string {
  return s
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u")
    .replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Gruplama anahtarı: yalnız AD. Böylece soyadı boş ("Buğra") ile soyadlı
 *  ("Buğra Bilim") aynı kişi olabilecek kayıtlar da karşılaştırılır (3C). */
function firstKey(p: Person): string {
  return normName(p.firstName);
}

/** Soyadlar uyumlu mu? En az biri boşsa (soyadsız kuşak / eksik kayıt) ya da
 *  eşitse uyumlu sayılır. İkisi de doluysa ve farklıysa uyumsuz. */
function surnameCompatible(a: Person, b: Person): boolean {
  const la = normName(a.lastName);
  const lb = normName(b.lastName);
  if (!la || !lb) return true;
  return la === lb;
}

function birthYear(p: Person): number | null {
  const y = p.birthDate ? parseInt(p.birthDate.slice(0, 4), 10) : NaN;
  return Number.isFinite(y) ? y : null;
}

function overlaps(a: string[] | undefined, b: string[] | undefined): boolean {
  if (!a?.length || !b?.length) return false;
  const set = new Set(a);
  return b.some((x) => set.has(x));
}

/** a ve b birbirine doğrudan bağlı mı? (ebeveyn/çocuk/eş → kesin farklı kişiler) */
function directlyRelated(a: Person, b: Person): boolean {
  return (
    a.parentIds?.includes(b.id) ||
    b.parentIds?.includes(a.id) ||
    a.spouseIds?.includes(b.id) ||
    b.spouseIds?.includes(a.id) ||
    (a.formerSpouseIds?.includes(b.id) ?? false) ||
    (b.formerSpouseIds?.includes(a.id) ?? false)
  );
}

/** Olası kopya çiftlerini döndürür (aynı kişi olabilecek ikililer). */
export function findDuplicatePairs(people: Person[]): DuplicatePair[] {
  // Ada göre grupla — yalnız aynı ad-anahtarlı kişileri karşılaştır (O(n) + küçük gruplar).
  const groups = new Map<string, Person[]>();
  for (const p of people) {
    const key = firstKey(p);
    if (!key) continue; // adsız
    const arr = groups.get(key);
    if (arr) arr.push(p);
    else groups.set(key, [p]);
  }

  const pairs: DuplicatePair[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        if (directlyRelated(a, b)) continue; // kesin farklı kişiler

        const ya = birthYear(a);
        const yb = birthYear(b);
        // Yıllar çelişiyorsa (ikisi de var ve 1'den fazla fark) → farklı kişi.
        if (ya !== null && yb !== null && Math.abs(ya - yb) > 1) continue;

        const compat = surnameCompatible(a, b);

        // Doğrulayıcı: aynı yıl (soyad uyumluysa) YA DA ortak ebeveyn/eş.
        // Soyadlar hem dolu hem farklıysa yıl tek başına yetmez (farklı ailelerden
        // aynı ad/yıl kişileri yanlış eşleşmesin); yalnız yapısal bağ (ortak
        // ebeveyn/eş) kabul edilir.
        let reason: DuplicatePair["reason"] | null = null;
        if (compat && ya !== null && yb !== null) reason = "yearMatch";
        else if (overlaps(a.parentIds, b.parentIds)) reason = "sharedParent";
        else if (
          overlaps(a.spouseIds, b.spouseIds) ||
          overlaps(a.formerSpouseIds, b.formerSpouseIds)
        )
          reason = "sharedSpouse";

        if (reason) pairs.push({ aId: a.id, bId: b.id, reason });
      }
    }
  }
  return pairs;
}

/* ── Birleştirme ───────────────────────────────────────────────────────────── */

function uniq(arr: string[]): string[] {
  return [...new Set(arr)];
}

/**
 * `dropId` kişisini `keepId` kişisine birleştirir; yeni `people` dizisi döner.
 *
 * - Skaler alanlar: keep'in değeri boşsa drop'tan doldurulur.
 * - Dizi alanları (parent/spouse/former, photos, events, sources, memories):
 *   birleşim (union); kendine-referans ve keep↔drop referansları temizlenir.
 * - Diğer tüm kişilerdeki `dropId` referansları `keepId`'ye çevrilir.
 * - `parentLinks` taşınır (keep'te yoksa).
 * Kayıpsız: hiçbir bağ/veri düşmez, yalnız iki kayıt tek kayda iner.
 */
export function mergePeople(people: Person[], keepId: string, dropId: string): Person[] {
  if (keepId === dropId) return people;
  const keep = people.find((p) => p.id === keepId);
  const drop = people.find((p) => p.id === dropId);
  if (!keep || !drop) return people;

  const scalar = <K extends keyof Person>(k: K): Person[K] =>
    (keep[k] ?? drop[k]) as Person[K];

  const cleanRefs = (ids: string[]): string[] =>
    uniq(ids.map((id) => (id === dropId ? keepId : id))).filter((id) => id !== keepId);

  const mergedKeep: Person = {
    ...keep,
    firstName: keep.firstName || drop.firstName,
    lastName: keep.lastName || drop.lastName,
    gender: keep.gender !== "unknown" ? keep.gender : drop.gender,
    nickname: scalar("nickname"),
    patronymic: scalar("patronymic"),
    orientation: scalar("orientation"),
    birthDate: scalar("birthDate"),
    deathDate: scalar("deathDate"),
    birthPlace: scalar("birthPlace"),
    photo: keep.photo || drop.photo,
    bio: scalar("bio"),
    religion: scalar("religion"),
    denomination: scalar("denomination"),
    language: scalar("language"),
    ethnicity: scalar("ethnicity"),
    nationality: scalar("nationality"),
    occupation: scalar("occupation"),
    education: scalar("education"),
    congenitalCondition: scalar("congenitalCondition"),
    healthCondition: scalar("healthCondition"),
    deathCause: scalar("deathCause"),
    parentIds: cleanRefs([...(keep.parentIds ?? []), ...(drop.parentIds ?? [])]),
    spouseIds: cleanRefs([...(keep.spouseIds ?? []), ...(drop.spouseIds ?? [])]),
    formerSpouseIds: cleanRefs([...(keep.formerSpouseIds ?? []), ...(drop.formerSpouseIds ?? [])]),
    photos: uniq([...(keep.photos ?? []), ...(drop.photos ?? [])]),
    events: [...(keep.events ?? []), ...(drop.events ?? [])],
    sources: [...(keep.sources ?? []), ...(drop.sources ?? [])],
    memories: [...(keep.memories ?? []), ...(drop.memories ?? [])],
    parentLinks: { ...(drop.parentLinks ?? {}), ...(keep.parentLinks ?? {}) },
  };
  // Boş dizileri temizle (isteğe bağlı alanlar undefined kalsın)
  if (mergedKeep.formerSpouseIds && mergedKeep.formerSpouseIds.length === 0) delete mergedKeep.formerSpouseIds;
  if (mergedKeep.photos && mergedKeep.photos.length === 0) delete mergedKeep.photos;
  if (mergedKeep.events && mergedKeep.events.length === 0) delete mergedKeep.events;
  if (mergedKeep.sources && mergedKeep.sources.length === 0) delete mergedKeep.sources;
  if (mergedKeep.memories && mergedKeep.memories.length === 0) delete mergedKeep.memories;
  if (mergedKeep.parentLinks && Object.keys(mergedKeep.parentLinks).length === 0) delete mergedKeep.parentLinks;

  const result: Person[] = [];
  for (const p of people) {
    if (p.id === dropId) continue;
    if (p.id === keepId) {
      result.push(mergedKeep);
      continue;
    }
    // Diğer kişilerdeki dropId → keepId
    const next: Person = { ...p };
    if (p.parentIds?.includes(dropId))
      next.parentIds = uniq(p.parentIds.map((id) => (id === dropId ? keepId : id))).filter((id) => id !== p.id);
    if (p.spouseIds?.includes(dropId))
      next.spouseIds = uniq(p.spouseIds.map((id) => (id === dropId ? keepId : id))).filter((id) => id !== p.id);
    if (p.formerSpouseIds?.includes(dropId))
      next.formerSpouseIds = uniq(p.formerSpouseIds.map((id) => (id === dropId ? keepId : id))).filter((id) => id !== p.id);
    if (p.parentLinks && dropId in p.parentLinks) {
      const { [dropId]: moved, ...rest } = p.parentLinks;
      next.parentLinks = { ...rest, [keepId]: rest[keepId] ?? moved };
    }
    result.push(next);
  }
  return result;
}

/** Bir kaydın "doluluk" puanı — toplu birleştirmede hangisinin ANA (korunacak)
 *  olacağını seçmek için. Daha çok bağ ve dolu alan = daha eksiksiz kayıt. */
function completeness(p: Person): number {
  let n = (p.parentIds?.length ?? 0) + (p.spouseIds?.length ?? 0) + (p.formerSpouseIds?.length ?? 0);
  n += (p.photos?.length ?? 0) + (p.events?.length ?? 0) + (p.sources?.length ?? 0) + (p.memories?.length ?? 0);
  const scalars: Array<Person[keyof Person]> = [
    p.birthDate, p.deathDate, p.birthPlace, p.photo, p.bio, p.nickname, p.patronymic,
    p.occupation, p.education, p.religion, p.denomination, p.language, p.ethnicity,
    p.nationality, p.orientation, p.congenitalCondition, p.healthCondition, p.deathCause,
  ];
  for (const s of scalars) if (s) n++;
  if (p.lastName) n++;
  if (p.gender && p.gender !== "unknown") n++;
  return n;
}

/**
 * Bir çift listesini (aynı kişi olabilecek kayıtlar) TEK geçişte birleştirir.
 * Her çiftte daha eksiksiz kayıt korunur (eşitse ilki). Zincirlere dayanıklı:
 * önceki bir birleştirmede tüketilmiş bir kimlik içeren çift atlanır. Saf ve
 * test edilebilir; `{ people, merged }` döner (`merged` = uygulanan çift sayısı).
 */
export function applyBulkMerge(
  people: Person[],
  pairs: Array<{ aId: string; bId: string }>
): { people: Person[]; merged: number } {
  let working = people;
  const alive = new Set(working.map((p) => p.id));
  let merged = 0;
  for (const { aId, bId } of pairs) {
    if (aId === bId || !alive.has(aId) || !alive.has(bId)) continue;
    const a = working.find((p) => p.id === aId)!;
    const b = working.find((p) => p.id === bId)!;
    const keepId = completeness(a) >= completeness(b) ? aId : bId;
    const dropId = keepId === aId ? bId : aId;
    working = mergePeople(working, keepId, dropId);
    alive.delete(dropId);
    merged++;
  }
  return { people: working, merged };
}
