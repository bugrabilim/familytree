import { foldKey } from "./turkish.ts";
import { PERSON_FIELDS } from "./person-fields.ts";
import type { ParentLink, Person } from "@/types/family";

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

const normName = foldKey;


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

  const cleanRefs = (ids: string[]): string[] =>
    uniq(ids.map((id) => (id === dropId ? keepId : id))).filter((id) => id !== keepId);

  /*
   * BİRLEŞTİRME KAYIT DEFTERİNDEN SÜRÜLÜR.
   *
   * Burada eskiden elle yazılmış bir alan listesi vardı ve sonradan eklenen
   * alanlar o listeye hiç girmedi. Sonuç: fonksiyonun kendi başlığı
   * "kayıpsız" derken `lineage`, `burialPlace`, `officialBirthDate`,
   * `videos`, `documents`, `healthNote`, `associations` ve `birthCoords`
   * bırakılan kayıtla birlikte siliniyordu. `burialPlace` en keskini:
   * aşağıdaki `CONFLICT_FIELDS` listesinde ADI GEÇİYOR — yani korunması
   * amaçlanmıştı — ama çakışma notu yalnız İKİ kayıtta da doluysa yazıldığı
   * için, sadece bırakılanda varken hiç iz bırakmadan yok oluyordu.
   *
   * Çözüm listeyi uzatmak değil: `lib/person-fields.ts` kayıt defteri tam da
   * bu iş için var. Artık yeni bir alan eklendiğinde birleştirme onu
   * kendiliğinden taşıyor.
   */
  const mergedKeep: Person = { ...keep };
  // Kayıt defteri anahtarla yazdığı için indeksli bir görünüm gerekiyor.
  const yaz = mergedKeep as unknown as Record<string, unknown>;

  for (const spec of PERSON_FIELDS) {
    const k = spec.key as keyof Person;
    const a = keep[k];
    const b = drop[k];
    if (b === undefined) continue;

    switch (spec.merge) {
      case "array": {
        // Diziler BİRLEŞİM. Metin dizilerinde tekilleştir; nesne dizilerinde
        // (anı, kaynak, olay, çevre bağı) kimlikler farklı olduğu için
        // birleştirmek yeterli — kopya elemek kayıp riski doğururdu.
        const ea = Array.isArray(a) ? (a as unknown[]) : [];
        const eb = Array.isArray(b) ? (b as unknown[]) : [];
        const hepsi = [...ea, ...eb];
        const metin = hepsi.every((x) => typeof x === "string");
        yaz[k as string] = metin ? uniq(hepsi as string[]) : hepsi;
        break;
      }
      case "bool":
        /*
         * Mantıksal alanda GÜVENLİ taraf kazanır: bugün tek mantıksal alan
         * `confidential` ve iki kayıttan biri "gizli kayıt" işaretliyse
         * birleşim de gizli olmalı. Tersini seçmek, birleştirme yoluyla bir
         * gizlilik ayarının sessizce kalkması demekti.
         */
        yaz[k as string] = !!a || !!b;
        break;
      default:
        // Tek değerli alanlar: tutulan kaydınki öncelikli, boşsa bırakılanınki.
        yaz[k as string] = a ?? b;
    }
  }

  // Ad/soyad/cinsiyet: boş ya da "unknown" olan yerine öbürü geçsin.
  mergedKeep.firstName = keep.firstName || drop.firstName;
  mergedKeep.lastName = keep.lastName || drop.lastName;
  mergedKeep.gender = keep.gender !== "unknown" ? keep.gender : drop.gender;
  mergedKeep.photo = keep.photo || drop.photo;

  // İlişki grafiği kayıt defterinin DIŞINDA (`EXCLUDED_FIELDS`): bırakılan
  // kimliğe yapılan başvurular tutulana çevrilir ve kendine bağ temizlenir.
  mergedKeep.parentIds = cleanRefs([...(keep.parentIds ?? []), ...(drop.parentIds ?? [])]);
  mergedKeep.spouseIds = cleanRefs([...(keep.spouseIds ?? []), ...(drop.spouseIds ?? [])]);
  mergedKeep.formerSpouseIds = cleanRefs([
    ...(keep.formerSpouseIds ?? []),
    ...(drop.formerSpouseIds ?? []),
  ]);
  /*
   * `parentLinks` ANAHTARLARI da ebeveyn kimlikleridir; `parentIds` gibi
   * çevrilmeleri gerekir. Eskiden yalnız iki nesne üst üste bindiriliyordu:
   * bırakılan kimliğe bakan bir anahtar olduğu gibi kalıyor, kendine bağ
   * temizlenmiyordu.
   *
   * Somut sonuç sarkan bir kimlikten fazlası: `parentLinkOf` bağı GÜNCEL
   * ebeveyn kimliğiyle arıyor, bulamayınca evlatlık/üvey/koruyucu bağ sessizce
   * KAN BAĞINA dönüyor. Görünmeyen bir veri bozulması.
   */
  {
    const links: Record<string, ParentLink> = {};
    for (const [pid, link] of Object.entries({ ...(drop.parentLinks ?? {}), ...(keep.parentLinks ?? {}) })) {
      const hedef = pid === dropId ? keepId : pid;
      if (hedef === keepId) continue; // kendine ebeveyn bağı olmaz
      links[hedef] = link;
    }
    mergedKeep.parentLinks = links;
  }
  // İki kayıtta da DOLU olan ve FARKLI olan tek-değerli alanlar birleştirmede
  // sessizce kaybolmasın: bırakılan kaydın farklı değerleri biyografiye not
  // olarak eklenir. (Eş/çocuk/ebeveyn gibi bağlar zaten birleşim olarak korunur.)
  const CONFLICT_FIELDS: Array<[keyof Person, string]> = [
    ["gender", "cinsiyet"],
    ["birthDate", "doğum tarihi"],
    ["deathDate", "ölüm tarihi"],
    ["birthPlace", "doğum yeri"],
    ["orientation", "yönelim"],
    ["religion", "din"],
    ["denomination", "mezhep"],
    ["language", "dil"],
    ["ethnicity", "etnik köken"],
    ["nationality", "uyruk"],
    ["occupation", "meslek"],
    ["education", "eğitim"],
    ["burialPlace", "defin yeri"],
    ["patronymic", "baba adıyla anılma"],
    ["nickname", "lakap"],
  ];
  const conflicts: string[] = [];
  for (const [f, label] of CONFLICT_FIELDS) {
    const kv = keep[f];
    const dv = drop[f];
    if (kv && dv && String(kv).trim() && String(kv).trim() !== String(dv).trim()) {
      conflicts.push(`${label}: ${String(dv).trim()}`);
    }
  }
  if (conflicts.length) {
    const note = `Birleştirilen kayıttan farklı bilgiler — ${conflicts.join("; ")}`;
    mergedKeep.bio = mergedKeep.bio ? `${mergedKeep.bio}\n\n${note}` : note;
  }

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
