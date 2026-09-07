import {
  MAKS_409,
  MAKS_KUYRUK,
  GERI_CEKILME_TAVAN,
  alanFarki,
  ayniDeger,
  baytUzunlugu,
  bekleyenSayisi,
  birlestir,
  bosDeger,
  cakisanSayisi,
  cakismaUygula,
  cikar,
  cozumUygula,
  deserialize,
  geriCekilme,
  hataUygula,
  hataliSayisi,
  kisiBekliyorMu,
  kuyrugaAl,
  kuyrukDolu,
  kuyrukSuz,
  parcala,
  parcalariBirlestir,
  serialize,
  sonraki,
  type OutboxGirdi,
  type OutboxItem,
} from "../apps/mobile/src/lib/outbox.ts";
import type { Person } from "../apps/mobile/src/lib/types.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

/**
 * ÇEVRİMDIŞI YAKALAMA + SENKRON (yol haritası madde 44).
 *
 * ## Neden bu test kökteki paketten koşuyor
 *
 * `apps/mobile` kendi araç zincirinde derleniyor ve kök `tsconfig`/eslint
 * dışında (`"apps"` hariç tutulmuş), yani mobil kodun otomatik denetimi yok.
 * `src/lib/outbox.ts` bilerek SAF ve yalnız TİP içe aktarıyor
 * (`--experimental-strip-types` onu siliyor), böylece kuyruğun kararları —
 * özellikle çakışma çözümü — kök testlerinde koşuyor.
 * `tests/mobile-privacy.test.mts` ile aynı desen.
 *
 * ## Sınanan asıl iddia
 *
 * Sunucu iyimser kilidi AĞACIN TAMAMININ damgasına dayanıyor
 * (`lib/blob.ts` → `versionMismatch`), yani saatler sonra gönderilen bir
 * çevrimdışı yazma neredeyse her zaman 409 alır. Kuyruk bu yüzden çakışmayı
 * ALAN DÜZEYİNDE, üç yönlü birleştirmeyle çözüyor: aradan geçen değişiklik
 * BAŞKA bir alandaysa yazma sessizce ve doğru şekilde uygulanıyor; TAM O
 * ALANDAYSA kullanıcıya soruluyor. Aşağıdaki iddiaların çoğu bu ayrımı
 * koruyor.
 */

const KISI = (o: Partial<Person> = {}): Person => ({
  id: "p1", firstName: "Ayşe", lastName: "Yılmaz", gender: "female",
  parentIds: [], spouseIds: [], ...o,
});

const GIRDI = (o: Partial<OutboxGirdi> = {}): OutboxGirdi => ({
  hesap: "u1", treeId: null, kind: "guncelle", personId: "p1", etiket: "Ayşe Yılmaz",
  alanlar: {}, taban: {}, yakalananSurum: "2026-01-01T00:00:00.000Z", ...o,
});

/* ══ 1. Değer denkliği ═══════════════════════════════════════════════════ */
/*
 * Form temizlenen alanı `""` gönderiyor, sunucu ise alanı hiç yazmıyor
 * (`undefined`). İkisi farklı sayılsaydı hiç kimsenin dokunmadığı boş bir
 * alan HER turda "çakıştı" derdi ve kullanıcı uyarıyı okumayı bırakırdı.
 */
check(bosDeger(undefined) && bosDeger(null) && bosDeger("") && bosDeger("   "), "boş değerler");
check(!bosDeger("x") && !bosDeger(0), "dolu değerler boş sayılmıyor");
check(ayniDeger(undefined, ""), "`undefined` ile `\"\"` aynı");
check(ayniDeger(" Ayşe ", "Ayşe"), "kenar boşlukları yok sayılıyor");
check(!ayniDeger("1950", "1951"), "farklı değerler ayrışıyor");
check(ayniDeger(["a"], ["a"]) && !ayniDeger(["a"], ["b"]), "diziler karşılaştırılabiliyor");

/* ══ 2. Fark alma: kuyruğa YALNIZ değişen alanlar giriyor ════════════════ */
{
  /*
   * Tüm gövdeyi kuyruğa koymak kolay olurdu ama birleştirmeyi imkânsız
   * kılardı: kullanıcı yalnız mesleği düzeltmişken gövdedeki doğum tarihi de
   * "benim değerim" sayılır ve aradan geçen bir düzeltmeyi ezerdi.
   */
  const mevcut = KISI({ occupation: "çiftçi", birthDate: "1950" }) as unknown as Record<string, unknown>;
  const yeni = { occupation: "öğretmen", birthDate: "1950", bio: "" };
  const { alanlar, taban } = alanFarki(mevcut, yeni);
  check(Object.keys(alanlar).join() === "occupation", "yalnız değişen alan kuyruğa giriyor");
  check(taban.occupation === "çiftçi", "taban, yakalama anındaki değer");
  check(!("birthDate" in alanlar), "değişmeyen alan DIŞARIDA");
  check(!("bio" in alanlar), "boştan boşa `değişiklik` sayılmıyor");
}
{
  const { taban } = alanFarki({}, { bio: "yeni" });
  check(taban.bio === "", "olmayan alanın tabanı boş dizgeye normalleşiyor");
}

/* ══ 3. Kuyruğa alma ve sıra ════════════════════════════════════════════ */
{
  let k: OutboxItem[] = [];
  k = kuyrugaAl(k, GIRDI({ kind: "ekle", personId: undefined }), 1000, "a");
  k = kuyrugaAl(k, GIRDI({ personId: "p2" }), 1001, "b");
  check(k.length === 2 && k[0].id === "a" && k[1].id === "b", "kuyruk SONA ekliyor (FIFO)");
  check(k[0].durum === "bekliyor" && k[0].deneme === 0, "yeni öğe bekliyor");
  check(k[0].hesap === "u1" && k[0].treeId === null, "hesap ve ağaç öğeye yazılıyor");
  check(sonraki(k, 1000)?.id === "a", "sıradaki EN ESKİ öğe");
  check(bekleyenSayisi(k) === 2, "bekleyen sayısı");
  check(kisiBekliyorMu(k, "p2") && !kisiBekliyorMu(k, "p9"), "kişi için bekleyen var mı");
  check(cikar(k, "a").length === 1, "başarılı öğe kuyruktan düşüyor");
}
{
  /*
   * İLK ENGEL BÜTÜN KUYRUĞU DURDURUYOR. Kuyruk bir çanta değil, bir GÜNLÜK:
   * "dedeyi ekle" çakışmada beklerken "dedenin doğum yılını düzelt"i
   * göndermek, henüz var olmayan bir kaydı düzeltmeye çalışmak olurdu.
   */
  let k = kuyrugaAl([], GIRDI(), 1000, "a");
  k = kuyrugaAl(k, GIRDI({ personId: "p2" }), 1001, "b");
  k = cakismaUygula(k, "a", "alan", []);
  check(sonraki(k, 2000) === null, "çakışan ilk öğe ARKASINDAKİNİ de tutuyor");
  check(cakisanSayisi(k) === 1, "çakışan sayısı");
  /* Çözülünce kuyruk kendiliğinden akıyor. */
  const cozulmus = cozumUygula(k, "a", "sunucu", 2000);
  check(sonraki(cozulmus, 2000)?.id === "b", "çakışma çözülünce sıra devam ediyor");
}
{
  /* Geri çekilme penceresi dolmadan gönderilmiyor. */
  let k = kuyrugaAl([], GIRDI(), 1000, "a");
  k = hataUygula(k, "a", 0, "Bağlantı yok", 1000);
  check(sonraki(k, 1000) === null, "geri çekilmedeki öğe hemen denenmiyor");
  check(sonraki(k, 1000 + geriCekilme(1))?.id === "a", "süre dolunca yeniden sıraya giriyor");
}
{
  const dolu = Array.from({ length: MAKS_KUYRUK }, (_, i) =>
    kuyrugaAl([], GIRDI(), 1000, `x${i}`)[0]
  );
  check(kuyrukDolu(dolu), "kuyruk sınırı bildiriliyor");
  check(!kuyrukDolu(dolu.slice(1)), "sınır altında dolu değil");
}
{
  /*
   * HESAP ve AĞAÇ süzgeci. Aynı telefonda başka hesap açıldığında onun adına
   * yazmak, ya da kurucu ağaç değiştirdiğinde bir ağacın düzeltmesini ÖBÜR
   * ağaca yazmak — ikisi de sessiz veri bozulması.
   */
  let k = kuyrugaAl([], GIRDI({ hesap: "u1", treeId: null }), 1000, "a");
  k = kuyrugaAl(k, GIRDI({ hesap: "u2", treeId: null }), 1001, "b");
  k = kuyrugaAl(k, GIRDI({ hesap: "u1", treeId: "t2" }), 1002, "c");
  check(kuyrukSuz(k, "u1", null).map((i) => i.id).join() === "a", "başka hesabın yazması süzülüyor");
  check(kuyrukSuz(k, "u1", "t2").map((i) => i.id).join() === "c", "başka ağacın yazması ayrı dilimde");
  check(sonraki(kuyrukSuz(k, "u1", "t2"), 2000)?.id === "c",
    "bir ağaçtaki bekleme ÖBÜR ağacı kilitlemiyor");
}

/* ══ 4. ÜÇ YÖNLÜ BİRLEŞTİRME — tasarımın merkezi ═══════════════════════ */
{
  /* Yeni kayıt çakışamaz: karşılaştırılacak taban yok. */
  const it = kuyrugaAl([], GIRDI({ kind: "ekle", personId: undefined, alanlar: { firstName: "Veli" } }), 1, "a")[0];
  const kr = birlestir(it, undefined);
  check(kr.tur === "gonder" && (kr.gonderilecek as Record<string, unknown>).firstName === "Veli",
    "ekleme her zaman gönderiliyor");
}
{
  /*
   * ASIL KAZANÇ: aradan geçen değişiklik BAŞKA bir alanda. Naif tasarım
   * (bayat damgayı gönder) burada 409 alır ve kullanıcıya ilgisiz bir
   * çakışma sorardı; üç yönlü birleştirme sessizce ve doğru uyguluyor.
   */
  const it = kuyrugaAl([], GIRDI({
    alanlar: { occupation: "öğretmen" }, taban: { occupation: "çiftçi" },
  }), 1, "a")[0];
  const sunucu = KISI({ occupation: "çiftçi", bio: "araya biri hikâye yazdı" });
  const kr = birlestir(it, sunucu);
  check(kr.tur === "gonder", "ilgisiz alan değişmişse çakışma YOK");
  check(kr.tur === "gonder" && Object.keys(kr.gonderilecek).join() === "occupation",
    "gövdede yalnız benim değiştirdiğim alan var");
}
{
  /*
   * ZATEN UYGULANMIŞ → çakışma DEĞİL. Aynı mezar taşına bakan iki kuzen aynı
   * düzeltmeyi yapmış olabilir. Sunucudaki `applyProposal` da bu ayrımı
   * yapıyor; ikisi ayrışmamalı.
   */
  const it = kuyrugaAl([], GIRDI({
    alanlar: { birthDate: "1943" }, taban: { birthDate: "" },
  }), 1, "a")[0];
  const kr = birlestir(it, KISI({ birthDate: "1943" }));
  check(kr.tur === "atla" && kr.sebep === "zaten-uygulanmis", "başkası aynı düzeltmeyi yapmışsa atlanıyor");
}
{
  /* GERÇEK çakışma: aynı alan, üç farklı değer. */
  const it = kuyrugaAl([], GIRDI({
    alanlar: { birthDate: "1943" }, taban: { birthDate: "1940" },
  }), 1, "a")[0];
  const kr = birlestir(it, KISI({ birthDate: "1945" }));
  check(kr.tur === "cakisma" && kr.sebep === "alan", "aynı alan değişmişse çakışma");
  if (kr.tur === "cakisma") {
    const c = kr.alanlar[0];
    check(c.alan === "birthDate" && c.benim === "1943" && c.sunucu === "1945" && c.taban === "1940",
      "çakışma satırı üç değeri de taşıyor (kullanıcı karar verebilsin)");
  }
}
{
  /*
   * KARIŞIK durumda HİÇBİR ŞEY gönderilmiyor. Temiz alanları gönderip
   * çakışanı sormak, yazmayı ikiye bölerdi: kullanıcı "uygulanmadı" sanırken
   * yarısı uygulanmış olurdu ve geri alması imkânsızlaşırdı.
   */
  const it = kuyrugaAl([], GIRDI({
    alanlar: { occupation: "öğretmen", birthDate: "1943" },
    taban: { occupation: "çiftçi", birthDate: "1940" },
  }), 1, "a")[0];
  const kr = birlestir(it, KISI({ occupation: "çiftçi", birthDate: "1945" }));
  check(kr.tur === "cakisma" && kr.alanlar.length === 1, "yalnız gerçekten çakışan alan soruluyor");
}
{
  /* Düzenlediğimiz kayıt aradan silinmiş. */
  const it = kuyrugaAl([], GIRDI({ alanlar: { bio: "x" }, taban: { bio: "" } }), 1, "a")[0];
  const kr = birlestir(it, undefined);
  check(kr.tur === "cakisma" && kr.sebep === "kayit-silinmis", "silinmiş kayda yazma soruluyor");
}
{
  /* "Benimkini uygula" → birleştirme atlanıyor, TÜM alanlar gidiyor. */
  const it = { ...kuyrugaAl([], GIRDI({
    alanlar: { birthDate: "1943" }, taban: { birthDate: "1940" },
  }), 1, "a")[0], zorla: true };
  const kr = birlestir(it, KISI({ birthDate: "1945" }));
  check(kr.tur === "gonder", "zorla işaretli öğe çakışma denetimini atlıyor");
}
{
  /* Silme: kayıt zaten yoksa NİYET GERÇEKLEŞMİŞ, hata gösterilmiyor. */
  const it = kuyrugaAl([], GIRDI({ kind: "sil", alanlar: {}, taban: { ...KISI() } }), 1, "a")[0];
  check((() => { const k = birlestir(it, undefined); return k.tur === "atla" && k.sebep === "kayit-yok"; })(),
    "zaten silinmiş kayıt için silme atlanıyor");
  /* Kayıt aynıysa silme uygulanıyor. */
  check(birlestir(it, KISI()).tur === "gonder", "değişmemiş kayıt silinebiliyor");
  /*
   * Kayıt DEĞİŞMİŞSE soruluyor: silme geri alınamaz ve aradan biri fotoğraf
   * eklemiş, hikâyeyi yazmış olabilir. O emeği sessizce yok etmek, tam
   * olarak önlemeye çalıştığımız şey.
   */
  const kr = birlestir(it, KISI({ bio: "torunu hikâyesini yazdı" }));
  check(kr.tur === "cakisma" && kr.sebep === "kayit-degismis", "aradan zenginleşen kayıt sessizce silinmiyor");
}
{
  /* Öneri yolunda istemci birleştirmesi YOK: bayatlık denetimi onay anında
     sunucuda (`applyProposal`). Aynı kuralı iki yerde yazmıyoruz. */
  const it = kuyrugaAl([], GIRDI({
    oneri: true, alanlar: { birthDate: "1943" }, taban: { birthDate: "1940" },
  }), 1, "a")[0];
  check(birlestir(it, KISI({ birthDate: "1945" })).tur === "gonder", "öneri her hâlükârda gönderiliyor");
}

/* ══ 5. Hata durum makinesi ═════════════════════════════════════════════ */
{
  /*
   * GEÇİCİ hatalarda üst sınır YOK: çevrimdışılık günlerce sürebilir ve
   * "çok denedik, attık" demek kullanıcının yazdığını çöpe atmak olurdu.
   */
  let k = kuyrugaAl([], GIRDI(), 0, "a");
  for (const st of [0, 500, 503, 429]) {
    k = hataUygula(k, "a", st, "geçici", 0);
    check(k[0].durum === "bekliyor", `durum ${st} geçici sayılıyor`);
  }
  check(k[0].deneme === 4, "geçici hatalar deneme sayacını artırıyor");
  check(geriCekilme(1) < geriCekilme(2), "geri çekilme uzuyor");
  check(geriCekilme(50) === GERI_CEKILME_TAVAN, "geri çekilmenin tavanı var");
}
{
  /*
   * 401 KUYRUĞU DÜŞÜRMÜYOR. Jetonun ölmesi kullanıcının yazdığını geçersiz
   * kılmaz; tekrar giriş yapınca kuyruk olduğu gibi akmalı.
   */
  const k = hataUygula(kuyrugaAl([], GIRDI(), 0, "a"), "a", 401, "Oturum", 0);
  check(k.length === 1 && k[0].durum === "bekliyor", "401'de yazma kaybolmuyor");
}
{
  /* KALICI retler yeniden denenmiyor: aynı cevabı verirler. */
  for (const st of [400, 403, 404]) {
    const k = hataUygula(kuyrugaAl([], GIRDI(), 0, "a"), "a", st, "ret", 0);
    check(k[0].durum === "hata", `durum ${st} kalıcı sayılıyor`);
  }
  check(hataliSayisi(hataUygula(kuyrugaAl([], GIRDI(), 0, "a"), "a", 403, "ret", 0)) === 1,
    "hatalı sayısı");
}
{
  /*
   * 409 = DAR YARIŞ (bizim okumamızla yazmamız arasında biri yazdı). Öğe
   * düşmüyor, tur baştan başlıyor ve taze veriyle birleştirme yeniden
   * koşuyor. Sonsuz dönmesin diye sayaçlı.
   */
  let k = kuyrugaAl([], GIRDI(), 0, "a");
  for (let i = 0; i < MAKS_409; i++) {
    k = hataUygula(k, "a", 409, "çakıştı", 0);
    check(k[0].durum === "bekliyor", `409 turu ${i + 1}: öğe hâlâ sırada`);
  }
  k = hataUygula(k, "a", 409, "çakıştı", 0);
  check(k[0].durum === "cakisti" && k[0].cakismaSebep === "surekli-cakisma",
    "sürekli 409 sonunda karar kullanıcıya bırakılıyor");
}
{
  /* Kullanıcının kararı. */
  const k = cakismaUygula(kuyrugaAl([], GIRDI(), 0, "a"), "a", "alan",
    [{ alan: "birthDate", taban: "1940", benim: "1943", sunucu: "1945" }]);
  const benim = cozumUygula(k, "a", "benim", 5000);
  check(benim[0].durum === "bekliyor" && benim[0].zorla === true, "\"benimkini uygula\" sıraya döndürüyor");
  check(benim[0].cakisan === undefined && benim[0].cakismaSayisi === 0, "çakışma izleri temizleniyor");
  check(cozumUygula(k, "a", "sunucu", 5000).length === 0, "\"sunucudakini tut\" öğeyi düşürüyor");
}

/* ══ 6. Sürücü benzetimi: sıralı gönderim, uçtan uca ════════════════════ */
{
  /*
   * `outbox-store.tsx`teki gönderim turunun aynısı, sahte sunucuyla. Burada
   * sınanan şey sıralamanın KORUNMASI: kayıt önce ekleniyor, sonra
   * düzeltiliyor. Ters sırada gönderilseydi düzeltme henüz var olmayan bir
   * kayda giderdi.
   */
  const gonderilen: string[] = [];
  let kuyruk: OutboxItem[] = [];
  kuyruk = kuyrugaAl(kuyruk, GIRDI({ kind: "ekle", personId: undefined, etiket: "Veli",
    alanlar: { firstName: "Veli" } }), 1, "a");
  kuyruk = kuyrugaAl(kuyruk, GIRDI({ personId: "p1",
    alanlar: { occupation: "öğretmen" }, taban: { occupation: "çiftçi" } }), 2, "b");
  kuyruk = kuyrugaAl(kuyruk, GIRDI({ kind: "sil", personId: "p2", taban: { ...KISI({ id: "p2" }) } }), 3, "c");

  const sunucu = new Map<string, Person>([
    ["p1", KISI({ id: "p1", occupation: "çiftçi" })],
    ["p2", KISI({ id: "p2" })],
  ]);

  for (let adim = 0; adim < 20; adim++) {
    const it = sonraki(kuyruk, 1000);
    if (!it) break;
    const kr = birlestir(it, it.personId ? sunucu.get(it.personId) : undefined);
    if (kr.tur === "cakisma") { kuyruk = cakismaUygula(kuyruk, it.id, kr.sebep, kr.alanlar); break; }
    if (kr.tur === "atla") { kuyruk = cikar(kuyruk, it.id); continue; }
    gonderilen.push(`${it.kind}:${it.id}`);
    kuyruk = cikar(kuyruk, it.id);
  }
  check(gonderilen.join(" ") === "ekle:a guncelle:b sil:c", "kuyruk yakalandığı SIRAYLA gönderiliyor");
  check(kuyruk.length === 0, "tamamlanan kuyruk boşalıyor");
}
{
  /* Çakışan öğe arkasındakileri tutuyor; kullanıcı karar verene kadar. */
  let kuyruk = kuyrugaAl([], GIRDI({ personId: "p1",
    alanlar: { birthDate: "1943" }, taban: { birthDate: "1940" } }), 1, "a");
  kuyruk = kuyrugaAl(kuyruk, GIRDI({ personId: "p1",
    alanlar: { occupation: "öğretmen" }, taban: { occupation: "çiftçi" } }), 2, "b");
  const sunucu = KISI({ id: "p1", birthDate: "1945", occupation: "çiftçi" });
  const gonderilen: string[] = [];
  for (let adim = 0; adim < 10; adim++) {
    const it = sonraki(kuyruk, 1000);
    if (!it) break;
    const kr = birlestir(it, sunucu);
    if (kr.tur === "cakisma") { kuyruk = cakismaUygula(kuyruk, it.id, kr.sebep, kr.alanlar); continue; }
    if (kr.tur === "atla") { kuyruk = cikar(kuyruk, it.id); continue; }
    gonderilen.push(it.id);
    kuyruk = cikar(kuyruk, it.id);
  }
  check(gonderilen.length === 0, "çakışan öğe arkasındaki temiz yazmayı da tutuyor");
  check(kuyruk.length === 2, "hiçbir yazma kaybolmuyor");
}

/* ══ 7. Kalıcılık: uygulama kapanıp açılınca kuyruk duruyor ═════════════ */
{
  let k = kuyrugaAl([], GIRDI({ alanlar: { bio: "uzun hikâye" }, taban: { bio: "" } }), 7, "a");
  k = hataUygula(k, "a", 0, "Bağlantı yok", 7);
  const geri = deserialize(serialize(k));
  check(geri.length === 1 && geri[0].id === "a", "kuyruk gidiş-dönüşte korunuyor");
  check(geri[0].alanlar.bio === "uzun hikâye" && geri[0].taban.bio === "", "alanlar ve taban korunuyor");
  check(geri[0].deneme === 1 && geri[0].durum === "bekliyor", "durum makinesinin hâli korunuyor");
}
{
  /*
   * BOZUK VERİDE ÇÖKMÜYOR: açılışta atılan bir istisna uygulamayı hiç
   * açılmaz hâle getirirdi ve kuyruk zaten kurtarılamaz durumda.
   */
  check(deserialize(null).length === 0, "boş depo boş kuyruk");
  check(deserialize("{bozuk").length === 0, "bozuk JSON çökmüyor");
  check(deserialize('{"v":99,"items":[{"id":"a"}]}').length === 0, "bilinmeyen biçim sürümü atılıyor");
  check(deserialize('{"v":1,"items":"x"}').length === 0, "liste olmayan içerik atılıyor");
  check(deserialize('{"v":1,"items":[{"id":"a"},null,3]}').length === 0, "geçersiz öğeler ayıklanıyor");
}

/* ══ 8. SecureStore parçalama (Android 2048 bayt sınırı) ════════════════ */
{
  /*
   * Depoda SecureStore'dan başka kalıcılık yok ve Android'de bir değer 2048
   * baytı aşamıyor; aşan yazma SESSİZCE düşerdi — yani kuyruk uygulama
   * kapanınca yok olurdu. Tam olarak önlemeye çalıştığımız kayıp.
   */
  check(baytUzunlugu("abc") === 3, "ASCII bayt sayımı");
  check(baytUzunlugu("ğüş") === 6, "Türkçe harfler 2 bayt");
  check(baytUzunlugu("😀") === 4, "vekil çifti 4 bayt");

  const uzun = "ğ".repeat(2000) + "😀" + "a".repeat(500);
  const parcalar = parcala(uzun, 100);
  check(parcalar.every((p) => baytUzunlugu(p) <= 100), "hiçbir parça sınırı aşmıyor");
  check(parcalariBirlestir(parcalar) === uzun, "parçalar birleşince metin AYNI");
  /*
   * Vekil çifti bölünseydi birleştirmede bozuk karakter çıkardı, JSON
   * ayrıştırması düşerdi ve kuyruğun TAMAMI kaybolurdu.
   */
  check(parcalar.every((p) => !/[\uD800-\uDBFF]$/.test(p)), "emoji ortadan bölünmüyor");
  check(parcala("", 100).length === 0, "boş metin parça üretmiyor");
  check(parcalariBirlestir(["a", null]) === null, "eksik parça kurtarılamaz olarak bildiriliyor");

  /* Gerçek boyutlu bir kuyruk da sınırın altında saklanabiliyor. */
  let k: OutboxItem[] = [];
  for (let i = 0; i < 10; i++) {
    k = kuyrugaAl(k, GIRDI({ alanlar: { bio: "ğ".repeat(400) }, taban: { bio: "" } }), i, `x${i}`);
  }
  const p = parcala(serialize(k));
  check(p.length > 1, "büyük kuyruk parçalanıyor");
  check(deserialize(parcalariBirlestir(p)).length === 10, "parçalı kuyruk eksiksiz geri okunuyor");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
