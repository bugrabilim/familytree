import type { Gender, Person } from "@/types/family";

/**
 * Rehberli soru bankası — SAF, bağımlılıksız.
 *
 * Üç iş bunu paylaşacak: dışa dönük soru motoru (haftalık e-posta), hikâye
 * talebi (akrabadan belirli bir hikâye isteme) ve Sesli Şecere. Ayrı ayrı
 * yazılsalardı üç farklı soru listesi doğar ve biri diğerinden sapardı.
 *
 * ## İki ses — bu bankanın asıl meselesi
 *
 * `types/family.ts` içindeki eski `MEMORY_PROMPTS`'un sekizi de **ikinci
 * tekil**: "Çocukluğun nasıldı?". Bu yalnız kişinin KENDİSİNE sorulabilir.
 * Oysa bir soy ağacındaki kişilerin çoğu vefat etmiştir; onlara soru
 * sorulamaz — soru, onları TANIYAN akrabaya sorulur: "Babaannenin en çok
 * yaptığı yemek neydi?"
 *
 * Bu yüzden her sorunun bir `voice` alanı var:
 * - `"self"`  → kişinin kendisine (yalnız yaşayanlara)
 * - `"about"` → kişiyi tanıyan bir akrabaya (yaşayan ya da vefat etmiş)
 *
 * Tek sesli bir banka, ürünün asıl kullanım durumunu (gidenleri anlatmak)
 * dışarıda bırakırdı.
 *
 * ## Bağımlılık kuralı
 *
 * Yalnız tip düzeyinde `@/` importu var (çalışma zamanında silinir), böylece
 * `node --experimental-strip-types` ile birim testi koşulabiliyor. Yaş hesabı
 * `lib/date.ts`'ten çağrılmak yerine burada altı satırla tekrarlandı —
 * çalışma zamanı `@/` importu bu dosyayı test edilemez yapardı.
 */

export type PromptVoice = "self" | "about";

export type PromptCategory =
  | "cocukluk"   // çocukluk, oyunlar, okul
  | "yer"        // ev, mahalle, memleket, göç
  | "aile"       // ebeveyn, kardeş, evlilik, çocuk
  | "is"         // meslek, askerlik, emek
  | "gelenek"    // bayram, düğün, mutfak, âdet
  | "zorluk"     // hastalık, yokluk, kayıp
  | "kisilik"    // huy, lakap, ses, el yazısı
  | "ogut";      // öğüt, miras, sözler

/** Bir sorunun kime uyduğunu belirleyen koşullar. Hepsi isteğe bağlı. */
export interface PromptRequires {
  /** Kişi bu yaşı görmüş olmalı (vefat ettiyse ölüm yaşına bakılır). */
  minAge?: number;
  hasSpouse?: boolean;
  hasChildren?: boolean;
  hasOccupation?: boolean;
  hasEducation?: boolean;
  hasBirthPlace?: boolean;
  /** Yalnız bu cinsiyete sorulur (askerlik gibi). */
  gender?: Gender;
}

export interface GuidedPrompt {
  /** i18n anahtarı `memoryPrompt.<id>` olarak çözülür. */
  id: string;
  voice: PromptVoice;
  category: PromptCategory;
  requires?: PromptRequires;
}

/** Kişiden türetilen, soru seçimi için gereken asgari tanım. */
export interface PromptSubject {
  id: string;
  gender?: Gender;
  /** "YYYY" | "YYYY-MM" | "YYYY-MM-DD" */
  birthDate?: string;
  deathDate?: string;
  hasSpouse: boolean;
  hasChildren: boolean;
  hasOccupation: boolean;
  hasEducation: boolean;
  hasBirthPlace: boolean;
  /** Yaşıyor mu? (`deathDate` yoksa yaşıyor sayılır.) */
  living: boolean;
  /** Daha önce sorulmuş / yanıtlanmış soru kimlikleri. */
  answered: string[];
}

/* ------------------------------------------------------------------- Banka */

export const PROMPTS: readonly GuidedPrompt[] = [
  /* --- Kişinin kendisine (self) --------------------------------------- */
  { id: "childhood", voice: "self", category: "cocukluk" },
  { id: "firstHome", voice: "self", category: "yer" },
  { id: "proudest", voice: "self", category: "kisilik" },
  { id: "tradition", voice: "self", category: "gelenek" },
  { id: "hardship", voice: "self", category: "zorluk" },
  { id: "love", voice: "self", category: "aile", requires: { hasSpouse: true } },
  { id: "work", voice: "self", category: "is", requires: { hasOccupation: true } },
  { id: "advice", voice: "self", category: "ogut" },
  { id: "selfNeighborhood", voice: "self", category: "yer" },
  { id: "selfSchoolDay", voice: "self", category: "cocukluk", requires: { hasEducation: true } },
  { id: "selfGames", voice: "self", category: "cocukluk" },
  { id: "selfFirstJob", voice: "self", category: "is", requires: { minAge: 18 } },
  { id: "selfMilitary", voice: "self", category: "is", requires: { minAge: 20, gender: "male" } },
  { id: "selfWedding", voice: "self", category: "gelenek", requires: { hasSpouse: true } },
  { id: "selfFirstChild", voice: "self", category: "aile", requires: { hasChildren: true } },
  { id: "selfBayram", voice: "self", category: "gelenek" },
  { id: "selfMigration", voice: "self", category: "yer", requires: { hasBirthPlace: true } },
  { id: "selfFirstTv", voice: "self", category: "cocukluk", requires: { minAge: 40 } },
  { id: "selfMoney", voice: "self", category: "zorluk", requires: { minAge: 25 } },
  { id: "selfNickname", voice: "self", category: "kisilik" },
  { id: "selfFriend", voice: "self", category: "kisilik" },
  { id: "selfFood", voice: "self", category: "gelenek" },
  { id: "selfSong", voice: "self", category: "kisilik" },
  { id: "selfRegret", voice: "self", category: "ogut", requires: { minAge: 40 } },
  { id: "selfGrandparent", voice: "self", category: "aile" },
  { id: "selfChangedMost", voice: "self", category: "ogut", requires: { minAge: 50 } },

  /* --- Kişiyi tanıyan akrabaya (about) -------------------------------- */
  { id: "aboutFirstMemory", voice: "about", category: "kisilik" },
  { id: "aboutVoice", voice: "about", category: "kisilik" },
  { id: "aboutSmell", voice: "about", category: "kisilik" },
  { id: "aboutHandwriting", voice: "about", category: "kisilik" },
  { id: "aboutNickname", voice: "about", category: "kisilik" },
  { id: "aboutSaying", voice: "about", category: "ogut" },
  { id: "aboutDish", voice: "about", category: "gelenek" },
  { id: "aboutHome", voice: "about", category: "yer" },
  { id: "aboutHands", voice: "about", category: "kisilik" },
  { id: "aboutLaugh", voice: "about", category: "kisilik" },
  { id: "aboutAnger", voice: "about", category: "kisilik" },
  { id: "aboutWork", voice: "about", category: "is", requires: { hasOccupation: true } },
  { id: "aboutMarriage", voice: "about", category: "aile", requires: { hasSpouse: true } },
  { id: "aboutParenting", voice: "about", category: "aile", requires: { hasChildren: true } },
  { id: "aboutBayram", voice: "about", category: "gelenek" },
  { id: "aboutGuest", voice: "about", category: "gelenek" },
  { id: "aboutIllness", voice: "about", category: "zorluk" },
  { id: "aboutHelp", voice: "about", category: "zorluk" },
  { id: "aboutBelonging", voice: "about", category: "kisilik" },
  { id: "aboutPhoto", voice: "about", category: "kisilik" },
  { id: "aboutTaught", voice: "about", category: "ogut" },
  { id: "aboutMisunderstood", voice: "about", category: "kisilik" },
  { id: "aboutHometown", voice: "about", category: "yer", requires: { hasBirthPlace: true } },
  { id: "aboutLastTime", voice: "about", category: "aile" },
  { id: "aboutMissed", voice: "about", category: "ogut" },
  { id: "aboutStoryTold", voice: "about", category: "gelenek" },
] as const;

/** i18n anahtarı — `useT()` ile çözülür. */
export function promptKey(id: string): string {
  return `memoryPrompt.${id}`;
}

export function promptById(id: string): GuidedPrompt | undefined {
  return PROMPTS.find((p) => p.id === id);
}

/* ---------------------------------------------------------------- Yaş/özne */

function yearOf(stored?: string): number | null {
  const m = stored ? /^(\d{4})/.exec(stored) : null;
  return m ? Number(m[1]) : null;
}

/**
 * Kişinin gördüğü yaş. Vefat ettiyse ölüm yaşı, yaşıyorsa bugünkü yaşı.
 * Yalnız yıl bilindiğinde de çalışır (kaba ama soru seçimi için yeterli).
 */
export function ageReached(subject: PromptSubject, today = new Date()): number | null {
  const born = yearOf(subject.birthDate);
  if (born === null) return null;
  const end = yearOf(subject.deathDate) ?? today.getFullYear();
  return end - born;
}

/** `Person` + ağaç → soru seçimi için özne. */
export function subjectFromPerson(person: Person, people: Person[]): PromptSubject {
  const hasChildren = people.some((p) => p.parentIds?.includes(person.id));
  const answered = (person.memories ?? [])
    .map((m) => m.prompt)
    .filter((p): p is string => !!p);
  return {
    id: person.id,
    gender: person.gender,
    birthDate: person.birthDate,
    deathDate: person.deathDate,
    hasSpouse: (person.spouseIds?.length ?? 0) > 0 || (person.formerSpouseIds?.length ?? 0) > 0,
    hasChildren,
    hasOccupation: !!person.occupation,
    hasEducation: !!person.education,
    hasBirthPlace: !!person.birthPlace,
    living: !person.deathDate,
    answered,
  };
}

/* -------------------------------------------------------------- Seçim */

/** Bu soru bu kişiye sorulabilir mi? */
export function isEligible(
  prompt: GuidedPrompt,
  subject: PromptSubject,
  today = new Date()
): boolean {
  // Vefat etmiş kişiye kendisi hakkında soru sorulamaz.
  if (prompt.voice === "self" && !subject.living) return false;

  const r = prompt.requires;
  if (!r) return true;
  if (r.hasSpouse && !subject.hasSpouse) return false;
  if (r.hasChildren && !subject.hasChildren) return false;
  if (r.hasOccupation && !subject.hasOccupation) return false;
  if (r.hasEducation && !subject.hasEducation) return false;
  if (r.hasBirthPlace && !subject.hasBirthPlace) return false;
  if (r.gender && subject.gender !== r.gender) return false;
  if (r.minAge !== undefined) {
    const age = ageReached(subject, today);
    // Yaş bilinmiyorsa yaş koşullu soruyu sorMA — 6 yaşındaki birine
    // askerlik sormaktansa soruyu atlamak yeğdir.
    if (age === null || age < r.minAge) return false;
  }
  return true;
}

export interface PromptFilter {
  voice?: PromptVoice;
  category?: PromptCategory;
  /** Daha önce sorulanları da dâhil et (varsayılan: hariç). */
  includeAnswered?: boolean;
}

/** Bu kişiye sorulabilecek sorular. */
export function eligiblePrompts(
  subject: PromptSubject,
  filter: PromptFilter = {},
  today = new Date()
): GuidedPrompt[] {
  const asked = new Set(subject.answered);
  return PROMPTS.filter((p) => {
    if (filter.voice && p.voice !== filter.voice) return false;
    if (filter.category && p.category !== filter.category) return false;
    if (!filter.includeAnswered && asked.has(p.id)) return false;
    return isEligible(p, subject, today);
  });
}

/** Kararlı, seed'e bağlı karıştırma tohumu (FNV-1a). */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Sıradaki soru — **deterministik**.
 *
 * Haftalık cron her çalıştığında aynı hafta için aynı soruyu üretmeli:
 * yeniden denemede ya da iki örnek aynı anda koştuğunda kişiye iki farklı
 * soru gitmesin. Bu yüzden rastgelelik yok; seçim `seed` + kişi kimliğinin
 * karmasıyla yapılır.
 *
 * Uygun soru kalmadıysa null döner (çağıran "banka bitti" durumunu bilir).
 */
export function nextPrompt(
  subject: PromptSubject,
  seed: string,
  filter: PromptFilter = {},
  today = new Date()
): GuidedPrompt | null {
  const pool = eligiblePrompts(subject, filter, today);
  if (pool.length === 0) return null;
  return pool[hash(`${seed}:${subject.id}`) % pool.length];
}
