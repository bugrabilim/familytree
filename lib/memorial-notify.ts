/**
 * ANMA TAKVİMİ BİLDİRİMİ (madde 48).
 *
 * `lib/memorials.ts` (madde 9) "bu pencereye hangi anmalar düşer" sorusunu
 * yanıtlıyor. Bu dosya onu bir günlük pencereye daraltıp e-postaya HAZIR
 * insan-okur satırlara çeviren SAF çekirdek — `lib/reminders.ts`in
 * (`todaysReminders` / `remindersToText`) izlediği kalıp: bir `Person[]` +
 * bir tarih al, o güne denk gelenleri döndür; ayrı bir fonksiyon bunları
 * TR/EN metne çevirir. Gerçek gönderim (cron + e-posta) bu dosyanın dışında.
 *
 * Bağımlılıksızlık: `CLAUDE.md` gereği bu lib `node --experimental-strip-types`
 * altında birim testi koşuyor, yani çalışma zamanında `@/...` DEĞER importu
 * kullanamaz (tip importu serbest — çalışma zamanında elenir). `lib/memorials.ts`
 * ve `lib/privacy.ts` de aynı kısıtla yazılmış saf modüller (yalnız tip importu
 * taşıyorlar), bu yüzden ikisi de GÖRELİ yoldan (`./…`) güvenle içe aktarılabiliyor.
 *
 * ## Gizlilik kararı — NEDEN atlanmadı
 *
 * `lib/privacy.ts`teki `maskPerson`, `confidential` bir kişide bile `deathDate`i
 * korur — çünkü UI'da "vefat rozeti" göstermek amacıyla var, ekranda kalan bir
 * kayıt hâlâ ailenin gördüğü bir bağlamdadır. E-posta bambaşka bir kanal:
 * posta kutusuna düşen bir satır geri alınamaz ve kime iletileceği (yönlendirme,
 * ortak posta kutusu, vs.) uygulamanın gösterim denetiminin dışındadır. Bu
 * yüzden bildirimde eşik UI'dan daha SIKI tutuluyor:
 *
 *   - `confidential` işaretli kişi MUTLAK dışlanır (deathDate dâhil, hiçbir
 *     alanı bildirime girmez) — `maskPerson`in UI istisnası burada geçerli değil.
 *   - Geri kalan herkes `stripPrivateFields` üzerinden geçirilir. Bugün hiçbir
 *     `PRIVATE_GROUP_FIELDS` grubu ad veya `deathDate`i kapsamıyor (bkz.
 *     `lib/privacy.ts`), yani şu an gözle görülür bir fark yaratmıyor — ama
 *     boru hattı buradan geçtiği için ileride bir grup bu alanlardan birini
 *     kapsarsa (örn. "identity") bildirim elle senkronize edilen ikinci bir
 *     liste tutmaya gerek kalmadan otomatik susar. `stripPrivateFields` sonrası
 *     `deathDate` kalkarsa `lib/memorials.ts`teki tarih ayrıştırıcı zaten hiçbir
 *     anma üretmiyor (bkz. o dosyadaki "tam tarih şart" kuralı).
 */

import type { Person } from "../types/family.ts";
import {
  memorialCalendar,
  type MemorialConfig,
  type NightKind,
  type Observance,
  type Window,
} from "./memorials.ts";
import { stripPrivateFields } from "./privacy.ts";

export interface MemorialNotice extends Observance {
  /** Görünen ad — bildirim metni bunun üstüne kurulur. */
  name: string;
}

const nameOf = (p: Person) => `${p.firstName} ${p.lastName}`.trim() || p.firstName || "—";

/**
 * Yerel takvim günü "YYYY-MM-DD". `lib/memorials.ts`teki `iso` UTC kullanıyor
 * (gün aritmetiği için) ama "bugün" kullanıcının yerel günüdür — `lib/reminders.ts`
 * de `todaysReminders`de aynı sebeple yerel `getFullYear/Month/Date` kullanıyor.
 */
function localISO(d: Date): string {
  const y = String(d.getFullYear()).padStart(4, "0");
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * `today` gününe denk gelen anma günleri (3./7./40./52. gece, sene-i devriye,
 * yapılandırılmışsa Hicri sene-i devriye). Ölüm tarihi olmayan/eksik olan
 * kişiler için hiçbir şey üretilmez — bu kural `lib/memorials.ts`te.
 *
 * `config` doğrudan `memorialCalendar`e geçer: hangi anmaların açık olduğu,
 * gün sayıları ve Hicri devriye enjeksiyonu ailenin/çağıranın elinde kalır
 * (bkz. `lib/memorials.ts` başındaki "betimleyici, buyurgan değil" ilkesi).
 */
export function todaysMemorialNotices(
  people: Person[],
  today: Date,
  config: MemorialConfig = {}
): MemorialNotice[] {
  const dateStr = localISO(today);
  const window: Window = { from: dateStr, to: dateStr };

  // Gizlilik adım 1: confidential kayıt hiçbir bildirimde görünmez (yukarıdaki
  // dosya başlığındaki gerekçe).
  const eligible = people.filter((p) => !p.confidential);

  // Gizlilik adım 2: kalan herkes alan-bazlı gizliliğin (privateFields) süzgecinden
  // geçer. `id`/`firstName`/`lastName`/`deathDate` hiçbir grupta olmadığından bugün
  // sonucu değiştirmiyor ama gelecekteki bir grup bu alanları kapsarsa (bkz. dosya
  // başlığı) bildirim otomatik susar.
  const masked = eligible.map(stripPrivateFields);
  const byId = new Map(masked.map((p) => [p.id, p]));

  return memorialCalendar(masked, window, config).reduce<MemorialNotice[]>((out, o) => {
    const p = byId.get(o.personId);
    if (p) out.push({ ...o, name: nameOf(p) });
    return out;
  }, []);
}

const NIGHT_LABEL: Record<NightKind, { tr: string; en: string }> = {
  gece3: { tr: "üçüncü gece", en: "3rd night" },
  gece7: { tr: "yedinci gece", en: "7th night" },
  gece40: { tr: "kırkıncı gece", en: "40th night" },
  gece52: { tr: "elli ikinci gece", en: "52nd night" },
};

function line(n: MemorialNotice, lang: "tr" | "en"): string {
  if (n.kind === "seneiDevriye" || n.kind === "seneiDevriyeHicri") {
    const hijriSuffix = n.kind === "seneiDevriyeHicri" ? (lang === "en" ? " (Hijri)" : " (Hicri)") : "";
    if (lang === "en") {
      return `🕯️ ${n.name}${n.year !== undefined ? ` — ${n.year} year(s) since passing` : " — anniversary of passing"}${hijriSuffix}`;
    }
    return `🕯️ ${n.name}${n.year !== undefined ? ` — vefatının ${n.year}. yılı` : " — vefat yıl dönümü"}${hijriSuffix}`;
  }
  const label = NIGHT_LABEL[n.kind];
  return `🕯️ ${n.name} — ${lang === "en" ? label.en : label.tr}`;
}

/** Bildirim listesini e-posta gövdesi (düz metin) için satırlara çevirir. */
export function memorialNoticesToText(notices: MemorialNotice[], lang: "tr" | "en" = "tr"): string {
  return notices.map((n) => line(n, lang)).join("\n");
}
