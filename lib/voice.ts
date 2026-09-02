import type { Person } from "../types/family.ts";
import { fold } from "./turkish.ts";

/**
 * Sesli Şecere — saf mantık.
 *
 * 1904 öncesi ve göç kırılması çoğu ailede yalnız yaşlı bir akrabanın
 * hafızasında. O kişiden form doldurmasını beklemek gerçekçi değil; anlatması
 * ise doğal. Akış şu: rehberli soru → ses kaydı → deşifre → ADAY bilgiler →
 * kullanıcı onayı → kayıt.
 *
 * ## Bu dosyanın asıl işi: alıntı doğrulama
 *
 * Bir dil modeline "anlatıdan doğum yerini çıkar" dediğinizde, çıkaramadığı
 * yerde makul bir şey UYDURUR. Soy ağacında bu, ailenin kendi tarihine
 * karışan sahte bir kayıt demektir ve iki kuşak sonra kimse nereden geldiğini
 * bilemez.
 *
 * Bu yüzden modelden her aday bilginin yanında deşifre metninden BİREBİR bir
 * alıntı istiyoruz ve o alıntıyı burada MAKİNEYLE doğruluyoruz: metinde
 * geçmiyorsa aday atılır. Modelin sözüne değil, kendi metnine bakıyoruz.
 * Bu, "modele daha iyi talimat vermek"ten farklı bir şey — talimat rica,
 * bu ise kontrol.
 */

/** Onaya sunulan tekil bilgi. */
export interface VoiceFact {
  /**
   * Hangi kişiye ait: konuşulan kişinin kimliği ya da anlatıda geçen yeni
   * bir kişi için `new:<sıra>` biçiminde geçici kimlik.
   */
  personRef: string;
  /** `Person` alan adı — yalnız `VOICE_FIELDS` içindekiler kabul edilir. */
  field: VoiceField;
  value: string;
  /** Deşifre metninden birebir alıntı — doğrulanır. */
  quote: string;
}

/** Anlatıda geçen, ağaçta olmayabilecek kişi. */
export interface VoicePerson {
  /** `new:<sıra>` geçici kimlik. */
  ref: string;
  firstName: string;
  lastName?: string;
  /** Konuşulan kişiye göre bağ — serbest metin, YAPISAL BAĞ KURULMAZ. */
  relation?: string;
  quote: string;
}

export interface VoiceResult {
  transcript: string;
  people: VoicePerson[];
  facts: VoiceFact[];
}

/**
 * Adayların yazılabileceği alanlar.
 *
 * Bilerek DAR. Ses kaydından çıkan bir tahmin `confidential`, `photos`,
 * `privateFields` gibi alanlara asla dokunmamalı; anlatı bir gizlilik ayarı
 * değiştiremez. Ve `parentIds`/`spouseIds` de yok: yapısal bağ kurmak
 * ağacın şeklini değiştirir, bir yanlış bağ da tüm akrabalık hesabını
 * bozar. Bağ önerisi serbest metin olarak `VoicePerson.relation`da kalır ve
 * kullanıcı ağaçta kendisi kurar.
 */
export const VOICE_FIELDS = [
  "birthDate",
  "deathDate",
  "birthPlace",
  "occupation",
  "education",
  "nickname",
  "patronymic",
  "lineage",
  "bio",
] as const;

export type VoiceField = (typeof VOICE_FIELDS)[number];

export function isVoiceField(v: unknown): v is VoiceField {
  return typeof v === "string" && (VOICE_FIELDS as readonly string[]).includes(v);
}

export const MAX_TRANSCRIPT = 20000;
export const MAX_VALUE = 300;
export const MAX_QUOTE = 400;

/* ------------------------------------------------------------------ */
/* Model istemi                                                        */
/* ------------------------------------------------------------------ */

export function buildVoiceSystem(lang: "tr" | "en" = "tr"): string {
  return lang === "en"
    ? [
        "You transcribe Turkish family recollections and extract genealogical facts.",
        "Transcribe VERBATIM in the language spoken. Do not summarise, correct grammar or standardise dialect.",
        "Every extracted fact MUST carry an exact quote copied from your own transcript.",
        "If something was not said, omit it. Never guess a date, place or name.",
      ].join(" ")
    : [
        "Türkçe aile anlatılarını deşifre eder ve şecere bilgisi çıkarırsın.",
        "BİREBİR deşifre et: özetleme, dilbilgisini düzeltme, ağzı standartlaştırma.",
        "Çıkardığın HER bilgi, kendi deşifre metninden birebir kopyalanmış bir alıntı taşımalı.",
        "Söylenmemiş bir şeyi yazma. Tarih, yer ya da ad TAHMİN ETME.",
      ].join(" ");
}

/** Konuşulan kişi ve ağaçtaki komşuları — modele bağlam. */
export function buildVoicePrompt(
  subject: Person | undefined,
  question: string,
  known: readonly Person[],
  lang: "tr" | "en" = "tr"
): string {
  const adlar = known
    .slice(0, 40)
    .map((p) => `${p.firstName} ${p.lastName}`.trim())
    .filter(Boolean);

  const alanlar = VOICE_FIELDS.join(", ");
  const sema =
    `{"transcript":"…","people":[{"ref":"new:1","firstName":"…","lastName":"…","relation":"…","quote":"…"}],` +
    `"facts":[{"personRef":"…","field":"<${alanlar}>","value":"…","quote":"…"}]}`;

  if (lang === "en") {
    return [
      subject ? `The recording is about: ${subject.firstName} ${subject.lastName}`.trim() : "",
      `Question asked: ${question}`,
      adlar.length ? `People already in the tree: ${adlar.join(", ")}` : "",
      `Use personRef "${subject?.id ?? "subject"}" for the subject; "new:1", "new:2"… for others.`,
      "Return ONLY JSON in this shape:",
      sema,
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    subject ? `Kayıt şu kişi hakkında: ${subject.firstName} ${subject.lastName}`.trim() : "",
    `Sorulan soru: ${question}`,
    adlar.length ? `Ağaçta zaten olan kişiler: ${adlar.join(", ")}` : "",
    `Konuşulan kişi için personRef "${subject?.id ?? "subject"}"; anlatıda geçen başkaları için "new:1", "new:2"… kullan.`,
    "YALNIZCA şu biçimde JSON dön:",
    sema,
  ]
    .filter(Boolean)
    .join("\n");
}

/* ------------------------------------------------------------------ */
/* Çözümleme ve doğrulama                                              */
/* ------------------------------------------------------------------ */

const str = (v: unknown, max: number): string | undefined => {
  if (typeof v !== "string") return undefined;
  const t = v.trim().slice(0, max);
  return t && t.toLowerCase() !== "null" ? t : undefined;
};

/**
 * Alıntı deşifre metninde GERÇEKTEN geçiyor mu?
 *
 * Karşılaştırma Türkçe katlamalı (`fold`) ve boşluk-toleranslı: modelin
 * alıntıyı büyük harfe çevirmesi ya da iki boşluğu tek yapması bir uydurma
 * değil, biçimsel bir sapma. Ama SÖZCÜKLERİ değiştirmesi uydurmadır ve
 * yakalanır.
 *
 * Noktalama sadeleştirilmiyor: "Selanik'ten geldik" ile "Selanikten geldik"
 * arasındaki fark önemsiz görünse de, noktalamayı da silmeye başlayınca
 * eşleşme gevşer ve doğrulamanın anlamı kalmaz. Model kendi metninden
 * kopyalıyorsa noktalama da birebir gelir.
 */
export function quoteIsGrounded(quote: string, transcript: string): boolean {
  const q = fold(quote).replace(/\s+/g, " ").trim();
  if (q.length < 3) return false;
  const t = fold(transcript).replace(/\s+/g, " ");
  return t.includes(q);
}

/** Modelin (kod bloklu olabilen) çıktısını JSON'a indirger. */
function stripJson(text: string): string {
  let s = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a > 0 || b < s.length - 1) s = s.slice(Math.max(0, a), b + 1);
  return s;
}

/**
 * Model çıktısını güvenli sonuca çevirir.
 *
 * Deşifre metni ÇIKARIMDAN bağımsız: JSON bozuk olsa bile elimizde bir
 * metin varsa onu döndürürüz. Anlatının kendisi zaten değerli; çıkarım
 * ikramiye. Bunu ayırmazsak tek bir ayraç hatası, ninenin anlattığı her
 * şeyi çöpe atardı.
 */
export function parseVoiceJson(text: string): VoiceResult {
  const bos: VoiceResult = { transcript: "", people: [], facts: [] };
  if (!text?.trim()) return bos;

  let data: { transcript?: unknown; people?: unknown; facts?: unknown };
  try {
    data = JSON.parse(stripJson(text)) as typeof data;
  } catch {
    // JSON değil ama bir metin var: düz deşifre saysın.
    return { ...bos, transcript: text.trim().slice(0, MAX_TRANSCRIPT) };
  }

  const transcript = str(data.transcript, MAX_TRANSCRIPT) ?? "";
  if (!transcript) return bos;

  const people: VoicePerson[] = [];
  const gorulenRef = new Set<string>();
  if (Array.isArray(data.people)) {
    for (const raw of data.people) {
      if (!raw || typeof raw !== "object") continue;
      const r = raw as Record<string, unknown>;
      const ref = str(r.ref, 64);
      const firstName = str(r.firstName, 120);
      const quote = str(r.quote, MAX_QUOTE);
      if (!ref || !firstName || !quote) continue;
      if (gorulenRef.has(ref)) continue;
      if (!quoteIsGrounded(quote, transcript)) continue;
      gorulenRef.add(ref);
      people.push({
        ref,
        firstName,
        ...(str(r.lastName, 120) ? { lastName: str(r.lastName, 120)! } : {}),
        ...(str(r.relation, 120) ? { relation: str(r.relation, 120)! } : {}),
        quote,
      });
    }
  }

  const facts: VoiceFact[] = [];
  const gorulenBilgi = new Set<string>();
  if (Array.isArray(data.facts)) {
    for (const raw of data.facts) {
      if (!raw || typeof raw !== "object") continue;
      const r = raw as Record<string, unknown>;
      const personRef = str(r.personRef, 64);
      const value = str(r.value, MAX_VALUE);
      const quote = str(r.quote, MAX_QUOTE);
      if (!personRef || !isVoiceField(r.field) || !value || !quote) continue;
      if (!quoteIsGrounded(quote, transcript)) continue;
      // `new:` kimliği yalnız gerçekten önerilen bir kişiye işaret edebilir.
      if (personRef.startsWith("new:") && !gorulenRef.has(personRef)) continue;
      const anahtar = `${personRef}|${r.field}`;
      if (gorulenBilgi.has(anahtar)) continue;
      gorulenBilgi.add(anahtar);
      facts.push({ personRef, field: r.field, value, quote });
    }
  }

  return { transcript, people, facts };
}

/* ------------------------------------------------------------------ */
/* Onay ekranı yardımcıları                                            */
/* ------------------------------------------------------------------ */

/**
 * Zaten doğru olan bilgiyi onaya sunmaz: kişide aynı değer varsa aday
 * düşürülür. "Doğum yeri: Rize" diye onaylatmak, zaten Rize yazan bir kayıt
 * için kullanıcının vaktini çalmak olur.
 *
 * DOLU ama FARKLI bir alan düşürülmez — çelişki tam da görülmesi gereken
 * şeydir. Onay ekranı eski değeri de gösterir.
 */
export function pendingFacts(
  facts: readonly VoiceFact[],
  people: readonly Person[]
): Array<VoiceFact & { current?: string }> {
  const byId = new Map(people.map((p) => [p.id, p]));
  const out: Array<VoiceFact & { current?: string }> = [];
  for (const f of facts) {
    const p = byId.get(f.personRef);
    if (!p) {
      // Yeni kişi adayı — karşılaştırılacak mevcut değer yok.
      out.push({ ...f });
      continue;
    }
    const current = (p as unknown as Record<string, unknown>)[f.field];
    const mevcut = typeof current === "string" ? current : undefined;
    if (mevcut && fold(mevcut) === fold(f.value)) continue;
    out.push({ ...f, ...(mevcut ? { current: mevcut } : {}) });
  }
  return out;
}

/**
 * Onaylanan bilgileri kişi güncellemelerine çevirir.
 *
 * `bio` BİRİKTİRİR, diğer alanlar değiştirir: hayat hikâyesine eklenen bir
 * cümle eskisinin yerine geçmemeli, ama doğum yeri iki değer taşıyamaz.
 */
export function applyFacts(
  person: Person,
  facts: readonly VoiceFact[]
): Partial<Person> {
  const out: Record<string, string> = {};
  for (const f of facts) {
    if (f.personRef !== person.id) continue;
    if (f.field === "bio") {
      const onceki = out.bio ?? person.bio ?? "";
      out.bio = onceki ? `${onceki}\n\n${f.value}` : f.value;
    } else {
      out[f.field] = f.value;
    }
  }
  return out as Partial<Person>;
}
