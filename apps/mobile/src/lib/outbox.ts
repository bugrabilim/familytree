/**
 * ÇEVRİMDIŞI YAKALAMA KUYRUĞU — SAF MANTIK (yol haritası madde 44).
 *
 * Kullanıcı mezarlıkta, köyde, uçakta. İnternet yok. Bir kişi ekliyor, bir
 * tarihi düzeltiyor, bir hikâye yazıyor. Bugün istek düşüyor ve yazdığı
 * kayboluyor — form kapanıyor, metin gidiyor. Bu dosya yazma NİYETİNİ
 * cihazda sıraya alan, bağlantı gelince gönderen ve çakışmayı çözen mantık.
 *
 * Saf ve BAĞIMLILIKSIZ: React yok, SecureStore yok, `fetch` yok. Tek içe
 * aktarımı bir TİP (`--experimental-strip-types` onu siliyor), böylece kök
 * test paketinden koşuyor (`tests/outbox.test.mts`) — `src/lib/privacy.ts`
 * ile aynı desen ve aynı gerekçe: `apps/mobile` kök tsconfig/eslint dışında,
 * yani buradaki bir gerileme başka hiçbir yerde yakalanmaz.
 *
 * G/Ç ve arayüz `src/lib/outbox-store.tsx`te.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  ÇAKIŞMA: TASARIMIN MERKEZİ
 * ════════════════════════════════════════════════════════════════════════
 *
 * Sunucu iyimser kilit kullanıyor: yazma isteği `x-base-version` taşıyor ve
 * damga sunucudakinden farklıysa 409 dönüyor (`lib/blob.ts` →
 * `versionMismatch`). Damga AĞACIN TAMAMININ damgası: ağacın herhangi bir
 * yerindeki herhangi bir değişiklik onu değiştiriyor.
 *
 * Bu, çevrimdışı kuyrukla doğrudan çatışıyor. Naif tasarım — "yakalama
 * anındaki damgayı sakla, saatler sonra onunla gönder" — HER öğede 409
 * demek: kullanıcı köyden döndüğünde 12 yazması var ve 12'si de "çakıştı"
 * diyor, üstelik çoğu hiç ilgisiz kişilere ait. Kullanıcı hepsine "benimkini
 * uygula" basmayı öğrenir; o noktada çakışma denetimi bir tıkla geçilen bir
 * gürültü olur ve KORUMA ORTADAN KALKAR.
 *
 * Öbür naif uç — başlığı hiç göndermemek — daha beter: sunucu başlık yokken
 * denetimi HİÇ yapmıyor, yani sessiz üzerine yazma. Kabul edilemez.
 *
 * ## Seçilen tasarım: alan düzeyinde üç yönlü birleştirme
 *
 * Yakalama anında kaydın SADECE DEĞİŞEN alanları saklanıyor ve her alan için
 * iki değer birlikte: kullanıcının yazdığı (`alanlar`) ve o an ekranda olan
 * TABAN değer (`taban`). Gönderim anında taze veri çekiliyor ve her alan tek
 * tek soruluyor:
 *
 *   · sunucudaki === taban  → kimse dokunmamış, temiz uygula;
 *   · sunucudaki === benim  → başkası aynı düzeltmeyi yapmış, alanı ATLA;
 *   · üçü de farklı         → GERÇEK çakışma, kullanıcıya sor.
 *
 * Bu, sunucudaki öneri onayının (`lib/proposals.ts` → `applyProposal`) birebir
 * aynı kuralı: her değişiklik `{from, to}` çifti olarak duruyor ve onay
 * anında `from` bayatsa reddediliyor. Yani depoda zaten kanıtlanmış bir
 * kalıbı tekrar ediyoruz, yeni bir şey uydurmuyoruz.
 *
 * Kazanç: "aradan başkası geçti" ile "aradan başkası geçti VE TAM BENİM
 * DÜZELTTİĞİM ALANI değiştirdi" ayrışıyor. Kullanıcıya yalnız ikincisi
 * soruluyor, o yüzden sorulduğunda gerçekten bakmaya değer.
 *
 * ## Sunucunun kilidi yine de gönderiliyor
 *
 * `x-base-version` DÜŞÜRÜLMÜYOR: gönderim anında çekilen TAZE damga
 * gönderiliyor. Böylece bizim okumamızla yazmamız arasındaki dar pencere —
 * kilidin gerçekten tasarlandığı şey — hâlâ korunuyor. Uzun çevrimdışı
 * boşluğu istemcide üç yönlü birleştirme, dar yarışı sunucuda iyimser kilit
 * çözüyor. İkisi birbirinin yerine geçmiyor.
 *
 * Yine de 409 gelirse (tam o anda başkası yazdı) öğe düşmüyor: kısa bir
 * gecikmeyle yeniden sıraya giriyor ve tur baştan başlıyor — taze veriyle
 * birleştirme yeniden çalışıyor. Sonsuz dönmesin diye sayaçlı: `MAKS_409`
 * turdan sonra kullanıcıya soruluyor.
 *
 * ## Kullanıcının kararı ne yapıyor
 *
 * "benimkini uygula" → öğe `zorla` işaretiyle sıraya dönüyor: birleştirme
 * denetimi ATLANIYOR, alanlar taze damgayla yazılıyor. "sunucudakini tut" →
 * öğe kuyruktan düşüyor. Üçüncü bir seçenek (alan alan seçim) bilerek YOK:
 * telefon ekranında alan alan birleştirme arayüzü, kullanıcının okumadan
 * onaylayacağı bir şeye dönüşür; kayıt bazında karar hem anlaşılır hem
 * geri alınabilir (öbür sürüm ekranda yazılı duruyor).
 */

import type { Person } from "./types";

/* ── Sınırlar ─────────────────────────────────────────────────────────────── */

/**
 * Kuyrukta bekleyebilecek azami yazma sayısı.
 *
 * Sınır aşıldığında EN ESKİSİ DÜŞÜRÜLMÜYOR — yeni yazma reddediliyor ve
 * kullanıcıya söyleniyor. Ters yön (sessizce en eskiyi atmak) tam olarak
 * önlemeye çalıştığımız arızayı üretirdi: kullanıcı yazdığını sanır,
 * yazılmamıştır.
 */
export const MAKS_KUYRUK = 200;

/** Ardışık 409 turu. Aşılırsa karar kullanıcıya bırakılıyor. */
export const MAKS_409 = 3;

/** Geri çekilme tabanı ve tavanı (ms). */
export const GERI_CEKILME_TABAN = 15_000;
export const GERI_CEKILME_TAVAN = 10 * 60_000;

/* ── Tipler ───────────────────────────────────────────────────────────────── */

export type OutboxKind = "ekle" | "guncelle" | "sil";

/**
 * Öğe durumu.
 *
 *  · `bekliyor` — gönderilmeyi bekliyor (çevrimdışı ya da geri çekilmede);
 *  · `cakisti`  — kullanıcı kararı gerekiyor;
 *  · `hata`     — yeniden denemekle düzelmeyecek bir ret (yetki, geçersiz
 *                 gövde, kayıt yok). Kullanıcı görüp atmalı.
 *
 * "gönderildi" diye bir durum YOK: başarılı öğe kuyruktan çıkıyor. Kalıcı
 * bir "bitti" listesi, kuyruğu sonsuz büyüyen bir günlüğe çevirirdi ve
 * SecureStore'da tutulacak yer sınırlı.
 */
export type OutboxDurum = "bekliyor" | "cakisti" | "hata";

/** Çakışmanın türü — arayüzün doğru cümleyi kurabilmesi için. */
export type CakismaSebep =
  /** Aynı alan(lar) aradan geçen biri tarafından değiştirilmiş. */
  | "alan"
  /** Düzenlemek/silmek istediğimiz kayıt artık yok. */
  | "kayit-silinmis"
  /** Silmek istediğimiz kayıt aradan değişmiş (biri bilgi eklemiş olabilir). */
  | "kayit-degismis"
  /** Sürekli 409: taze damgayla bile yazamıyoruz. */
  | "surekli-cakisma";

export interface CakisanAlan {
  alan: string;
  /** Yakalama anında ekranda olan değer. */
  taban: unknown;
  /** Kullanıcının yazdığı. */
  benim: unknown;
  /** Şu an sunucuda duran. */
  sunucu: unknown;
}

export interface OutboxRelation {
  type: string;
  targetId: string;
}

export interface OutboxItem {
  /** Cihaz-yerel kimlik. Sunucu kimliğiyle karıştırılmamalı. */
  id: string;
  /**
   * YAZMAYI KİM YAKALADI (`user.id`) ve HANGİ AĞAÇTA (`x-tree-id`, `null` =
   * ana ağaç).
   *
   * İkisi de şart. Kuyruk cihazda duruyor, oturum ise değişebiliyor: aynı
   * telefonda başka bir hesap açıldığında onun adına yazma göndermek, ya da
   * kurucu ağaç değiştirdiğinde bir ağacın düzeltmesini ÖBÜR ağaca yazmak
   * — ikisi de sessiz veri bozulması. Gönderim bu ikiliyle SÜZÜLÜYOR
   * (`kuyrukSuz`); eşleşmeyen öğe silinmiyor, sırasını bekliyor.
   */
  hesap: string;
  treeId: string | null;
  kind: OutboxKind;
  /** `guncelle`/`sil` için sunucudaki kayıt kimliği. */
  personId?: string;
  /** Kuyruk ekranında gösterilecek ad ("Ayşe Yılmaz"). */
  etiket: string;
  /**
   * Gönderilecek alanlar.
   *  · `ekle`     → kaydın tamamı;
   *  · `guncelle` → YALNIZ değişen alanlar (üç yönlü birleştirmenin şartı);
   *  · `sil`      → boş.
   */
  alanlar: Record<string, unknown>;
  /**
   * Yakalama anındaki değerler — birleştirmenin TABANI.
   *  · `guncelle` → `alanlar` ile aynı anahtarlar, eski değerleriyle;
   *  · `sil`      → kaydın yakalama anındaki tam kopyası;
   *  · `ekle`     → boş (yeni kaydın tabanı yok).
   */
  taban: Record<string, unknown>;
  relation?: OutboxRelation;
  /**
   * ÜYENİN YOLU: yazma kişi ucuna değil ÖNERİ ucuna gidecek.
   *
   * Üye (`uye`) kişi uçlarından 403 alıyor; onun yazması `POST
   * /api/family/proposals`a gidiyor. Çevrimdışı yakalama bu yolu da
   * kapsamasaydı üye — yani ağaca en çok bilgi taşıyan taraf — telefonu
   * çeksin çekmesin yazdığını kaybetmeye devam ederdi.
   *
   * Öneri öğesinde İSTEMCİ BİRLEŞTİRMESİ YAPILMIYOR ve damga
   * GÖNDERİLMİYOR: öneri ağacı değiştirmiyor, bir talebi kuyruğa yazıyor ve
   * bayatlık denetimi ONAY anında yapılıyor (`lib/proposals.ts` →
   * `applyProposal`, `{from, to}` çiftleri). Yani sunucuda zaten bu dosyanın
   * yaptığı işin aynısı var; ikinci kez ve daha kötüsünü yapmak yerine
   * öneriyi olduğu gibi iletiyoruz.
   */
  oneri?: boolean;
  /**
   * Yakalama anındaki ağaç damgası. GÖNDERİMDE KULLANILMIYOR (taze damga
   * gönderiliyor); teşhis ve "ne zamanki veriye dayanıyordu" sorusu için.
   */
  yakalananSurum: string | null;
  olusturuldu: number;
  durum: OutboxDurum;
  /** Başarısız gönderim sayısı — geri çekilme bunun üstünden hesaplanıyor. */
  deneme: number;
  /** Ardışık 409 turu. */
  cakismaSayisi: number;
  /** Bu zamandan önce yeniden denenmiyor (ms). */
  sonrakiDeneme: number;
  hata?: string;
  cakisan?: CakisanAlan[];
  cakismaSebep?: CakismaSebep;
  /** Kullanıcı "benimkini uygula" dedi: birleştirme denetimi atlanıyor. */
  zorla?: boolean;
}

/** Kuyruğa yeni öğe koyarken verilen bilgi. */
export interface OutboxGirdi {
  hesap: string;
  treeId: string | null;
  kind: OutboxKind;
  personId?: string;
  etiket: string;
  alanlar: Record<string, unknown>;
  taban: Record<string, unknown>;
  relation?: OutboxRelation;
  oneri?: boolean;
  yakalananSurum: string | null;
}

/* ── Değer denkliği ───────────────────────────────────────────────────────── */

/**
 * Boş sayılan değerler. Sunucudaki `lib/proposals.ts` → `bosMu` ile aynı:
 * `undefined`, `null` ve `""` AYNI şeydir.
 *
 * Bu birleştirme için hayati. Form temizlenen alanı `""` gönderiyor, sunucu
 * ise alanı hiç yazmıyor (`undefined`). İkisi farklı sayılsaydı, hiç kimsenin
 * dokunmadığı boş bir alan her turda "çakıştı" derdi.
 */
export function bosDeger(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === "string" && v.trim() === "");
}

/** İki değer aynı bilgiyi mi taşıyor? */
export function ayniDeger(a: unknown, b: unknown): boolean {
  if (bosDeger(a) && bosDeger(b)) return true;
  if (typeof a === "string" && typeof b === "string") return a.trim() === b.trim();
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Formdaki değerlerle kayıttaki değerleri karşılaştırıp SADECE değişenleri
 * çıkarır.
 *
 * Tüm gövdeyi kuyruğa koymak kolay olurdu ama birleştirmeyi imkânsız
 * kılardı: kullanıcı yalnız mesleği düzeltmişken gövdedeki doğum tarihi de
 * "benim değerim" sayılır ve aradan geçen bir düzeltmeyi ezerdi. Çevrimiçi
 * yolda bu risk yok (damga taze), çevrimdışında ise kural.
 */
export function alanFarki(
  mevcut: Record<string, unknown>,
  yeni: Record<string, unknown>
): { alanlar: Record<string, unknown>; taban: Record<string, unknown> } {
  const alanlar: Record<string, unknown> = {};
  const taban: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(yeni)) {
    const eski = mevcut[k];
    if (ayniDeger(eski, v)) continue;
    alanlar[k] = v;
    /* Taban NORMALLEŞTİRİLİYOR: `undefined` ile `""` arasındaki fark
       saklanmaya değmez ve JSON'a yazılınca zaten kayboluyor. */
    taban[k] = bosDeger(eski) ? "" : eski;
  }
  return { alanlar, taban };
}

/* ── Kuyruk işlemleri (hepsi saf: yeni dizi döndürür) ─────────────────────── */

export function kuyrukDolu(kuyruk: OutboxItem[]): boolean {
  return kuyruk.length >= MAKS_KUYRUK;
}

/** Yeni yazma niyetini kuyruğun SONUNA koyar. */
export function kuyrugaAl(
  kuyruk: OutboxItem[],
  girdi: OutboxGirdi,
  now: number,
  id: string
): OutboxItem[] {
  const item: OutboxItem = {
    id,
    hesap: girdi.hesap,
    treeId: girdi.treeId,
    kind: girdi.kind,
    personId: girdi.personId,
    etiket: girdi.etiket,
    alanlar: girdi.alanlar,
    taban: girdi.taban,
    relation: girdi.relation,
    oneri: girdi.oneri,
    yakalananSurum: girdi.yakalananSurum,
    olusturuldu: now,
    durum: "bekliyor",
    deneme: 0,
    cakismaSayisi: 0,
    sonrakiDeneme: now,
  };
  return [...kuyruk, item];
}

/**
 * Kuyruğun BU hesaba ve BU ağaca ait dilimi.
 *
 * Süzgeç, sıralamayı da doğru kılıyor: iki ayrı ağacın yazmaları birbirini
 * ENGELLEMEMELİ. A ağacındaki bir çakışma çözülmeyi beklerken B ağacındaki
 * düzeltmelerin de takılı kalması, kullanıcının anlamlandıramayacağı bir
 * kilitlenme olurdu.
 */
export function kuyrukSuz(
  kuyruk: OutboxItem[],
  hesap: string,
  treeId: string | null
): OutboxItem[] {
  return kuyruk.filter((it) => it.hesap === hesap && (it.treeId ?? null) === (treeId ?? null));
}

/**
 * Sıradaki gönderilecek öğe.
 *
 * ## Neden ilk engel BÜTÜN kuyruğu durduruyor
 *
 * Kuyruk bir çanta değil, bir GÜNLÜK: öğeler birbirine bağlı. "Dedeyi ekle",
 * sonra "dedenin doğum yılını düzelt", sonra "dedeyi babaya bağla". İlk öğe
 * çakışmada beklerken ikincisini göndermek, henüz var olmayan bir kaydı
 * düzeltmeye çalışmak (404) ya da daha kötüsü yanlış kayda yazmak olurdu.
 *
 * Bu yüzden ilk `bekliyor` olmayan öğe arkasındaki her şeyi tutuyor.
 * Kullanıcı çakışmayı çözünce kuyruk kendiliğinden akmaya devam ediyor.
 */
export function sonraki(kuyruk: OutboxItem[], now: number): OutboxItem | null {
  for (const it of kuyruk) {
    if (it.durum !== "bekliyor") return null;
    if (it.sonrakiDeneme > now) return null;
    return it;
  }
  return null;
}

/** Kuyruktan çıkar — başarıyla gönderilen ya da kullanıcının attığı öğe. */
export function cikar(kuyruk: OutboxItem[], id: string): OutboxItem[] {
  return kuyruk.filter((it) => it.id !== id);
}

function guncelleItem(
  kuyruk: OutboxItem[],
  id: string,
  yama: (it: OutboxItem) => OutboxItem
): OutboxItem[] {
  return kuyruk.map((it) => (it.id === id ? yama(it) : it));
}

/**
 * Üstel geri çekilme.
 *
 * Çevrimdışıyken denemek bedava değil (radyo, pil). Ama tavan var: kullanıcı
 * uçaktan indiğinde saatlerce bekleyen bir kuyruk istemiyoruz. Ayrıca
 * gönderim öne alınan olaylarla da tetikleniyor (uygulama öne geldi, elle
 * "şimdi gönder"), yani geri çekilme yalnız kendi kendine denemenin hızını
 * sınırlıyor.
 */
export function geriCekilme(deneme: number): number {
  const ms = GERI_CEKILME_TABAN * Math.pow(2, Math.max(0, deneme - 1));
  return Math.min(ms, GERI_CEKILME_TAVAN);
}

/**
 * Başarısız gönderimi işler.
 *
 * ## Durum kodu → karar
 *
 *  · `0` (ağ yok), `5xx`, `429` → GEÇİCİ. Öğe `bekliyor` kalıyor, geri
 *    çekilme uzuyor. Deneme sayısına ÜST SINIR YOK: çevrimdışılık günlerce
 *    sürebilir ve "çok denedik, attık" demek kullanıcının yazdığını çöpe
 *    atmak olurdu.
 *  · `409` → dar yarış. Kısa gecikmeyle yeniden sıraya; tur baştan başlayıp
 *    taze veriyle birleştirme yeniden koşuyor. `MAKS_409` turdan sonra
 *    kullanıcıya soruluyor (`surekli-cakisma`).
 *  · `401` → OTURUM. Kuyruğa DOKUNULMUYOR ve çağıran da öyle yapmalı:
 *    jetonun düşmesi kullanıcının yazdığını geçersiz kılmaz; tekrar giriş
 *    yapınca kuyruk olduğu gibi akmalı. Bu yüzden burada geçici muamelesi
 *    görüyor.
 *  · öbür `4xx` (400/403/404/413…) → KALICI. Yeniden denemek aynı cevabı
 *    verir; öğe `hata`ya geçiyor ve kullanıcı görüyor.
 */
export function hataUygula(
  kuyruk: OutboxItem[],
  id: string,
  status: number,
  mesaj: string,
  now: number
): OutboxItem[] {
  return guncelleItem(kuyruk, id, (it) => {
    if (status === 409) {
      const sayi = it.cakismaSayisi + 1;
      if (sayi > MAKS_409)
        return {
          ...it,
          cakismaSayisi: sayi,
          durum: "cakisti",
          cakismaSebep: "surekli-cakisma",
          cakisan: [],
          hata: mesaj,
        };
      /* Kısa gecikme: hemen tekrar denemek aynı yarışa girmek olurdu. */
      return { ...it, cakismaSayisi: sayi, sonrakiDeneme: now + 1_000, hata: mesaj };
    }
    const gecici = status === 0 || status === 401 || status === 429 || status >= 500;
    if (gecici) {
      const deneme = it.deneme + 1;
      return { ...it, deneme, sonrakiDeneme: now + geriCekilme(deneme), hata: mesaj };
    }
    return { ...it, durum: "hata", hata: mesaj };
  });
}

/** Birleştirme "kullanıcıya sor" dedi. */
export function cakismaUygula(
  kuyruk: OutboxItem[],
  id: string,
  sebep: CakismaSebep,
  alanlar: CakisanAlan[]
): OutboxItem[] {
  return guncelleItem(kuyruk, id, (it) => ({
    ...it,
    durum: "cakisti",
    cakismaSebep: sebep,
    cakisan: alanlar,
  }));
}

export type Cozum = "benim" | "sunucu";

/**
 * Kullanıcının çakışma kararını uygular.
 *
 * `"benim"` → öğe `zorla` ile sıraya dönüyor: birleştirme denetimi atlanıyor
 * ama `x-base-version` YİNE gönderiliyor (taze damgayla), yani sunucunun
 * kilidi devrede kalıyor. `"sunucu"` → öğe düşüyor; kullanıcı kendi
 * yazdığından bilerek vazgeçti.
 */
export function cozumUygula(
  kuyruk: OutboxItem[],
  id: string,
  cozum: Cozum,
  now: number
): OutboxItem[] {
  if (cozum === "sunucu") return cikar(kuyruk, id);
  return guncelleItem(kuyruk, id, (it) => ({
    ...it,
    durum: "bekliyor",
    zorla: true,
    cakisan: undefined,
    cakismaSebep: undefined,
    cakismaSayisi: 0,
    deneme: 0,
    sonrakiDeneme: now,
    hata: undefined,
  }));
}

/* ── Üç yönlü birleştirme ─────────────────────────────────────────────────── */

export type Karar =
  /** Gönder — gövde bu (`sil` için boş nesne). */
  | { tur: "gonder"; gonderilecek: Record<string, unknown> }
  /** Gönderme, kuyruktan düş: niyet zaten gerçekleşmiş. */
  | { tur: "atla"; sebep: "zaten-uygulanmis" | "kayit-yok" }
  /** Kullanıcıya sor. */
  | { tur: "cakisma"; sebep: CakismaSebep; alanlar: CakisanAlan[] };

/**
 * Öğeyi sunucunun ŞU ANKİ hâliyle karşılaştırır ve ne yapılacağına karar
 * verir. Dosyanın başındaki kuralın gövdesi burası.
 *
 * `sunucudaki` `undefined` ise kayıt sunucuda YOK (silinmiş ya da hiç
 * olmamış).
 */
export function birlestir(item: OutboxItem, sunucudaki: Person | undefined): Karar {
  /*
   * ÖNERİ: burada birleştirme YOK. Öneri ağacı değiştirmiyor, bir talebi
   * kuyruğa yazıyor; bayatlık denetimi onay anında sunucuda yapılıyor
   * (`applyProposal`). Burada ikinci bir denetim kurmak, aynı kuralı iki
   * yerde ve ayrışmaya açık biçimde yazmak olurdu.
   */
  if (item.oneri) return { tur: "gonder", gonderilecek: item.alanlar };

  if (item.kind === "ekle") {
    /*
     * YENİ KAYIT ÇAKIŞAMAZ: karşılaştırılacak bir taban yok. Bağlanacağı
     * kişi aradan silinmişse sunucu 400/404 dönüyor ve öğe `hata`ya düşüyor
     * — bunu burada tahmin etmeye çalışmak, sunucunun kuralını ikinci kez
     * ve eksik yazmak olurdu.
     */
    return { tur: "gonder", gonderilecek: item.alanlar };
  }

  if (item.kind === "sil") {
    /*
     * Kayıt zaten yoksa niyet GERÇEKLEŞMİŞ. "Bulunamadı" hatası göstermek,
     * kullanıcıya istediği olmuşken bir sorun varmış gibi davranmak olurdu.
     */
    if (!sunucudaki) return { tur: "atla", sebep: "kayit-yok" };
    if (item.zorla) return { tur: "gonder", gonderilecek: {} };
    /*
     * SİLME, KAYDIN TAMAMINA BAKARAK. Silme geri alınamaz; aradan biri
     * fotoğraf eklemiş, hikâyeyi yazmış olabilir. O emeği sessizce yok
     * etmek, tam olarak önlemeye çalıştığımız şey.
     */
    const degisen = degisenAlanlar(item.taban, sunucudaki);
    if (degisen.length)
      return { tur: "cakisma", sebep: "kayit-degismis", alanlar: degisen };
    return { tur: "gonder", gonderilecek: {} };
  }

  /* ── guncelle ── */
  if (!sunucudaki) {
    /*
     * Düzelttiğimiz kayıt aradan SİLİNMİŞ. Sessizce atmak kullanıcının
     * yazdığını yok etmek, körü körüne göndermek ise 404. Karar insanın:
     * "benimkini uygula" derse yeniden ekleme değil, yine bir güncelleme
     * denemesi olur ve sunucu 404 der — bu dürüst, çünkü kaydı geri
     * getirmeye karar vermek kullanıcının bilerek yapacağı ayrı bir iş.
     */
    return {
      tur: "cakisma",
      sebep: "kayit-silinmis",
      alanlar: Object.keys(item.alanlar).map((alan) => ({
        alan,
        taban: item.taban[alan],
        benim: item.alanlar[alan],
        sunucu: undefined,
      })),
    };
  }

  if (item.zorla) return { tur: "gonder", gonderilecek: item.alanlar };

  const kayit = sunucudaki as unknown as Record<string, unknown>;
  const gonderilecek: Record<string, unknown> = {};
  const cakisan: CakisanAlan[] = [];
  for (const [alan, benim] of Object.entries(item.alanlar)) {
    const sunucu = kayit[alan];
    const taban = item.taban[alan];
    /* Kimse dokunmamış → temiz uygula. */
    if (ayniDeger(sunucu, taban)) {
      gonderilecek[alan] = benim;
      continue;
    }
    /*
     * ZATEN UYGULANMIŞ → çakışma DEĞİL. Başkası aynı düzeltmeyi yapmış
     * (aynı mezar taşına bakan iki kuzen). Alanı yeniden yazmak zararsız
     * ama gereksiz; asıl mesele bunu "çakışma" diye sormanın kullanıcıya
     * anlamsız görünmesi. Aynı ayrım sunucuda da var (`applyProposal`).
     */
    if (ayniDeger(sunucu, benim)) continue;
    cakisan.push({ alan, taban, benim, sunucu });
  }

  if (cakisan.length) return { tur: "cakisma", sebep: "alan", alanlar: cakisan };
  if (Object.keys(gonderilecek).length === 0)
    return { tur: "atla", sebep: "zaten-uygulanmis" };
  return { tur: "gonder", gonderilecek };
}

/** Silme öncesi: yakalama anındaki kopyayla sunucudaki kayıt nerede ayrıştı? */
function degisenAlanlar(taban: Record<string, unknown>, sunucudaki: Person): CakisanAlan[] {
  const kayit = sunucudaki as unknown as Record<string, unknown>;
  const out: CakisanAlan[] = [];
  const anahtarlar = new Set([...Object.keys(taban), ...Object.keys(kayit)]);
  for (const alan of anahtarlar) {
    /*
     * Sunucunun kendi ürettiği alanlar dışarıda: bunlar kullanıcı
     * düzenlemesi değil ve her kayıtta "değişmiş" görünürdü.
     */
    if (alan === "updatedAt" || alan === "addedBy" || alan === "code") continue;
    if (ayniDeger(taban[alan], kayit[alan])) continue;
    out.push({ alan, taban: taban[alan], benim: undefined, sunucu: kayit[alan] });
  }
  return out;
}

/* ── Sayaçlar (arayüz rozetleri) ──────────────────────────────────────────── */

export function bekleyenSayisi(kuyruk: OutboxItem[]): number {
  return kuyruk.filter((it) => it.durum === "bekliyor").length;
}

export function cakisanSayisi(kuyruk: OutboxItem[]): number {
  return kuyruk.filter((it) => it.durum === "cakisti").length;
}

export function hataliSayisi(kuyruk: OutboxItem[]): number {
  return kuyruk.filter((it) => it.durum === "hata").length;
}

/** Bu kişi için kuyrukta bekleyen bir yazma var mı? (profilde rozet) */
export function kisiBekliyorMu(kuyruk: OutboxItem[], personId: string): boolean {
  return kuyruk.some((it) => it.personId === personId);
}

/* ── Kalıcılık ────────────────────────────────────────────────────────────── */

/** Saklanan biçimin sürümü. Biçim değişirse eski kuyruk sessizce atılmasın. */
export const DEPO_SURUM = 1;

export function serialize(kuyruk: OutboxItem[]): string {
  return JSON.stringify({ v: DEPO_SURUM, items: kuyruk });
}

/**
 * Saklanan metni geri okur. BOZUK VERİDE ÇÖKMÜYOR, boş kuyruk dönüyor —
 * açılışta atılan bir istisna uygulamayı hiç açılmaz hâle getirirdi ve
 * kuyruk zaten kurtarılamaz durumda.
 */
export function deserialize(raw: string | null | undefined): OutboxItem[] {
  if (!raw) return [];
  let veri: unknown;
  try {
    veri = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!veri || typeof veri !== "object") return [];
  const kutu = veri as { v?: unknown; items?: unknown };
  if (kutu.v !== DEPO_SURUM) return [];
  if (!Array.isArray(kutu.items)) return [];
  return kutu.items.filter(gecerliItem);
}

function gecerliItem(x: unknown): x is OutboxItem {
  if (!x || typeof x !== "object") return false;
  const it = x as Partial<OutboxItem>;
  return (
    typeof it.id === "string" &&
    typeof it.hesap === "string" &&
    (it.kind === "ekle" || it.kind === "guncelle" || it.kind === "sil") &&
    typeof it.alanlar === "object" &&
    it.alanlar !== null &&
    typeof it.taban === "object" &&
    it.taban !== null &&
    (it.durum === "bekliyor" || it.durum === "cakisti" || it.durum === "hata")
  );
}

/* ── SecureStore parçalama ────────────────────────────────────────────────── */

/**
 * ANDROID'DE BİR DEĞER 2048 BAYTI AŞAMAZ (expo-secure-store).
 *
 * Depoda başka kalıcılık yok — `AsyncStorage` ve `expo-file-system` bağımlılık
 * listesinde değil — ve yeni bağımlılık eklemek bu işin kapsamı dışında. Tek
 * bir uzun hikâye ya da birkaç kayıt bu sınırı rahat aşıyor; sınırı aşan
 * yazma Android'de SESSİZCE düşerdi, yani kuyruk uygulama kapanınca yok
 * olurdu. Tam olarak önlemeye çalıştığımız kayıp.
 *
 * Çözüm: metin baytla ölçülüp parçalara bölünüyor, her parça ayrı anahtara
 * yazılıyor.
 */
export const PARCA_BOYUTU = 1500;

/** UTF-8 bayt uzunluğu — `Buffer`/`TextEncoder` olmadan (React Native). */
export function baytUzunlugu(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      /* Vekil çifti = tek bir kod noktası, 4 bayt. */
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}

/**
 * Metni bayt sınırına göre parçalar.
 *
 * VEKİL ÇİFTİ BÖLÜNMÜYOR: emoji ya da nadir bir harf tam ortasından
 * kesilseydi birleştirmede bozuk karakter çıkardı ve JSON ayrıştırması
 * düşerdi — yani kuyruğun tamamı kaybolurdu.
 */
export function parcala(metin: string, maxBayt: number = PARCA_BOYUTU): string[] {
  const parcalar: string[] = [];
  let bas = 0;
  let bayt = 0;
  for (let i = 0; i < metin.length; ) {
    const c = metin.charCodeAt(i);
    const cift = c >= 0xd800 && c <= 0xdbff && i + 1 < metin.length;
    const boyut = c < 0x80 ? 1 : c < 0x800 ? 2 : cift ? 4 : 3;
    if (bayt + boyut > maxBayt && i > bas) {
      parcalar.push(metin.slice(bas, i));
      bas = i;
      bayt = 0;
    }
    bayt += boyut;
    i += cift ? 2 : 1;
  }
  if (bas < metin.length) parcalar.push(metin.slice(bas));
  return parcalar;
}

/** Parçaları geri birleştirir; eksik parça varsa `null` (kurtarılamaz). */
export function parcalariBirlestir(parcalar: Array<string | null>): string | null {
  if (parcalar.some((p) => p === null || p === undefined)) return null;
  return parcalar.join("");
}
