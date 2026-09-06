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
import type { Association, Person } from "../types/family.ts";

/* ── Sınırlar ─────────────────────────────────────────────────────────────── */

/** Bir ağaçta saklanan öneri sayısı. Aşılırsa EN ESKİ KARARA BAĞLANMIŞ olan düşer. */
export const MAX_PROPOSALS = 300;
/** Tek bir öneride değiştirilebilecek alan sayısı. */
export const MAX_CHANGES = 30;
/** Öneriye eklenen açıklama. */
export const MAX_NOTE = 1000;
/** Tek bir alan değerinin metin uzunluğu. */
export const MAX_VALUE = 4000;

/**
 * Önerinin durumu.
 *
 * "geri-cekildi" ÖNERENİN kendi kararı — reddedilmekten ayrı tutuluyor.
 * Aynı kovaya konsaydı, kişi kendi vazgeçtiği öneriyi kuyrukta "reddedildi"
 * diye görürdü: kimsenin vermediği bir kararı birine mal etmek.
 */
export type ProposalStatus = "bekliyor" | "onaylandi" | "reddedildi" | "geri-cekildi";

/**
 * ONAYIN GERİ ALINABİLMESİ İÇİN gereken kayıt (madde 35/F).
 *
 * Onay ağacı değiştiriyor ve "beğenmedim" demenin yolu yoktu. Geri alma,
 * yapılanın TERSİNİ uygulamak demek ve iki tür bunu önerinin kendisinden
 * çıkaramıyor:
 *
 * · "ekleme" — oluşan kaydın kimliği önerinin içinde YOK, onay anında
 *   üretiliyor. Kimlik saklanmazsa hangi kaydın geri alınacağı bilinemez.
 * · "silme"  — silinen kayıt gitti. Tam hâli ve KOPARILAN BAĞLAR
 *   saklanmazsa geri alma, kaydı bağsız bir yetim olarak geri getirirdi:
 *   çocukları artık onu ebeveyn olarak listelemiyor ve bu, kaydın kendi
 *   `parentIds`inden türetilemez.
 *
 * "alan" türünde kayda gerek yok: `changes` zaten `{from, to}` çiftleri
 * taşıyor, geri alma ikisini yer değiştirmek.
 */
export interface RemovedRef {
  /** Bağı koparılan kaydın kimliği. */
  id: string;
  parent?: boolean;
  spouse?: boolean;
  former?: boolean;
  /** Çevre bağı — kendi kimliği ve türüyle, aynen geri konabilsin. */
  assoc?: Association;
}

export interface UndoRecord {
  /** "ekleme" onayında oluşan kaydın kimliği. */
  createdId?: string;
  /** "silme" onayında silinen kaydın tam hâli. */
  person?: Person;
  /** "silme" onayında bağı koparılan kayıtlar. */
  refs?: RemovedRef[];
}

/** Tek bir alan değişikliği: neydi, ne olsun. */
export interface Change {
  /** Önerinin yazıldığı andaki değer — bayatlık denetiminin dayanağı. */
  from: unknown;
  to: unknown;
}

/**
 * Önerinin TÜRÜ (madde 35, ikinci tur).
 *
 * İlk sürümde tek tür vardı — var olan bir kaydın alanlarını değiştirmek — ve
 * bu, rolün yapabildiklerini sessizce sınırlıyordu: yeni kişi eklemek ve
 * kayıt silmek öneri kuyruğundan geçemiyor, o yüzden ancak DOĞRUDAN yazma
 * yetkisiyle yapılabiliyordu. Rolleri daraltmanın ön koşulu bu boşluğu
 * kapatmak: yetkisi olmayan biri her şeyi ÖNEREBİLMELİ, yoksa daraltma bir
 * yeteneği yok etmiş olur.
 *
 * Alan YOKSA "alan" sayılıyor — bu tür eklenmeden önce yazılmış öneriler
 * için. Eski kayıtları göç ettirmeden okunur tutuyor.
 */
export type ProposalKind =
  /** Var olan kaydın alanlarını değiştir. */
  | "alan"
  /** Yeni kişi ekle. */
  | "ekleme"
  /** Var olan kaydı sil. */
  | "silme";

/** Yeni kişi önerisinde, kişinin hangi kayda bağlanacağı. */
export interface ProposedRelation {
  type: "parent" | "child" | "spouse" | "sibling" | "associate";
  targetId: string;
  assocType?: string;
}

export interface Proposal {
  id: string;
  /** Tür. Yokluğu "alan" demek (eski kayıtlar). */
  kind?: ProposalKind;
  /**
   * Hangi kayıt için. "ekleme" türünde BOŞ — kayıt henüz yok.
   */
  personId: string;
  /**
   * Kişinin adı, ÖNERİ ANINDAKİ hâliyle.
   *
   * Kayıttan okunabilirdi ama kişi silinirse öneri "kim için?" sorusuna
   * yanıtsız kalırdı. Görüntü içindir; karar hep `personId` üstünden verilir.
   */
  personName: string;
  changes: Record<string, Change>;
  /**
   * "ekleme" türünde önerilen kişinin alanları (kayıt defterine göre
   * süzülmüş). `changes` bu türde boş kalıyor: ortada karşılaştırılacak bir
   * "önceki değer" yok, dolayısıyla bayatlık denetiminin de anlamı yok.
   */
  person?: Record<string, unknown>;
  /** "ekleme" türünde kişinin bağlanacağı kayıt. */
  relation?: ProposedRelation;
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
  /**
   * Onayın nasıl geri alınacağı. YALNIZ "onaylandi" durumunda dolu; geri
   * alındığında siliniyor, çünkü artık uygulanmış bir şey yok.
   */
  undo?: UndoRecord;
  /** Onayın geri alındığı an — kart bunu "bir kez onaylanmıştı" diye gösteriyor. */
  undoneAt?: string;
  undoneByName?: string;
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

/**
 * "ekleme" önerisinin gövdesini kurar.
 *
 * Alanlar kayıt defterine göre SÜZÜLÜYOR — `buildChanges` ile aynı gerekçe:
 * defter dışı bir anahtar (`addedBy`, `code`, ilişki grafiği) onay anında
 * doğrudan kayda yazılırdı ve öneri akışı, kapatmaya çalıştığımız yetki
 * kapısının etrafından dolanmanın yolu olurdu.
 *
 * Ad ZORUNLU değil ama boş öneri de kabul edilmiyor: adsız ve alansız bir
 * "kişi ekle" önerisi, karar verecek kişiye hakkında hiçbir şey söylemez.
 */
export function buildNewPerson(
  istek: Record<string, unknown>
): { ok: true; person: Record<string, unknown> } | { ok: false; fail: BuildFail } {
  const izinli = proposableKeys();
  const person: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(istek)) {
    if (!izinli.has(k)) return { ok: false, fail: "alan-yok" };
    if (typeof v === "string" && v.trim().length > MAX_VALUE) return { ok: false, fail: "cok-uzun" };
    if (bosMu(v)) continue;
    person[k] = normalizeValue(v);
  }
  const sayi = Object.keys(person).length;
  if (sayi === 0) return { ok: false, fail: "degisiklik-yok" };
  if (sayi > MAX_CHANGES) return { ok: false, fail: "cok-alan" };
  return { ok: true, person };
}

/**
 * Önerinin türü — alan yoksa "alan".
 *
 * Tek yerden okunuyor ki her çağıran `p.kind ?? "alan"` yazmak zorunda
 * kalmasın; unutulan bir yer eski kayıtları görünmez kılardı.
 */
export function kindOf(p: Pick<Proposal, "kind">): ProposalKind {
  return p.kind ?? "alan";
}

/**
 * Öneri kendi türüne göre TUTARLI mı?
 *
 * Depoya girmeden önce sorulmalı: türü "ekleme" olup `personId` taşıyan ya da
 * türü "silme" olup `changes` taşıyan bir kayıt, onay anında hangi kod
 * yolunun çalışacağını belirsiz kılar. Belirsizliği yazma anında kesmek,
 * onay anında keşfetmekten ucuz.
 */
export function isCoherent(p: Proposal): boolean {
  switch (kindOf(p)) {
    case "ekleme":
      return !p.personId && !!p.person && Object.keys(p.person).length > 0
        && Object.keys(p.changes ?? {}).length === 0;
    case "silme":
      return !!p.personId && !p.person && Object.keys(p.changes ?? {}).length === 0;
    case "alan":
      return !!p.personId && !p.person && Object.keys(p.changes ?? {}).length > 0;
  }
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

export type WithdrawFail = "karar-verilmis" | "sahibi-degil";

/**
 * Öneriyi ÖNERENİ geri çeker.
 *
 * Ayrı bir işlev, çünkü `decide` ile iki ayrı yetki: karara `canEdit`
 * gerekiyor, geri çekmeye ise önerinin SAHİBİ olmak — yöneticinin bile
 * başkasının önerisini geri çekmesi yok, onun aracı ret. Tek işleve
 * sığdırılsaydı, "kim yapabilir" sorusunun yanıtı çağıranın verdiği bir
 * bayrağa kalırdı; unutulan tek çağrı yetki kapısını açardı.
 *
 * Yalnız "bekliyor" geri çekilebilir: karara bağlanmış (belki de ağaca
 * uygulanmış) bir öneriyi geri çekmek, olmuş bir değişikliği olmamış
 * göstermek olurdu. Uygulanan bir onayı geri almak ayrı bir iş.
 *
 * Damga alanları (`decidedBy`/`decidedAt`) yeniden kullanılıyor: bunlar
 * "bu öneriyi sonlandıran kim, ne zaman" demek ve geri çekmede o kişi
 * önerenin kendisi. Durum ikisini zaten ayırıyor.
 */
export function withdraw(
  p: Proposal,
  by: string,
  byName: string,
  at: string
): { ok: true; proposal: Proposal } | { ok: false; fail: WithdrawFail } {
  if (p.by !== by) return { ok: false, fail: "sahibi-degil" };
  if (p.status !== "bekliyor") return { ok: false, fail: "karar-verilmis" };
  return {
    ok: true,
    proposal: { ...p, status: "geri-cekildi", decidedBy: by, decidedByName: byName, decidedAt: at },
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

/* ── Geri alma ────────────────────────────────────────────────────────────── */

/**
 * "alan" önerisinin TERSİ: her değişikliğin `from` ve `to`su yer değiştirir.
 *
 * Geri alma böylece `applyProposal`ın kendisiyle yapılıyor — ayrı bir "geri
 * uygula" işlevi yazılsaydı bayatlık denetimi iki yere bölünürdü ve tersinin
 * denetimi unutulurdu. Oysa asıl tehlike orada: kayıt onaydan sonra
 * değiştiyse geri alma, ARADAKİ değişikliği silerdi. Ters öneride `from`
 * artık onaylanan değer (`to`), yani denetim "kayıt hâlâ onaylandığı gibi
 * mi?" sorusuna dönüşüyor — tam olarak sorulması gereken soru.
 */
export function invert(p: Proposal): Proposal {
  const changes: Record<string, Change> = {};
  for (const [k, c] of Object.entries(p.changes)) changes[k] = { from: c.to, to: c.from };
  return { ...p, changes };
}

/**
 * Onayı geri alınan öneriyi KUYRUĞA döndürür.
 *
 * Yeni bir "geri alındı" durumu eklenmedi: geri alma "bu değişikliği
 * istemiyorum" demek ve bunun doğru yeri kuyruk — yönetici öneriyi orada
 * usulünce reddedebilir, ya da fikir değiştirip tekrar onaylayabilir.
 * Terminal bir durum olsaydı, öneri ne uygulanmış ne de karara bağlanmış
 * bir arafta kalırdı.
 *
 * `undoneAt` kalıyor: kart "bir kez onaylanıp geri alındı" diyebilsin.
 * `undo` kaydı SİLİNİYOR — artık uygulanmış bir şey yok, duran bir kayıt
 * ikinci bir geri almayı mümkün kılardı.
 */
export function markUndone(p: Proposal, at: string, byName = ""): Proposal {
  const out: Proposal = {
    ...p,
    status: "bekliyor",
    undoneAt: at,
    ...(byName ? { undoneByName: byName } : {}),
  };
  delete out.undo;
  delete out.decidedBy;
  delete out.decidedByName;
  delete out.decidedAt;
  delete out.decisionNote;
  return out;
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
