import type { Person } from "../types/family.ts";
import { isMember } from "./associates.ts";

/**
 * AİLE KARNESİ — bir yılın geriye dönük özeti.
 *
 * ## Karıştırılmaması gereken iki şey
 *
 * Bir soy ağacında "bu yıl ne oldu" sorusunun İKİ ayrı yanıtı var ve
 * bunları birbirine karıştırmak bu ekranın yapabileceği en büyük hata
 * olurdu:
 *
 * · **Ailede olanlar** — gerçek hayat olayları. 2026'da doğan bir bebek,
 *   2026'da kaybedilen bir büyük.
 * · **Kayda geçenler** — o yıl ağaca eklenen bilgi. 1890 doğumlu bir dedeyi
 *   bu yıl ağaca eklemek 2026'da bir doğum DEĞİLDİR.
 *
 * İkisini tek bir "bu yıl 12 kişi eklendi" sayısında toplamak, kullanıcıya
 * ailesi hakkında yanlış bir cümle söylemek olurdu. Bu yüzden tür düzeyinde
 * ayrı duruyorlar (`life` ve `record`) ve ayrı kaynaklardan besleniyorlar:
 * `life` kayıttaki TARİHLERDEN, `record` ise geçmiş görüntüsüyle
 * KARŞILAŞTIRMADAN gelir.
 *
 * `record` için geçmiş görüntüsü yoksa o bölüm hiç görünmez — uydurulmuş
 * bir sayı göstermektense hiçbir şey göstermemek doğru.
 *
 * ## Neden "karne" ama not yok
 *
 * `lib/milestones.ts`teki gerekçenin aynısı: puan, harf notu, sıralama yok.
 * Bir aileye "bu yıl C aldınız" demek anlamsız. Karne burada "yılın
 * dökümü" anlamında — ölçen değil, anlatan bir şey.
 *
 * Saf ve bağımlılık-hafif (yalnız göreli `.ts` içe aktarım) — birim testi
 * koşulabilsin.
 */

/* ── Yıl okuma ────────────────────────────────────────────────────────────── */

/**
 * "YYYY" | "YYYY-MM" | "YYYY-MM-DD" biçimlerinden yılı okur.
 *
 * Belirsiz/serbest metin tarihler (`"1950 civarı"`, `"?"`) sessizce ATILIR:
 * bir yıl özetinde tahmine yer yok — "bu yıl doğdu" dediğimiz kişi gerçekten
 * o yıl doğmuş olmalı.
 */
export function yearOf(stored?: string): number | null {
  if (!stored) return null;
  const m = /^(\d{4})(?:-\d{2}){0,2}$/.exec(stored.trim());
  if (!m) return null;
  const y = Number(m[1]);
  return y >= 1 && y <= 9999 ? y : null;
}

/* ── Ailede olanlar ───────────────────────────────────────────────────────── */

export interface PersonRef {
  id: string;
  /** Gizli kayıtlarda boş — ad gösterilmez. */
  name: string;
  confidential: boolean;
}

export interface DatedEvent extends PersonRef {
  /** `LIFE_EVENT_TYPES` anahtarı ya da serbest metin. */
  type: string;
  title: string;
  date: string;
}

/** Yuvarlak yıl dönümü — "bu yıl 100 yaşında olacaktı", "50. yılı". */
export interface Anniversary extends PersonRef {
  kind: "dogum" | "olum";
  /** Kaçıncı yıl (10'un katı ya da 25/75). */
  years: number;
  /** Kaynak tarih (yıl). */
  from: number;
}

export interface LifeYear {
  births: PersonRef[];
  deaths: PersonRef[];
  events: DatedEvent[];
  anniversaries: Anniversary[];
}

function ref(p: Person): PersonRef {
  const gizli = !!p.confidential;
  return {
    id: p.id,
    // Gizli kayıt karnede de adsız — karne bir gösterim yüzeyi, istisna değil.
    name: gizli ? "" : `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim(),
    confidential: gizli,
  };
}

/**
 * Yuvarlak sayılan yıl dönümleri.
 *
 * Her yıl dönümü değil — 3. yıl bir haber değil. 10'un katları, ayrıca 25
 * ve 75. Sıfırıncı yıl (olayın kendi yılı) dönüm sayılmaz; o zaten
 * `births`/`deaths` içinde duruyor.
 */
export function isRoundAnniversary(years: number): boolean {
  if (years <= 0) return false;
  return years % 10 === 0 || years === 25 || years === 75;
}

/**
 * O yıl gerçekten olan şeyler.
 *
 * Yalnız aile üyeleri (`isMember`) — çevre bağları soy ağacının olayları
 * değil. Ölüm tarihi olan biri "doğum" listesinde de görünebilir (aynı yıl
 * doğup ölen bir bebek); bu bilerek, çünkü ikisi de olmuş.
 */
export function lifeYear(people: readonly Person[], year: number): LifeYear {
  const births: PersonRef[] = [];
  const deaths: PersonRef[] = [];
  const events: DatedEvent[] = [];
  const anniversaries: Anniversary[] = [];

  for (const p of people) {
    if (!isMember(p)) continue;
    const dogum = yearOf(p.birthDate);
    const olum = yearOf(p.deathDate);
    if (dogum === year) births.push(ref(p));
    if (olum === year) deaths.push(ref(p));

    for (const e of p.events ?? []) {
      if (yearOf(e.date) === year) {
        events.push({ ...ref(p), type: e.type ?? "", title: e.title ?? "", date: e.date! });
      }
    }

    if (dogum !== null && dogum < year && isRoundAnniversary(year - dogum)) {
      anniversaries.push({ ...ref(p), kind: "dogum", years: year - dogum, from: dogum });
    }
    if (olum !== null && olum < year && isRoundAnniversary(year - olum)) {
      anniversaries.push({ ...ref(p), kind: "olum", years: year - olum, from: olum });
    }
  }

  // En büyük yıl dönümü başta — 100. yıl 10. yıldan önce gelmeli.
  anniversaries.sort((a, b) => b.years - a.years);
  return { births, deaths, events, anniversaries };
}

/* ── Kayda geçenler ───────────────────────────────────────────────────────── */

export interface RecordYear {
  /** Karşılaştırmanın dayandığı geçmiş görüntüsünün tarihi. */
  since: string;
  people: number;
  photos: number;
  memories: number;
  sources: number;
  events: number;
  /** Ad/soyad dışında hiçbir alanı olmayan kayıtlardaki değişim. */
  filledIn: number;
}

/** Bir kişi listesindeki sayılabilir içerik. */
function sayim(people: readonly Person[]) {
  let photos = 0, memories = 0, sources = 0, events = 0, dolu = 0, kisi = 0;
  for (const p of people) {
    if (!isMember(p)) continue;
    kisi++;
    photos += (p.photos?.length ?? 0) + (p.photo ? 1 : 0);
    memories += p.memories?.length ?? 0;
    sources += p.sources?.length ?? 0;
    events += p.events?.length ?? 0;
    if (p.birthDate || p.birthPlace || p.bio || p.occupation) dolu++;
  }
  return { kisi, photos, memories, sources, events, dolu };
}

/**
 * Yıl içinde kayda geçen — geçmiş görüntüsüyle BUGÜN arasındaki fark.
 *
 * Fark negatif olabilir (silme oldu). Sıfıra kırpMIYORUZ: "bu yıl 3 kişi
 * eksildi" doğru bir cümle ve gizlenmesi karneyi yalancı yapardı.
 */
export function recordYear(
  before: readonly Person[],
  now: readonly Person[],
  since: string
): RecordYear {
  const a = sayim(before), b = sayim(now);
  return {
    since,
    people: b.kisi - a.kisi,
    photos: b.photos - a.photos,
    memories: b.memories - a.memories,
    sources: b.sources - a.sources,
    events: b.events - a.events,
    filledIn: b.dolu - a.dolu,
  };
}

/* ── Karne ────────────────────────────────────────────────────────────────── */

export interface ReportCard {
  year: number;
  life: LifeYear;
  /** Geçmiş görüntüsü yoksa `null` — uydurma sayı göstermiyoruz. */
  record: RecordYear | null;
  /** Yılda hiç kayda değer bir şey var mı? */
  empty: boolean;
}

export function reportCard(
  people: readonly Person[],
  year: number,
  history?: { before: readonly Person[]; since: string }
): ReportCard {
  const life = lifeYear(people, year);
  const record = history ? recordYear(history.before, people, history.since) : null;
  /*
   * "Boş yıl" gerçek bir sonuç ve gizlenmemeli. Kullanıcıya sahte bir
   * hareketlilik göstermektense "bu yıl kayda geçen bir şey olmadı" demek
   * dürüst; arayüz de o zaman öneri gösterebilir.
   */
  const empty =
    life.births.length === 0 &&
    life.deaths.length === 0 &&
    life.events.length === 0 &&
    life.anniversaries.length === 0 &&
    (!record || Object.entries(record).every(([k, v]) => k === "since" || v === 0));
  return { year, life, record, empty };
}

/**
 * Karnesi olan yıllar — yıl seçici için.
 *
 * Ağacın kapsadığı aralığın TAMAMINI değil, gerçekten bir şey olan yılları
 * döndürür; 400 yıllık bir ağaçta 400 seçenek işe yaramaz. En yeni yıl
 * başta.
 */
export function reportYears(people: readonly Person[], limit = 12): number[] {
  const yillar = new Set<number>();
  for (const p of people) {
    if (!isMember(p)) continue;
    for (const y of [yearOf(p.birthDate), yearOf(p.deathDate)]) if (y !== null) yillar.add(y);
    for (const e of p.events ?? []) {
      const y = yearOf(e.date);
      if (y !== null) yillar.add(y);
    }
  }
  return [...yillar].sort((a, b) => b - a).slice(0, limit);
}
