/**
 * DEĞİŞİKLİK ÖNERİLERİ — saf mantık (madde 35/B).
 *
 * Katkı verici var olan kayda dokunamıyor; onun yolu buradan geçiyor:
 * "şu alan şu olsun" diye bir öneri açıyor, düzenleyici/sahip onaylayınca
 * değişiklik gerçekleşiyor.
 *
 * ## Önerinin DAYANDIĞI değer saklanıyor — en önemli karar
 *
 * Her değişiklik `{ from, to }` çifti olarak duruyor; `from`, önerinin
 * yazıldığı andaki değer. Yalnız `to` saklansaydı şu olurdu: katkı verici
 * "doğum yılı 1943 olsun" diye öneri açar, ertesi gün bir düzenleyici aynı
 * alanı 1945 yapar, üç gün sonra sahip eski öneriyi onaylar ve YENİ bilgi
 * sessizce eskiyle ezilir. Kimse fark etmez, çünkü ekranda "onaylandı"
 * yazar.
 *
 * `applyProposal` bu yüzden önce BAYATLIK sınıyor: kaydın şimdiki değeri
 * `from` ile uyuşmuyorsa onay reddediliyor ve hangi alanların arada
 * değiştiği söyleniyor. Karar insanın.
 *
 * ## Yalnız kayıt defterindeki alanlar
 *
 * Önerilebilir alanlar `lib/person-fields.ts` defterinden geliyor. Serbest
 * bırakılsaydı bir öneri gövdesi `addedBy`, `code` ya da ilişki grafiği
 * (`parentIds`) gibi sunucunun sahip olduğu alanları taşıyabilir, onay anında
 * da doğrudan kayda yazılırdı — yani öneri akışı, kapatmaya çalıştığımız
 * yetki kapısının etrafından dolanmanın yolu olurdu.
 *
 * Saf ve bağımlılıksız — birim testi koşulabilsin.
 */

import { PERSON_FIELDS } from "./person-fields.ts";
import type { Person } from "../types/family.ts";

/* ── Sınırlar ─────────────────────────────────────────────────────────────── */

/** Bir ağaçta saklanan öneri sayısı. Aşılırsa EN ESKİ KARARA BAĞLANMIŞ olan düşer. */
export const MAX_PROPOSALS = 300;
/** Tek bir öneride değiştirilebilecek alan sayısı. */
export const MAX_CHANGES = 30;
/** Öneriye eklenen açıklama. */
export const MAX_NOTE = 1000;
/** Tek bir alan değerinin metin uzunluğu. */
export const MAX_VALUE = 4000;

export type ProposalStatus = "bekliyor" | "onaylandi" | "reddedildi";

/** Tek bir alan değişikliği: neydi, ne olsun. */
export interface Change {
  /** Önerinin yazıldığı andaki değer — bayatlık denetiminin dayanağı. */
  from: unknown;
  to: unknown;
}

export interface Proposal {
  id: string;
  personId: string;
  /**
   * Kişinin adı, ÖNERİ ANINDAKİ hâliyle.
   *
   * Kayıttan okunabilirdi ama kişi silinirse öneri "kim için?" sorusuna
   * yanıtsız kalırdı. Görüntü içindir; karar hep `personId` üstünden verilir.
   */
  personName: string;
  changes: Record<string, Change>;
  note?: string;
  /** Öneriyi yazan (`ctx.authorId`). */
  by: string;
  byName: string;
  at: string;
  status: ProposalStatus;
  decidedBy?: string;
  decidedByName?: string;
  decidedAt?: string;
  /** Reddeden kişinin gerekçesi. */
  decisionNote?: string;
}

/** Önerilebilir alanların anahtar kümesi — kayıt defterinden. */
export function proposableKeys(): Set<string> {
  return new Set(PERSON_FIELDS.map((f) => String(f.key)));
}

/* ── Değer normalleştirme ─────────────────────────────────────────────────── */

/**
 * Alan BOŞ mu? — bu dosyanın en pahalı dersinin karşılığı.
 *
 * Depoda "boş" beş ayrı şekilde duruyor: alan hiç yok (`undefined`), `null`,
 * boş dize, boş dizi, ve `false` (isteğe bağlı bayraklar yokken false
 * demektir). Beşi de AYNI şeyi anlatıyor ama JavaScript'te birbirine eşit
 * değil.
 *
 * İlk sürüm yalnız `undefined`/`null`ı boş sayıyordu ve sonucu şuydu:
 * istemci öneri gövdesinde her zaman `[]`/`false` gönderdiği için, kayıtta o
 * alanlar hiç YOKKEN "değişmiş" sayılıyorlardı. Tek alan değiştiren bir
 * öneri on bir alanlık çıkıyor; daha kötüsü, o kişi için BİR öneri
 * onaylandığı anda kalan bütün öneriler — hiç dokunulmamış on alan gerekçe
 * gösterilerek — kalıcı olarak "bayat" oluyor ve bir daha asla
 * onaylanamıyordu. Özelliğin çekirdek akışı buydu.
 *
 * SAYILAR BOŞ SAYILMIYOR — `0` geçerli bir değer (`siblingOrder: 0` gerçek
 * bir sıra). Boolean'da ise yokluk `false` demek; ikisi farklı davranıyor
 * çünkü veri modeli farklı.
 */
export function bosMu(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (typeof v === "boolean") return v === false;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v as object).length === 0;
  return false;
}

/**
 * Karşılaştırma ve saklama için değeri sadeleştirir.
 *
 * Nesnelerde ANAHTARLAR SIRALANIYOR: karşılaştırma `JSON.stringify` ile
 * yapılıyor ve o, anahtar sırasına duyarlı. Sıralanmasaydı içerikçe aynı iki
 * nesne — örneğin GEDCOM'dan `{id,type,title,date,place}` sırasıyla gelen bir
 * olay ile formun `{id,date,type,title,place}` sırasıyla yeniden kurduğu aynı
 * olay — "değişmiş" görünürdü.
 */
export function normalizeValue(v: unknown): unknown {
  if (v === undefined || v === null) return "";
  if (typeof v === "string") return v.trim().slice(0, MAX_VALUE);
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (Array.isArray(v)) return v.map(normalizeValue);
  if (typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort())
      out[k] = normalizeValue((v as Record<string, unknown>)[k]);
    return out;
  }
  return "";
}

/**
 * İki değer aynı mı?
 *
 * İkisi de boşsa AYNI — biri `undefined`, öbürü `[]` olsa bile. Bu denklik
 * olmadan öneri akışı kendi kendini kilitliyordu (bkz. `bosMu`).
 */
export function sameValue(a: unknown, b: unknown): boolean {
  if (bosMu(a) && bosMu(b)) return true;
  return JSON.stringify(normalizeValue(a)) === JSON.stringify(normalizeValue(b));
}

/**
 * Alana özgü denklikler — kayıt defterinin dışında kalan tek kural.
 *
 * `kind` alanında `"uye"` VARSAYILAN: kişi rotaları gövdeden geleni
 * `body.kind === "cevre" ? "cevre" : undefined` diye çeviriyor, yani
 * `"uye"` ile "alan yok" aynı kayda düşüyor. Öneri yolu bu çeviriyi
 * atlarsa, hiç kimsenin değiştirmediği `kind` her öneride "değişmiş"
 * görünür.
 */
function alanDegeri(key: string, v: unknown): unknown {
  if (key === "kind" && v === "uye") return undefined;
  return v;
}

/* ── Öneri kurma ──────────────────────────────────────────────────────────── */

export type BuildFail = "alan-yok" | "degisiklik-yok" | "cok-alan" | "cok-uzun";

/**
 * İstemciden gelen "şu alanlar şu olsun" isteğinden öneri gövdesi kurar.
 *
 * `from` değerlerini İSTEMCİDEN ALMIYOR, kaydın kendisinden okuyor. İstemci
 * yazabilseydi bayatlık denetimi anlamsızlaşırdı: öneriyi açan taraf `from`u
 * kaydın şimdiki değerine eşitleyip denetimden geçebilirdi.
 */
export function buildChanges(
  person: Person,
  istek: Record<string, unknown>
): { ok: true; changes: Record<string, Change> } | { ok: false; fail: BuildFail } {
  const izinli = proposableKeys();
  const changes: Record<string, Change> = {};

  for (const [k, v] of Object.entries(istek)) {
    // Defterde olmayan alan SESSİZCE atılmıyor: istek reddediliyor ki
    // öneren, yazdığı şeyin kaybolduğunu sanmasın.
    if (!izinli.has(k)) return { ok: false, fail: "alan-yok" };
    const mevcut = alanDegeri(k, (person as unknown as Record<string, unknown>)[k]);
    const yeni = alanDegeri(k, v);
    // Zaten aynıysa değişiklik değil.
    if (sameValue(mevcut, yeni)) continue;
    /*
     * KIRPMA YOK, RET VAR. Eskiden `normalizeValue` uzun metni sessizce
     * kırpıyordu: katkı verici 4500 karakterlik bir biyografi öneriyor,
     * düzenleyici tam metni gördüğünü sanarak onaylıyor ve 500 karakter
     * kayboluyordu — üstelik aynı metni düzenleyici doğrudan kaydetseydi
     * sınır hiç yoktu. Sessiz kayıp yerine gürültülü ret.
     */
    if (typeof yeni === "string" && yeni.trim().length > MAX_VALUE)
      return { ok: false, fail: "cok-uzun" };
    changes[k] = { from: normalizeValue(mevcut), to: normalizeValue(yeni) };
  }

  const sayi = Object.keys(changes).length;
  if (sayi === 0) return { ok: false, fail: "degisiklik-yok" };
  if (sayi > MAX_CHANGES) return { ok: false, fail: "cok-alan" };
  return { ok: true, changes };
}

/* ── Karar ────────────────────────────────────────────────────────────────── */

export type DecideFail = "karar-verilmis" | "gecersiz-karar";

/**
 * Öneriye karar yazar.
 *
 * YALNIZ "bekliyor" durumundaki öneri karara bağlanabilir. İkinci bir karar
 * serbest olsaydı, onaylanmış bir öneri sonradan "reddedildi" gösterilebilir
 * (ya da tersi) ve kayıt, ağaçta gerçekte ne olduğunu anlatmaz hâle gelirdi.
 */
export function decide(
  p: Proposal,
  karar: "onaylandi" | "reddedildi",
  by: string,
  byName: string,
  at: string,
  note = ""
): { ok: true; proposal: Proposal } | { ok: false; fail: DecideFail } {
  if (karar !== "onaylandi" && karar !== "reddedildi") return { ok: false, fail: "gecersiz-karar" };
  if (p.status !== "bekliyor") return { ok: false, fail: "karar-verilmis" };
  return {
    ok: true,
    proposal: {
      ...p,
      status: karar,
      decidedBy: by,
      decidedByName: byName,
      decidedAt: at,
      ...(note.trim() ? { decisionNote: note.trim().slice(0, MAX_NOTE) } : {}),
    },
  };
}

/**
 * Onaylanan öneriyi kayda uygular — ÖNCE bayatlık denetimi.
 *
 * Kaydın şimdiki değeri, önerinin dayandığı `from` ile uyuşmuyorsa alan
 * BAYAT demektir: arada başkası değiştirmiş. Böyle bir öneriyi uygulamak,
 * yeni bilgiyi eskiyle sessizce ezmek olurdu — üstelik ekranda "onaylandı"
 * yazarken.
 */
export function applyProposal(
  person: Person,
  p: Proposal
): { ok: true; person: Person } | { ok: false; stale: string[] } {
  const stale: string[] = [];
  for (const [k, c] of Object.entries(p.changes)) {
    const mevcut = alanDegeri(k, (person as unknown as Record<string, unknown>)[k]);
    if (sameValue(mevcut, c.from)) continue;
    /*
     * ZATEN UYGULANMIŞSA bayat değil.
     *
     * Onay yolu iki adımlı: önce ağaç yazılıyor, sonra öneri damgalanıyor.
     * İkinci adım düşerse değişiklik ağaçta DURUYOR ama öneri "bekliyor"
     * kalıyor. Bu ayrım olmadan o öneri bir daha asla onaylanamazdı —
     * `mevcut` artık `to`ya eşit, `from`a değil — yani kurtarılamaz bir
     * duruma düşerdi.
     */
    if (sameValue(mevcut, c.to)) continue;
    stale.push(k);
  }
  if (stale.length) return { ok: false, stale };

  const out = { ...person } as unknown as Record<string, unknown>;
  for (const [k, c] of Object.entries(p.changes)) {
    /*
     * BOŞ DEĞER ALANI SİLİYOR, `""` YAZMIYOR — kayıt defterinin
     * (`mergeValue`) semantiği bu ve iki yol ayrışamaz.
     *
     * Ayrıştığında sessiz yanlış çıktı üretiyordu: doğum tarihi PUT ile
     * temizlenen kardeş sıralamada en sona düşerken (`a.birthDate ?? "9999"`),
     * ÖNERİ ile temizlenen `""` olduğu için `??` devreye girmiyor ve kardeş
     * en BAŞA düşüyordu. Aynı kalıp defin yeri haritasında da var.
     */
    if (bosMu(c.to)) delete out[k];
    else out[k] = c.to;
  }
  return { ok: true, person: out as unknown as Person };
}

/* ── Liste ────────────────────────────────────────────────────────────────── */

/**
 * Yeni öneriyi listeye ekler; tavan aşılırsa KARARA BAĞLANMIŞ en eski düşer.
 *
 * Düşen kaydın "bekliyor" olmaması şart: bekleyen bir öneriyi tavan yüzünden
 * atmak, birinin yazdığı katkıyı kimse görmeden çöpe atmak olurdu. Bekleyen
 * öneriler tavanı doldurmuşsa yeni öneri REDDEDİLİYOR — gürültülü bir
 * "kuyruk dolu" hatası, sessiz bir kayıptan iyidir.
 */
export function planProposal(
  mevcut: Proposal[],
  yeni: Proposal
): { ok: true; list: Proposal[] } | { ok: false; fail: "kuyruk-dolu" } {
  const liste = [...mevcut, yeni];
  if (liste.length <= MAX_PROPOSALS) return { ok: true, list: liste };

  const dusurulecek = liste.length - MAX_PROPOSALS;
  const kararli = liste.filter((p) => p.status !== "bekliyor");
  if (kararli.length < dusurulecek) return { ok: false, fail: "kuyruk-dolu" };

  const at = new Set(kararli.slice(0, dusurulecek).map((p) => p.id));
  return { ok: true, list: liste.filter((p) => !at.has(p.id)) };
}

/** Bekleyen öneri sayısı — ekrandaki rozet için. */
export function pendingCount(list: Proposal[]): number {
  return list.filter((p) => p.status === "bekliyor").length;
}

/**
 * Rolüne göre görebileceği öneriler.
 *
 * Katkı verici YALNIZ kendi önerilerini görüyor. Hepsini görebilseydi, öneri
 * kuyruğu ağaç üstünde kimin neyi tartıştığını gösteren bir pencereye
 * dönerdi — kayıtların kendisi gizlilik katmanından geçerken önerilerin
 * ham hâlde dolaşması tutarsız olurdu.
 */
export function visibleTo(list: Proposal[], authorId: string, karar: boolean): Proposal[] {
  return karar ? list : list.filter((p) => p.by === authorId);
}
