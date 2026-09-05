import type { Person } from "../types/family.ts";
import { isMember } from "./associates.ts";
import { viewAll } from "./privacy.ts";
import { isRoundAnniversary } from "./report-card.ts";
import { computeGenerations } from "./book-stats.ts";

/**
 * AİLE BÜLTENİ — bir dönemin (haftalık/aylık) İÇERİĞİNİ üreten saf çekirdek.
 *
 * Yol haritası madde 47. Gönderim (e-posta/cron) burada YOK — bu dosya yalnız
 * "bültende ne görünsün" sorusuna cevap verir; `lib/reminders.ts`teki
 * yorumdaki ayrımın aynısı: gerçek gönderim `lib/email.ts` + cron'un işi.
 *
 * ## En yakın akraba: `lib/report-card.ts`
 *
 * Karneyle aynı temel ayrımı taşır ve KORUR:
 *
 * · **Ailede olan** (`events`, `anniversaries`) — gerçek hayat olayları,
 *   kayıttaki TARİHLERDEN gelir. Yalnız [from,to] aralığına TAM tarihi
 *   (`YYYY-MM-DD`) düşenler sayılır.
 * · **Kayda geçen** (`additions`) — bu dönemde ağaca eklenen kart. 1890
 *   doğumlu bir dedeyi bu ay ağaca eklemek bu ay bir DOĞUM değildir; yalnız
 *   `additions`te görünür, `events`te asla.
 *
 * Karneden FARKI: karne bir YIL alır ve yıl-hassasiyetli (`"YYYY"`) tarihleri
 * de sayar; bülten HAFTALIK/AYLIK bir pencereye TAM tarih (gün hassasiyeti)
 * gerektirir — "1950 civarı" ya da yalnız yıl bilinen bir olayı bir haftalık
 * pencereye yerleştirmenin doğru bir yolu yok, o yüzden böyle tarihler bu
 * modülde sessizce ATILIR (yıl-karnesindeki `yearOf`'un tersi bir seçim).
 *
 * `additions` için geçmiş görüntüsü (`before`) verilmezse o bölüm `null` —
 * karnedeki "geçmiş yoksa uydurma" kuralının aynısı.
 *
 * ## Gizlilik — ATLANMADI
 *
 * `lib/privacy.ts`teki `view()` katmanı zorunlu, ama bülten karneden DAHA
 * SIKI davranır:
 *
 * · Karne, `confidential` kişiyi listede TUTAR ama adını boşaltır (`ref()`
 *   → `name: ""`) — ekranda "1 gizli doğum oldu" diyebilmek için.
 * · Bülten `confidential` kişiyi listeden TAMAMEN ÇIKARIR — sayıma bile
 *   katmaz. Neden daha sıkı: karne kullanıcının KENDİ ekranında açılan bir
 *   görünüm, bülten ise kutudan DIŞARI giden bir e-posta/bildirim. Postayı
 *   ileten biri ya da paylaşılan bir gelen kutusu "1 gizli kayıt var"
 *   bilgisini bile görmemeli — bu, `confidential` bayrağının VAR OLUŞ
 *   sebebiyle çelişirdi.
 * · `hideLiving: true` verilirse yaşayanlar da (karnenin aksine) tamamen
 *   maskelenir — `privacy.ts`teki `maskPerson` doğum tarihini taşımaz, yani
 *   doğum günü/yıl dönümü bölümleri o kişi için kendiliğinden BOŞ kalır.
 *   Varsayılan `false`: bültenin asıl amacı ailenin doğum günlerini
 *   hatırlatmak, o yüzden varsayılan olarak yaşayan bilgisini gizlemiyoruz —
 *   bunu isteyen çağıran taraf (ör. herkese açık bir özet) açıkça seçer.
 * · `privateFields` grupları (`stripPrivateFields`) geri kalan herkeste
 *   normal şekilde uygulanır — bülten yalnız tarih/isim kullandığı için bu
 *   çoğunlukla görünmez ama örn. `events` grubu gizliyse o kişinin yaşam
 *   olayları (evlilik dahil) bültende hiç görünmez.
 *
 * Kanıtlar `tests/newsletter.test.mts`te.
 *
 * Saf ve bağımlılık-hafif: yalnız tür-only `@/…` + göreli `.ts` değer içe
 * aktarımı (`report-card`/`associates`/`privacy`/`book-stats` de aynı
 * kurala uyuyor) → `node --experimental-strip-types` ile test edilebilir.
 */

/* ── Ortak yardımcılar ────────────────────────────────────────────────────── */

const isFullDate = (d?: string): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);

function nameOf(p: Person): string {
  return `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() || p.firstName || "—";
}

export interface NewsletterPersonRef {
  id: string;
  name: string;
}

function ref(p: Person): NewsletterPersonRef {
  return { id: p.id, name: nameOf(p) };
}

/** İki tarih (YYYY-MM-DD) arasında sıralama karşılaştırması — ISO biçim
 * sözlüksel karşılaştırmayla da kronolojik sırayı verir, ayrı bir Date
 * ayrıştırmasına gerek yok. */
function withinRange(date: string, from: string, to: string): boolean {
  return date >= from && date <= to;
}

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/**
 * Bir kaynak tarihin (doğum/ölüm/olay) YIL DEĞİŞTİRİLMİŞ hâllerinden
 * [from,to] aralığına düşenler — "her yıl tekrarlanan gün" mantığı (doğum
 * günü, yıl dönümü). 29 Şubat gibi bir kaynak tarih artık olmayan bir yıla
 * denk gelirse o yıl atlanır: o yılda böyle bir gün yoktur.
 */
function occurrencesInRange(sourceDate: string, from: string, to: string): string[] {
  const monthDay = sourceDate.slice(5, 10);
  const y1 = Number(from.slice(0, 4));
  const y2 = Number(to.slice(0, 4));
  const out: string[] = [];
  for (let y = y1; y <= y2; y++) {
    if (monthDay === "02-29" && !isLeapYear(y)) continue;
    const candidate = `${y}-${monthDay}`;
    if (withinRange(candidate, from, to)) out.push(candidate);
  }
  return out;
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split("-").map(Number);
  const [y2, m2, d2] = to.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/**
 * Bültenin görebileceği kişiler: yalnız aile üyeleri (çevre değil) VE yalnız
 * gizli-olmayan kayıtlar (bkz. dosya başı — `confidential` burada karneden
 * farklı olarak listeden TAMAMEN çıkarılır, yalnız adı boşaltılmaz). Geri
 * kalanlar `viewAll` ile alan-bazlı gizliliğe (ve istenirse yaşayan
 * maskelemesine) tabi tutulur.
 */
function visibleMembers(people: readonly Person[], hideLiving: boolean): Person[] {
  return viewAll(
    people.filter((p) => isMember(p) && !p.confidential),
    hideLiving
  );
}

/* ── Dönem içinde ağaca eklenenler ("kayda geçen") ───────────────────────── */

export interface Additions {
  count: number;
  people: NewsletterPersonRef[];
}

/**
 * `before` (dönem başındaki görüntü) ile bugünü kimlik bazında karşılaştırır.
 *
 * Sınır durum: biri bu dönemde `confidential` işaretinden ÇIKARSA, o kişi
 * `before`de (o zaman gizliydi, filtrelendi) yokmuş gibi görünüp burada
 * "eklenmiş" sayılabilir. Bu bir sızıntı DEĞİL — kişi zaten önceki bültende
 * hiç görünmüyordu — yalnız "eklendi" etiketi teknik olarak yanlış olur;
 * kabul edilebilir bir sınır durumu (gerçek bir yeniden-ekleme ile
 * ayırt etmenin tek yolu geçmiş confidential durumunu da saklamak olurdu).
 */
function computeAdditions(before: Person[], now: Person[]): Additions {
  const beforeIds = new Set(before.map((p) => p.id));
  const added = now.filter((p) => !beforeIds.has(p.id));
  return { count: added.length, people: added.map(ref) };
}

/* ── Ailede olan: dönem içindeki gerçek olaylar ──────────────────────────── */

export interface PeriodEvent extends NewsletterPersonRef {
  kind: "dogum" | "olum" | "olay";
  /** Yalnız kind "olay" için: `LIFE_EVENT_TYPES` anahtarı ya da serbest metin. */
  type?: string;
  title?: string;
  /** Tam tarih (YYYY-MM-DD) — bu bölüme yalnız TAM tarihli olaylar girer. */
  date: string;
}

function periodEvents(people: Person[], from: string, to: string): PeriodEvent[] {
  const out: PeriodEvent[] = [];
  for (const p of people) {
    if (isFullDate(p.birthDate) && withinRange(p.birthDate, from, to)) {
      out.push({ ...ref(p), kind: "dogum", date: p.birthDate });
    }
    if (isFullDate(p.deathDate) && withinRange(p.deathDate, from, to)) {
      out.push({ ...ref(p), kind: "olum", date: p.deathDate });
    }
    for (const ev of p.events ?? []) {
      if (isFullDate(ev.date) && withinRange(ev.date, from, to)) {
        out.push({ ...ref(p), kind: "olay", type: ev.type, title: ev.title, date: ev.date });
      }
    }
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

export interface PeriodAnniversary extends NewsletterPersonRef {
  event: "dogum" | "olum";
  /** Kaçıncı yıl (`isRoundAnniversary` — 10'un katı, ya da 25/75). */
  years: number;
  /** Bu döneme denk gelen tam tarih. */
  date: string;
}

/**
 * Dönem içine düşen YUVARLAK yıl dönümleri (`lib/report-card.ts`teki
 * `isRoundAnniversary` ile aynı eşik — her yıl dönümü değil, 3. yıl bir
 * haber değil). Bilerek "ailede olan" tarafında: yıl dönümü tarihi gerçekten
 * bu dönemin bir GÜNÜNE denk geliyor, tahmini bir şey değil.
 */
function periodAnniversaries(people: Person[], from: string, to: string): PeriodAnniversary[] {
  const out: PeriodAnniversary[] = [];
  for (const p of people) {
    if (isFullDate(p.birthDate)) {
      for (const date of occurrencesInRange(p.birthDate, from, to)) {
        const years = Number(date.slice(0, 4)) - Number(p.birthDate.slice(0, 4));
        if (isRoundAnniversary(years)) out.push({ ...ref(p), event: "dogum", years, date });
      }
    }
    if (isFullDate(p.deathDate)) {
      for (const date of occurrencesInRange(p.deathDate, from, to)) {
        const years = Number(date.slice(0, 4)) - Number(p.deathDate.slice(0, 4));
        if (isRoundAnniversary(years)) out.push({ ...ref(p), event: "olum", years, date });
      }
    }
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

/* ── Yaklaşan doğum günleri / yıl dönümleri ───────────────────────────────── */

export type UpcomingKind = "birthday" | "memorial" | "anniversary";

/**
 * `kind` adları bilerek `lib/reminders.ts`teki sözlükle aynı — bu bölüm
 * kavramsal olarak "reminders.ts'in bir ARALIK üzerinde çalışan hâli": tek
 * bir güne bakmak yerine [from,to] penceresindeki her tekrarı toplar.
 */
export interface UpcomingItem extends NewsletterPersonRef {
  kind: UpcomingKind;
  /** Pencere içindeki (gelecekteki) tam tarih. */
  date: string;
  /** Doğum günü → yaş, anma/yıl dönümü → yıl. Kaynak tarih yoksa null. */
  years: number | null;
  /** Yalnız evlilik yıl dönümünde, eş adı biliniyorsa. */
  spouseName?: string;
}

/**
 * `reminders.ts`in aksine YUVARLAK yıl sınırlaması YOK: haftalık/aylık bir
 * pencere zaten az sayıda satır üretir, `report-card`teki gibi bir yıllık
 * gürültüyü azaltma ihtiyacı burada yok — ve "yaklaşan doğum günü" özelliği
 * tam olarak budur: kaçıncı yıl olursa olsun, yaklaşan HER doğum günü.
 */
export function upcomingItems(people: readonly Person[], from: string, to: string): UpcomingItem[] {
  const byId = new Map(people.map((p) => [p.id, p]));
  const out: UpcomingItem[] = [];
  const seenAnniv = new Set<string>();

  for (const p of people) {
    // 🎂 Doğum günü — yalnız yaşayanlar (reminders.ts ile aynı kural)
    if (!p.deathDate && isFullDate(p.birthDate)) {
      for (const date of occurrencesInRange(p.birthDate, from, to)) {
        out.push({ ...ref(p), kind: "birthday", date, years: Number(date.slice(0, 4)) - Number(p.birthDate.slice(0, 4)) });
      }
    }
    // 🕯️ Anma — yalnız vefat edenler
    if (isFullDate(p.deathDate)) {
      for (const date of occurrencesInRange(p.deathDate, from, to)) {
        out.push({ ...ref(p), kind: "memorial", date, years: Number(date.slice(0, 4)) - Number(p.deathDate.slice(0, 4)) });
      }
    }
    // 💍 Evlilik yıl dönümü — çift-anahtarla tekilleştir (iki eşten iki kez üretme)
    for (const ev of p.events ?? []) {
      if (ev.type !== "evlilik" || !isFullDate(ev.date)) continue;
      for (const date of occurrencesInRange(ev.date, from, to)) {
        const spouseId = (p.spouseIds ?? [])[0];
        const pairKey = [p.id, spouseId ?? ev.id].sort().join("|") + "|" + date;
        if (seenAnniv.has(pairKey)) continue;
        seenAnniv.add(pairKey);
        const spouse = spouseId ? byId.get(spouseId) : undefined;
        out.push({
          ...ref(p),
          kind: "anniversary",
          date,
          years: Number(date.slice(0, 4)) - Number(ev.date.slice(0, 4)),
          spouseName: spouse ? nameOf(spouse) : undefined,
        });
      }
    }
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

/* ── Ağacın büyüme özeti ──────────────────────────────────────────────────── */

export interface GrowthSummary {
  /** Görünür (üye + gizli-olmayan) toplam kişi sayısı. */
  totalPeople: number;
  /** Ağaçta şu an dolu olan kuşak sayısı (`lib/book-stats.ts`teki tanım). */
  generations: number;
}

/* ── Bülten ───────────────────────────────────────────────────────────────── */

export interface NewsletterOptions {
  /** Dönem başı, dahil ("YYYY-MM-DD"). */
  from: string;
  /** Dönem sonu, dahil ("YYYY-MM-DD"). */
  to: string;
  /**
   * Dönem BAŞINDAKİ kişi listesi — yalnız "eklenenler" bölümü için. Yoksa
   * o bölüm `null` döner (karnedeki `record: null` kuralının aynısı: geçmiş
   * görüntü yoksa uydurma bir sayı göstermektense hiç göstermemek).
   */
  before?: readonly Person[];
  /** Yaklaşan olaylar penceresinin başı. Verilmezse `to`nun ertesi günü. */
  upcomingFrom?: string;
  /** Yaklaşan olaylar penceresinin sonu. Verilmezse dönemle aynı uzunlukta. */
  upcomingTo?: string;
  /**
   * true ise yaşayanlar da tümüyle maskelenir (doğum tarihi dahil) — bkz.
   * dosya başı gizlilik notu. Varsayılan `false`.
   */
  hideLiving?: boolean;
}

export interface Newsletter {
  from: string;
  to: string;
  /** Bu dönemde ağaca eklenen kişiler — kayda geçen. `before` yoksa `null`. */
  additions: Additions | null;
  /** Bu dönemde gerçekleşen doğum/ölüm/yaşam olayları — ailede olan. */
  events: PeriodEvent[];
  /** Bu döneme denk gelen yuvarlak yıl dönümleri — ailede olan. */
  anniversaries: PeriodAnniversary[];
  /** Yaklaşan doğum günleri / anmalar / evlilik yıl dönümleri. */
  upcoming: UpcomingItem[];
  growth: GrowthSummary;
  /** Bu dönemde hiçbir şey yok mu? (büyüme özeti hariç — o her zaman dolu.) */
  empty: boolean;
}

/**
 * Bir dönemin bülten İÇERİĞİNİ üretir.
 *
 * Ağaçta (gizli/çevre süzüldükten sonra) hiç görünür kişi kalmıyorsa `null`
 * döner — "0 kişi, 0 kuşak" gibi anlamsız bir büyüme özeti göstermenin
 * anlamı yok. Kişi varsa ama dönemde hiçbir şey olmamışsa yine de bir
 * `Newsletter` döner (`empty: true` ile) — çağıran taraf isterse ekranda
 * "bu dönem sakin geçti" gibi dürüst bir durum gösterebilir; GÖNDERMEK
 * isteyip istemediğine `shouldSend` ile karar verir.
 */
export function buildNewsletter(people: readonly Person[], opts: NewsletterOptions): Newsletter | null {
  const now = visibleMembers(people, !!opts.hideLiving);
  if (now.length === 0) return null;

  const additions = opts.before ? computeAdditions(visibleMembers(opts.before, !!opts.hideLiving), now) : null;
  const events = periodEvents(now, opts.from, opts.to);
  const anniversaries = periodAnniversaries(now, opts.from, opts.to);

  const upcomingFrom = opts.upcomingFrom ?? addDays(opts.to, 1);
  const upcomingTo = opts.upcomingTo ?? addDays(upcomingFrom, daysBetween(opts.from, opts.to));
  const upcoming = upcomingItems(now, upcomingFrom, upcomingTo);

  const growth: GrowthSummary = {
    totalPeople: now.length,
    generations: new Set(computeGenerations(now).values()).size,
  };

  const empty = (!additions || additions.count === 0) && events.length === 0 && anniversaries.length === 0 && upcoming.length === 0;

  return { from: opts.from, to: opts.to, additions, events, anniversaries, upcoming, growth, empty };
}

/**
 * Bu bülten gönderilmeye değer mi?
 *
 * "Kimse boş bülten almasın" kuralının TEK giriş noktası — `buildNewsletter`
 * `null` (boş ağaç) VEYA `empty: true` (kişi var ama dönemde bir şey yok)
 * döndürebilir; cron/gönderim tarafı ikisini de tek bir kontrolle eler.
 */
export function shouldSend(n: Newsletter | null): n is Newsletter {
  return n !== null && !n.empty;
}

/* ── Metne çevirme ────────────────────────────────────────────────────────── */

/**
 * Bülteni e-posta gövdesi için satırlara çevirir.
 *
 * Biçimlendirme ROTADA değil burada: `lib/reminders.ts` (`remindersToText`) ve
 * `lib/memorial-notify.ts` (`memorialNoticesToText`) aynı kalıbı izliyor.
 * Rotada kalsaydı üç e-postanın dili üç ayrı yerde tutulur ve testsiz kalırdı.
 *
 * `growth` satırı HER ZAMAN var: bülten "bu ay sakin geçti" bile dese, ağacın
 * o anki büyüklüğü bültenin taşıdığı en küçük anlamlı bilgi.
 */
export function newsletterToLines(n: Newsletter, lang: "tr" | "en" = "tr"): string[] {
  const tr = lang === "tr";
  const satirlar: string[] = [];

  if (n.additions && n.additions.people.length) {
    const adlar = n.additions.people.map((p) => p.name).join(", ");
    satirlar.push(
      tr
        ? `🌱 Ağaca ${n.additions.count} kişi eklendi: ${adlar}`
        : `🌱 ${n.additions.count} people added to the tree: ${adlar}`
    );
  }

  for (const e of n.events) {
    const ne =
      e.kind === "dogum" ? (tr ? "doğdu" : "was born")
      : e.kind === "olum" ? (tr ? "vefat etti" : "passed away")
      : (e.title || e.type || (tr ? "olay" : "event"));
    satirlar.push(`📅 ${e.name} — ${ne} (${e.date})`);
  }

  for (const a of n.anniversaries) {
    satirlar.push(
      a.event === "dogum"
        ? (tr ? `🎗️ ${a.name} — doğumunun ${a.years}. yılı` : `🎗️ ${a.name} — ${a.years} years since birth`)
        : (tr ? `🎗️ ${a.name} — vefatının ${a.years}. yılı` : `🎗️ ${a.name} — ${a.years} years since passing`)
    );
  }

  for (const y of n.upcoming) {
    const yas = y.years !== null ? ` (${y.years})` : "";
    const es = y.spouseName ? ` & ${y.spouseName}` : "";
    satirlar.push(`⏳ ${y.name}${es} — ${y.date}${yas}`);
  }

  satirlar.push(
    tr
      ? `🌳 Ağaçta ${n.growth.totalPeople} kişi, ${n.growth.generations} kuşak.`
      : `🌳 ${n.growth.totalPeople} people across ${n.growth.generations} generations.`
  );

  return satirlar;
}
