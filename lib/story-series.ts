import { PROMPTS, nextPrompt, type PromptSubject, type PromptVoice } from "./prompts.ts";

/**
 * HAFTALIK SORU SERİSİ — saf karar katmanı (madde 39, yeniden tanımlanmış).
 *
 * ## Madde 39 neden yeniden tanımlandı
 *
 * `docs/YAPIM-SIRASI.md` bu maddeyi "Storyworth için ayrı giriş kapısı —
 * 'ağaçsız hesap', `accountId === treeId` değişmezini kırıyor" diye
 * yazıyordu. O teşhis yanlıştı ve ölçülerek çürütüldü:
 *
 *  · "Ağaçsız hesap" ZATEN var, adı ÜYE (`lib/tree-context.ts`): üyeye ağaç
 *    kaydı hiç sorulmuyor.
 *  · Girişsiz YAZMA yüzeyi de zaten var — `lib/public-routes.ts`te yedi tane,
 *    bu dosyanın beslediği `/hikaye` dâhil.
 *  · Değişmezi kırmanın kullanıcıya görünen faydası SIFIR; bedeli ise
 *    `lib/tree-access.ts`teki `treeId === accountId || ownedIds.includes(...)`
 *    satırını iki ayrı ad uzayı arasındaki bir eşitliğe çevirmek. O satır,
 *    eşitlik sağlandığında KAYDA HİÇ BAKMADAN kurucu yetkisi veriyor.
 *
 * Eksik olan şey mimari değil KADANS'tı. `docs/REKABET-ARASTIRMASI-2.md`:
 * "kullanıcıyı uygulamaya çağırmıyor; ona gidiyor. Giriş yok, öğrenme yok."
 * Bugüne kadar hikâye bağlantısı HİÇ gönderilmiyordu: uç bağlantıyı üretip
 * bir kez POST yanıtında döndürüyor, ağaç sahibi elle kopyalıyordu.
 *
 * Motor da hazırdı: `lib/prompts.ts` `nextPrompt`in gerekçesi zaten
 * "haftalık cron her çalıştığında aynı hafta için aynı soruyu üretmeli" diye
 * yazılmış — ama o cron hiç yazılmamıştı. Bu dosya o borunun karar ucu.
 *
 * ## Neden yalnız "self" sesi
 *
 * Serinin postası KONUNUN KENDİ adresine gidiyor (`contactEmail`), yani soru
 * kişiye kendisi hakkında soruluyor. "about" sesindeki sorular üçüncü tekil
 * kurulmuş ("{name} — sesi nasıldı?") ve kişinin kendisine gönderildiğinde
 * anlamsız olurdu. Ses seçimi bu yüzden SAF KATMANDA sabit: kural cron'a
 * bırakılsaydı ikinci bir çağıran onu farklı seçebilirdi.
 *
 * Bunun bilinen bedeli: banka 52 soru taşıyor ama serinin çekebileceği bölüm
 * "self" olanlar kadar (`SERIES_WEEKS`). İlerleme göstergesi de bu sayıyı
 * kullanıyor — 52 yazıp 26'da bitmek, kullanıcıya yalan söylemek olurdu.
 *
 * ## Bağımlılık kuralı
 *
 * `@/` ÇALIŞMA ZAMANI içe aktarımı yok; `./prompts.ts` göreli ve uzantılı
 * (tsconfig `allowImportingTsExtensions`), yani `node --experimental-strip-types`
 * altında çözülüyor ve `tests/story-series.test.mts` bu dosyayı doğrudan
 * sınayabiliyor. Aynı disiplin: `lib/public-routes.ts`, `lib/contact-token.ts`.
 */

/** Serinin sorduğu sorunun sesi — gerekçesi dosya başında. */
export const SERIES_VOICE: PromptVoice = "self";

/**
 * Bir serinin çekebileceği en fazla hafta = bankanın bu sesteki bölümü.
 *
 * Sabit bir 52 yazılmadı: banka büyüdükçe/küçüldükçe bu sayı kendiliğinden
 * doğru kalsın. Arayüzdeki "7/26" ilerlemesi de buradan besleniyor.
 */
export const SERIES_WEEKS = PROMPTS.filter((p) => p.voice === SERIES_VOICE).length;

/**
 * Serinin ömrü (gün). Süresiz bir seri, her hafta yeni bir girişsiz yazma
 * bağlantısı üreten sonsuz bir boru demek olurdu — `lib/story-store.ts`teki
 * `DEFAULT_DAYS` ile aynı gerekçe, bir kat yukarıda.
 */
export const SERIES_DAYS = 365;

/** Ağaç sahibinin bir kişi için başlattığı haftalık seri. */
export interface StorySeries {
  id: string;
  /** Serinin konusu VE alıcısı — posta bu kişinin `contactEmail`ine gidiyor. */
  personId: string;
  createdAt: string;
  /** Son kullanma (ISO). */
  expiresAt: string;
  /** Ağaç sahibi durdurdu mu? Süreden bağımsız. */
  closed?: boolean;
  /**
   * Gönderilmiş soru kimlikleri, sırayla.
   *
   * Neden kişinin `memories`ine bakılmıyor: `lib/contribution.ts` `toMemory`
   * anıya sorunun METNİNİ yazıyor, kimliğini değil. `subjectFromPerson`in
   * ürettiği `answered` listesi bu yüzden kimlik değil cümle taşıyor ve
   * tekrarı engellemeye yetmez. Serinin kendi defteri şart.
   */
  asked: string[];
  /**
   * Son gönderimin hafta numarası (`weekIndex`). Günlük iş haftada yedi kez
   * koşuyor; bu damga olmadan aynı hafta yedi soru giderdi.
   */
  lastWeek?: number;
  /**
   * O an açık duran haftalık talebin kimliği. Yenisi açılırken bu kapanıyor —
   * gerekçesi `lib/story-store.ts` `issueWeekly`de (talep tavanı).
   */
  currentRequestId?: string;
}

/**
 * Hafta numarası — Unix çağından beri. `lib/cron-budget.ts`teki `dayIndex`in
 * haftalık eşi ve bilerek KOPYALANDI: oradan içe aktarmak bu dosyaya
 * çalışma zamanı `@/` bağımlılığı sokar ve birim testini imkânsız kılardı
 * (`lib/prompts.ts`teki yaş hesabının kopyalanmasıyla aynı gerekçe).
 *
 * Çağ günü Perşembe'ye denk geldiği için hafta sınırı da Perşembe. Cron
 * PAZAR günü gönderdiği için iki gönderim arasında her zaman bir Perşembe
 * var: ardışık iki pazarın hafta numarası hiçbir zaman aynı olmuyor.
 */
export function weekIndex(now: Date): number {
  return Math.floor(now.getTime() / 604_800_000);
}

export type WeeklyPlan =
  /** Bu hafta bu soru gönderilecek. `week` işaretlenecek hafta numarası. */
  | { kind: "gonder"; promptId: string; week: number }
  /** Bu koşuda bir şey yapılmıyor ama seri yaşıyor. */
  | { kind: "atla"; reason: "kapali" | "bu-hafta-gonderildi" }
  /** Seri bitti — çağıran onu kapatabilir. */
  | { kind: "bitti"; reason: "banka-bitti" | "sure-doldu" };

/**
 * Bu koşuda ne yapılmalı?
 *
 * ## Sıra ÖNEMLİ
 *
 * Önce serinin kendi durumu (kapalı mı, süresi doldu mu), sonra "bu hafta
 * zaten gönderildi mi", en sonda soru seçimi. Soru seçimi en pahalı adım
 * (bütün bankayı süzüyor) ve kapalı bir seri için hiç yapılmamalı.
 *
 * ## Neden rastgelelik YOK
 *
 * `nextPrompt` deterministik ve tohum `seri:hafta`. Günlük iş aynı hafta
 * içinde tekrar denerse (dünkü gönderim düştü) AYNI soruyu üretiyor; iki
 * örnek aynı anda koşarsa da öyle. Aksi hâlde kişiye aynı hafta iki farklı
 * soru giderdi ve ikisi de ayrı birer yazma bağlantısı açardı.
 *
 * ## `today` neden parametre
 *
 * Karar tamamen saatte: test kendi haftasını kurabilsin diye saat dışarıdan
 * geliyor. Bu dosyada `new Date()` çağrısı YOK.
 */
export function planWeekly(
  series: StorySeries,
  subject: PromptSubject,
  today: Date
): WeeklyPlan {
  if (series.closed) return { kind: "atla", reason: "kapali" };

  const bitis = Date.parse(series.expiresAt);
  /*
   * Damga OKUNAMIYORSA seri bitmiş sayılıyor — güvenli yön kapalı olmak.
   * `NaN >= x` her zaman false olduğu için çıplak karşılaştırma bozuk bir
   * damgayı SÜRESİZ bir seriye çevirirdi.
   */
  if (Number.isNaN(bitis) || today.getTime() >= bitis)
    return { kind: "bitti", reason: "sure-doldu" };

  const hafta = weekIndex(today);
  /*
   * `<=` (yalnız `===` değil): saat geriye kayarsa (sunucu saati, yaz saati,
   * elle düzeltilmiş damga) `===` denetimi geçmiş bir haftayı yeniden açardı.
   */
  if (series.lastWeek !== undefined && hafta <= series.lastWeek)
    return { kind: "atla", reason: "bu-hafta-gonderildi" };

  if (series.asked.length >= SERIES_WEEKS) return { kind: "bitti", reason: "banka-bitti" };

  /*
   * Serinin KENDİ defteri `answered`a ekleniyor: kişinin anıları soruyu
   * metin olarak taşıyor (yukarıdaki `asked` gerekçesi), yani tekrarı
   * engelleyen tek kayıt bu liste.
   */
  const konu: PromptSubject = {
    ...subject,
    answered: [...subject.answered, ...series.asked],
  };
  const soru = nextPrompt(konu, `${series.id}:${hafta}`, { voice: SERIES_VOICE }, today);
  if (!soru) return { kind: "bitti", reason: "banka-bitti" };

  return { kind: "gonder", promptId: soru.id, week: hafta };
}

/**
 * Depodan okunan ham kaydı seriye çevirir; tanınmayan kayıt `null`.
 *
 * `lib/story-store.ts` `normalizeBox`taki `tokenHash` kuralının eşi: eksik
 * alanlı bir kayıt sessizce "boş" sayılırsa, `asked` listesi kaybolur ve
 * seri baştan başlayıp sorduğu soruları yeniden sorar.
 */
export function normalizeSeries(raw: unknown): StorySeries | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<StorySeries>;
  if (typeof r.id !== "string" || !r.id) return null;
  if (typeof r.personId !== "string" || !r.personId) return null;
  if (typeof r.createdAt !== "string" || typeof r.expiresAt !== "string") return null;
  return {
    id: r.id,
    personId: r.personId,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
    ...(r.closed ? { closed: true } : {}),
    asked: Array.isArray(r.asked) ? r.asked.filter((x): x is string => typeof x === "string") : [],
    ...(typeof r.lastWeek === "number" && Number.isFinite(r.lastWeek)
      ? { lastWeek: r.lastWeek }
      : {}),
    ...(typeof r.currentRequestId === "string" && r.currentRequestId
      ? { currentRequestId: r.currentRequestId }
      : {}),
  };
}
