/**
 * FAZ 4'ÜN KAPISI — "hazır mıyız?" sorusunun HESAPLANABİLİR cevabı.
 *
 * ## Bu dosya neden var
 *
 * `docs/SUPABASE-GECIS.md` Faz 4'ün ön koşullarını DÜZYAZI olarak yazıyordu:
 * "Faz 3c–3e oturduktan, tüm hesaplar Supabase Auth'a taşındıktan ve kayma
 * denetimi her ağaç için temiz döndükten sonra…". Cümle doğruydu ama HİÇBİR
 * YERDE HESAPLANMIYORDU. Yani "hazır mıyız?" sorusunun tek cevabı, o gün
 * belgeyi okuyan kişinin kanaatiydi.
 *
 * Faz 4 bu depodaki tek GERİ DÖNÜŞÜ OLMAYAN iş: NextAuth bcrypt yedeği
 * kalkıyor ve `users.json` kimlik deposu emekliye ayrılıyor. Yanlış ölçülmüş
 * bir "hazırız" burada, "bir hesabın giriş yolu kalıcı olarak yok oldu"
 * demek. Bu yüzden kapı, işin kendisinden ÖNCE ve işten AYRI yazıldı: bu
 * dosya Faz 4'ü uygulamaz, yalnız ona izin verip vermediğini söyler.
 *
 * ## İki karar bu dosyanın varlık sebebi
 *
 * ### 1. ŞÜPHEDE DAİMA "HAZIR DEĞİL"
 *
 * Bir olgu ölçülemediyse (Blob okunamadı, Auth sorgusu düştü, sayı gelmedi)
 * bu ASLA "sorun yok" sayılmaz. Geri dönüşü olmayan bir işin kapısında
 * "bilmiyorum" ile "temiz" aynı şey değildir: birincisi ölçümü tekrarlamayı,
 * ikincisi düğmeye basmayı gerektirir. Bunları karıştıran bir denetim,
 * altyapıdaki geçici bir arızayı yeşil ışığa çevirir.
 *
 * Bu yüzden ölçüm tipi `Olcum<T>` bir birleşim (union): değeri okumak için
 * ölçülemediği dalını ELE ALMAK ZORUNDASIN. `number | null` olsaydı bir
 * `??  0` ya da bir `if (x)` sessizce "ölçülemedi"yi "sıfır" ya da "yok"
 * yapardı — tam olarak kaçındığımız şey. Kural TİPTE, dolayısıyla derleyici
 * de bekçilik ediyor.
 *
 * Ölçülemeyen bir olgunun AĞIRLIĞI, o olgunun EN KÖTÜ olası değerinin
 * ağırlığıdır: ölçülemeyen kişi sayısı engel (çünkü eksik ayna engeldir),
 * ölçülemeyen damga uyarıdır (çünkü damganın yokluğu da uyarıdır). Şüphe,
 * olguyu olduğundan daha korkutucu yapmaz — ama daha masum da yapmaz.
 *
 * ### 2. BOŞ ENVANTER "TEMİZ" DEĞİLDİR
 *
 * Sıfır ağaç ölçüldüyse `trees.every(clean)` matematiksel olarak `true`
 * döner ve bu, klasik tuzağın ta kendisidir: "her ağaç temiz" cümlesi
 * "hiçbir ağaç ölçülmedi" hâlinde de doğru görünür. Oysa boş liste bir
 * SONUÇ değil, ÖLÇÜMÜN YOKLUĞUdur — çoğu zaman da envanteri getiren
 * çağrının sessizce boş dönmesidir. Bu yüzden boş envanter burada
 * `olculemedi` engeliyle işaretleniyor, "temiz" ile değil.
 *
 * ## Ağırlıklar neden böyle
 *
 * | kod | ağırlık | gerekçe |
 * |---|---|---|
 * | `ayna-eksik` | engel | Faz 4 Blob'u bırakıyor. Ayna eksikse eksik kişiler KALICI olarak kaybolur. |
 * | `kayma-var` | engel | Sessiz alan ayrışması sayıya yansımaz; okuma Postgres'e döndükten sonra geri dönüş yok. |
 * | `auth-eksik` | engel | bcrypt yedeği kalkınca Auth kaydı olmayan hesap bir daha GİREMEZ. |
 * | `demo-acikta` | engel | Demo hâlâ `users.json`da bir HESAP olarak duruyor; emekliye ayrılan depoda kalıntı bırakmak. |
 * | `giris-denenmemis` | engel | Faz 4 sonrası TEK giriş yolu bu; üretimde hiç çalıştığı görülmemiş bir yolu tek yol yapmak paraşütü denemeden atlamaktır. |
 * | `damga-yok` | uyarı | `trees.updated_at` boş olması veri kaybetmiyor: sürüm jetonu kişi damgalarına düşüyor (`lib/version-stamp.ts`). Yazma yolunun o ağaçta henüz işlemediğini gösterir — bildirilmeli, ama Faz 4'ü durdurmaz. |
 *
 * ## Bağımlılıksız
 *
 * Çalışma zamanı `@/…` içe aktarımı YOK (yalnız tip düzeyi olurdu, o da yok),
 * böylece `node --experimental-strip-types` ile doğrudan birim testi
 * koşulabiliyor — `lib/public-routes.ts`, `lib/story-series.ts` ile aynı
 * kalıp. Kapının kendisi test edilemiyorsa kapı yoktur.
 */

/* ── Ölçüm: değer ya VAR ya da NEDEN yok ──────────────────────────────────── */

/**
 * Ölçülmüş bir olgu.
 *
 * `T | null` DEĞİL, bilerek: `null` "ölçtüm, boş" ile "ölçemedim"i aynı
 * kutuya koyuyor ve ikisi bu dosyada taban tabana zıt sonuç veriyor. Union
 * tipinde `deger`e erişmek için önce `olculdu` dalını ayırmak zorundasın.
 */
export type Olcum<T> =
  | { readonly olculdu: true; readonly deger: T }
  | { readonly olculdu: false; readonly neden: string };

/** Ölçüm başarılı. */
export function olculdu<T>(deger: T): Olcum<T> {
  return { olculdu: true, deger };
}

/** Ölçüm düştü — NEDEN'iyle. Neden boş bırakılamaz: raporun işe yarar yarısı o. */
export function olculemedi<T>(neden: string): Olcum<T> {
  return { olculdu: false, neden: neden || "bilinmeyen sebep" };
}

/* ── Engel sözlüğü ────────────────────────────────────────────────────────── */

export type EngelKodu =
  | "auth-eksik" // Auth'ta karşılığı olmayan hesap var
  | "ayna-eksik" // bir ağacın Postgres'teki kişi sayısı Blob'unkinden az
  | "kayma-var" // alan düzeyi kayma (drift) temiz değil
  | "giris-denenmemis" // hiçbir hesap Supabase Auth ile giriş yapmamış
  | "damga-yok" // trees.updated_at null
  /**
   * BCRYPT YEDEĞİ HÂLÂ AÇIK.
   *
   * Faz 4'ün kalan parçası `users.json`ı kimlik deposu olmaktan çıkarıyor —
   * yani bcrypt yolunun OKUDUĞU dosyayı. Yedek açıkken o parçayı yapmak
   * kendi içinde çelişik: ya yedek sessizce ölü bir dosyaya bakar, ya da
   * dosya kalır ve "emekliye ayrıldı" doğru olmaz.
   *
   * İki ayrı sebep aynı sonucu veriyor ve ikisi de engel:
   *  · `AUTH_BCRYPT_FALLBACK` açık → acil durum anahtarı KULLANIMDA, yani
   *    Supabase Auth'a bugün güvenilmiyor demektir. Güvenilmeyen bir yolu
   *    tek yol yapmak, kapının tam olarak engellemesi gereken şey.
   *  · `SUPABASE_AUTH_LOGIN` kapalı → bcrypt zaten TEK yol (bayrak o
   *    durumda zorla açık, `lib/auth-flags.ts`). `users.json` giderse geriye
   *    hiçbir giriş yolu kalmaz. Bu, `giris-denenmemis` uyarısının
   *    yakalamadığı bir durum: geçmişte bir kez girilmiş olması bugün
   *    bcrypt'in tek yol olduğunu değiştirmiyor.
   */
  | "yedek-acik"
  /**
   * DEMO HÂLÂ KİMLİK DEPOSUNDA.
   *
   * Bu kodun ANLAMI TERSİNE ÇEVRİLDİ ve sebebi bir ürün kararı: demo bir
   * hesap değil, bir vitrindir (`lib/demo-account.ts`). Eskiden bu engel
   * "demonun `auth.users` karşılığı yok" diyordu — yani demoyu kimlik
   * sistemine SOKMAYI öneriyordu. Karar bunun tersi oldu: demo kimlik
   * sisteminin DIŞINDA olmalı, çünkü herkesin bildiği bir giriş yolunu
   * kimlik altyapısında tutmanın da, sahibi olmayan bir vitrine gerçek
   * kimlik (Auth kaydı, kurtarma kodu, şifre sıfırlama) taşıtmanın da
   * savunması yok.
   *
   * Dolayısıyla artık sorulan soru "demonun Auth kaydı var mı" değil,
   * "demo hâlâ `users.json`da bir hesap satırı olarak duruyor mu". Kod o
   * satıra artık dayanmıyor; ama satır orada durduğu sürece Faz 4 emekliye
   * ayrılan depoyu temiz devralmıyor demektir — ve bir sonraki okuyan
   * demonun kimliği olduğunu sanıp aynı yanlışı tekrar kurar.
   */
  | "demo-acikta"
  /**
   * OLGU ÖLÇÜLEMEDİ. Görevin ilk taslağında bu kod yoktu ve eksikti: bir
   * ölçüm düştüğünde onu `ayna-eksik`/`auth-eksik` diye bildirmek YALAN
   * olurdu (aynanın eksik olduğunu bilmiyoruz, bakamadığımızı biliyoruz) ve
   * kullanıcıyı yanlış onarıma gönderirdi. "Bilmiyorum" ayrı bir cevaptır ve
   * ayrı bir eylem gerektirir: ölçümü tekrarla.
   */
  | "olculemedi";

/**
 * `engel` Faz 4'ü DURDURUR; `uyari` yalnız rapora düşer.
 *
 * Ayrım şart: her eksiği engel saymak kapıyı hiç açılmaz yapar ve insanlar
 * kapıyı baypas etmeyi öğrenir — hiç kapı olmamasından beterdir.
 */
export type Agirlik = "engel" | "uyari";

export interface Engel {
  kod: EngelKodu;
  /** Kullanıcının NE YAPACAĞINI bilmesi için gereken cümle. Sayılarla. */
  ayrinti: string;
  agirlik: Agirlik;
}

/* ── Ölçülen olgular ──────────────────────────────────────────────────────── */

export interface AgacOlgusu {
  treeId: string;
  name: string;
  /** Blob'daki (KAYNAK) kişi sayısı. */
  blobPeople: Olcum<number>;
  /** Postgres'teki (AYNA) kişi sayısı. */
  dbPeople: Olcum<number>;
  /** Ağaç satırı Postgres'te var mı? (göç edilmiş mi) */
  inDb: Olcum<boolean>;
  /** `lib/drift.ts` verdiği tek ölçü: hiçbir kayma yok mu? */
  driftClean: Olcum<boolean>;
  /** `trees.updated_at` — ölçüldüğü hâlde `null` olabilir (hiç damgalanmamış). */
  stamp: Olcum<string | null>;
}

export interface HesapOlgusu {
  accountId: string;
  /**
   * Rapora yazılacak ad. Başka bir kurucunun aile adı BURAYA KOYULMAZ —
   * uç, çağıranın kendi hesabı ve herkese açık demo dışında kimliği
   * maskeler (bkz. `app/api/admin/phase4/route.ts`).
   */
  label: string;
  /**
   * Bu satır herkese açık demo vitrinine mi ait?
   *
   * `true` olması BAŞLI BAŞINA bulgudur: demonun kimlik deposunda hiç satırı
   * olmamalı (`lib/demo-account.ts`). Ölçüm yine de yapılıyor, çünkü üretimde
   * eski bir satır kalmış olabilir ve kapının işi tam da onu göstermek.
   */
  isDemo: boolean;
  /** `users.json`da hâlâ bir bcrypt şifre satırı var mı? */
  hasPasswordHash: boolean;
  /** `auth.users`ta karşılığı var mı? */
  authUser: Olcum<boolean>;
  /** Supabase Auth ile son giriş (ölçüldüğü hâlde `null` = hiç girilmemiş). */
  lastSignInAt: Olcum<string | null>;
}

export interface Olgular {
  trees: Olcum<AgacOlgusu[]>;
  accounts: Olcum<HesapOlgusu[]>;
  /** `SUPABASE_AUTH_LOGIN` bayrağı. Env'den okunur, her zaman ölçülebilir. */
  supabaseLoginEnabled: boolean;
  /**
   * Kurucunun bcrypt yedeği bugün DENENİYOR mu? (`isBcryptFallbackEnabled`)
   *
   * Ayrı bir alan, çünkü iki bayrağın BİLEŞİMİ: `SUPABASE_AUTH_LOGIN`
   * kapalıyken bu zorla `true`dur. Kapının burada türetmesi, aynı kuralın
   * iki yerde yazılması ve zamanla ayrışması demek olurdu.
   */
  bcryptFallbackEnabled: boolean;
}

export interface Karar {
  /** Faz 4 uygulanabilir mi? Tek bir `engel` bunu `false` yapar. */
  hazir: boolean;
  engeller: Engel[];
  sayim: { engel: number; uyari: number };
}

/* ── Karar ────────────────────────────────────────────────────────────────── */

const ENGEL = (kod: EngelKodu, ayrinti: string): Engel => ({ kod, ayrinti, agirlik: "engel" });
const UYARI = (kod: EngelKodu, ayrinti: string): Engel => ({ kod, ayrinti, agirlik: "uyari" });

/**
 * Faz 4 kapısı. Girdi ölçülmüş olgular, çıktı gerekçeli karar.
 *
 * Saf: ağ yok, saat yok, rastgelelik yok. Aynı olgular her zaman aynı kararı
 * verir — geri dönüşü olmayan bir işin kapısında tekrarlanabilirlik, doğru
 * cevap kadar önemli.
 */
export function phase4Readiness(olgular: Olgular): Karar {
  const engeller: Engel[] = [];

  agaclariDenetle(olgular, engeller);
  hesaplariDenetle(olgular, engeller);
  yedegiDenetle(olgular, engeller);

  const sayim = {
    engel: engeller.filter((e) => e.agirlik === "engel").length,
    uyari: engeller.filter((e) => e.agirlik === "uyari").length,
  };
  return { hazir: sayim.engel === 0, engeller, sayim };
}

/* ── Giriş yedeği ─────────────────────────────────────────────────────────── */

/**
 * Bcrypt yedeği kapalı mı? Faz 4'ün KALAN parçasının ön koşulu.
 *
 * Kalan parça `users.json`ı kimlik deposu olmaktan çıkarıyor — yani bcrypt
 * yolunun okuduğu dosyayı. Yedek açıkken bunu yapmak kendi içinde çelişik.
 *
 * Bu denetim, `giris-denenmemis`in yakalayamadığı bir boşluğu kapatıyor: o
 * denetim GEÇMİŞTE en az bir Supabase girişi görürse yeterli sayıyor.
 * `SUPABASE_AUTH_LOGIN` bugün kapalıysa geçmişteki o giriş bir şey
 * kanıtlamıyor — bugün bcrypt tek yol, ve dosya giderse giriş yolu hiç
 * kalmıyor.
 */
function yedegiDenetle(olgular: Olgular, engeller: Engel[]): void {
  if (!olgular.bcryptFallbackEnabled) return;

  /*
   * İki sebep ayrı ayrı söyleniyor: onarımları farklı. Biri "bayrağı
   * kaldır", öteki "Supabase girişini aç ve bir süre koştur".
   */
  const neden = olgular.supabaseLoginEnabled
    ? "AUTH_BCRYPT_FALLBACK açık — acil durum anahtarı KULLANIMDA, yani Supabase Auth'a bugün güvenilmiyor. Kesinti bitmişse değişkeni kaldırın."
    : "SUPABASE_AUTH_LOGIN kapalı: bcrypt bugün TEK giriş yolu. Geçmişte bir kez Supabase üzerinden girilmiş olması bunu değiştirmiyor.";

  engeller.push(
    ENGEL(
      "yedek-acik",
      `${neden} Faz 4'ün kalan parçası users.json'ı emekliye ayırıyor — yani bcrypt yolunun OKUDUĞU dosyayı. Yedek açıkken yapılırsa geriye çalışan bir giriş yolu kalmayabilir.`
    )
  );
}

/* ── Ağaçlar: ayna ve kayma ───────────────────────────────────────────────── */

function agaclariDenetle(olgular: Olgular, engeller: Engel[]): void {
  if (!olgular.trees.olculdu) {
    engeller.push(
      ENGEL("olculemedi", `Ağaç envanteri okunamadı: ${olgular.trees.neden}. Ölçüm tekrarlanmalı.`)
    );
    return;
  }

  const agaclar = olgular.trees.deger;

  /*
   * BOŞ ENVANTER TEMİZ DEĞİL. Aşağıdaki döngü sıfır ağaçta hiç dönmez ve
   * hiç engel üretmez; o sessizlik "her ağaç temiz" diye okunurdu. Oysa bu
   * uygulamada ağacı olmayan bir kurucu yok — boş liste neredeyse her zaman
   * envanterin sessizce boş dönmesi demek. Ölçüm yokluğu olarak bildiriliyor.
   */
  if (agaclar.length === 0) {
    engeller.push(
      ENGEL(
        "olculemedi",
        "Hiç ağaç ölçülmedi. Boş envanter 'her ağaç temiz' demek DEĞİL, 'hiç ölçüm yok' demektir."
      )
    );
    return;
  }

  for (const t of agaclar) {
    const ad = `${t.name} (${t.treeId})`;

    /* Göç edilmiş mi? Bu, diğer bütün ağaç ölçümlerinin ön şartı. */
    if (!t.inDb.olculdu) {
      engeller.push(ENGEL("olculemedi", `${ad}: ağaç satırı okunamadı — ${t.inDb.neden}`));
    } else if (!t.inDb.deger) {
      engeller.push(
        ENGEL("ayna-eksik", `${ad}: Postgres'te ağaç satırı YOK — hiç göç edilmemiş (/api/admin/migrate).`)
      );
    }

    /* Kişi sayıları: ayna kaynaktan KÜÇÜK olamaz. */
    if (!t.blobPeople.olculdu) {
      engeller.push(ENGEL("olculemedi", `${ad}: Blob kişi sayısı ölçülemedi — ${t.blobPeople.neden}`));
    } else if (!t.dbPeople.olculdu) {
      engeller.push(ENGEL("olculemedi", `${ad}: Postgres kişi sayısı ölçülemedi — ${t.dbPeople.neden}`));
    } else if (t.dbPeople.deger < t.blobPeople.deger) {
      const eksik = t.blobPeople.deger - t.dbPeople.deger;
      engeller.push(
        ENGEL(
          "ayna-eksik",
          `${ad}: Blob ${t.blobPeople.deger} kişi / Postgres ${t.dbPeople.deger} kişi — aynada ${eksik} kişi eksik.`
        )
      );
    }
    /*
     * TERS YÖN (Postgres'te FAZLA kişi) burada engel değil: o, yayılmamış
     * bir SİLME olabilir ve sayıya bakarak hangi tarafın haklı olduğu
     * söylenemez. Kayıt kayıt bakan `driftClean` zaten yakalıyor
     * (`fazla` türü) ve `kayma-var` olarak bildiriliyor — aynı bulguyu iki
     * ayrı kodla raporlamak, kullanıcıyı iki ayrı onarıma gönderirdi.
     */

    /* Alan düzeyi kayma — sayı eşitliği eşitlik değildir. */
    if (!t.driftClean.olculdu) {
      engeller.push(ENGEL("olculemedi", `${ad}: kayma denetimi koşturulamadı — ${t.driftClean.neden}`));
    } else if (!t.driftClean.deger) {
      engeller.push(
        ENGEL("kayma-var", `${ad}: kayma denetimi temiz değil. Ayrıntı ve onarım: /api/admin/drift`)
      );
    }

    /*
     * DAMGA. Yalnız göç etmiş ağaçta anlamlı: Postgres'te satırı olmayan
     * ağaçta damganın boş olması ayrı bir bulgu değil, `ayna-eksik`in
     * sonucu. Aynı gerçeği iki kez bildirmek raporu gürültüye boğar.
     */
    if (t.inDb.olculdu && t.inDb.deger) {
      if (!t.stamp.olculdu) {
        engeller.push(UYARI("olculemedi", `${ad}: sürüm damgası okunamadı — ${t.stamp.neden}`));
      } else if (t.stamp.deger === null) {
        engeller.push(
          UYARI(
            "damga-yok",
            `${ad}: trees.updated_at boş — ağaç bu sütun eklendiğinden beri hiç kaydedilmemiş. Veri kaybı yok; sürüm jetonu kişi damgalarına düşüyor.`
          )
        );
      }
    }
  }
}

/* ── Hesaplar: Auth kapsaması, demo ve giriş kanıtı ───────────────────────── */

function hesaplariDenetle(olgular: Olgular, engeller: Engel[]): void {
  if (!olgular.accounts.olculdu) {
    engeller.push(
      ENGEL("olculemedi", `Hesap envanteri okunamadı: ${olgular.accounts.neden}. Ölçüm tekrarlanmalı.`)
    );
    return;
  }

  const hesaplar = olgular.accounts.deger;

  /* Ağaçlardaki ile aynı tuzak: sıfır hesap "hepsi taşındı" demek değil. */
  if (hesaplar.length === 0) {
    engeller.push(
      ENGEL(
        "olculemedi",
        "Hiç hesap ölçülmedi. Boş envanter 'her hesap Auth'a taşındı' demek DEĞİL, 'hiç ölçüm yok' demektir."
      )
    );
    return;
  }

  for (const h of hesaplar) {
    /*
     * DEMO, AUTH'TAN ÖNCE SORULUYOR — sıra önemli.
     *
     * Demo bir kimlik değil (`lib/demo-account.ts`), dolayısıyla onun için
     * "Auth'ta var mı" sorusunun doğru cevabı YOK: olması da olmaması da
     * kapının aradığı şey değil. Aranan tek şey, demonun kimlik deposunda
     * bir hesap satırı bırakıp bırakmadığı. Denetim Auth dalının ALTINDA
     * kalsaydı, Auth'a yanlışlıkla aktarılmış bir demo satırı `continue` ile
     * sessizce geçilirdi — yani kalıntı, tam da onu görünür kılması gereken
     * kapıdan kaçardı.
     */
    if (h.isDemo) {
      engeller.push(
        ENGEL(
          "demo-acikta",
          `${h.label}: demo HÂLÂ users.json'da bir hesap satırı olarak duruyor${
            h.hasPasswordHash ? " (şifre karmasıyla)" : ""
          }. Demo bir hesap değil vitrindir ve kod artık bu satıra dayanmıyor; satır ELLE silinmeli. Ayrıntı: docs/SUPABASE-GECIS.md.`
        )
      );
      continue;
    }

    if (!h.authUser.olculdu) {
      engeller.push(
        ENGEL("olculemedi", `${h.label}: Auth kaydı sorgulanamadı — ${h.authUser.neden}`)
      );
      continue;
    }
    if (h.authUser.deger) continue;

    engeller.push(
      ENGEL(
        "auth-eksik",
        `${h.label}: auth.users'ta karşılığı yok. bcrypt yedeği kalkınca bu hesap bir daha giriş YAPAMAZ (/api/admin/migrate ile aktarın).`
      )
    );
  }

  /*
   * GİRİŞ KANITI YALNIZ GERÇEK KİMLİKLERDEN SORULUYOR.
   *
   * Demo Supabase Auth'la hiç giriş yapmayacak — kendi sağlayıcısından,
   * şifresiz geçiyor. Sayıya katılsaydı paydayı şişirir ("ölçülen 3 hesabın
   * hiçbirinde…"), üstelik hiçbir zaman kanıt üretemeyeceği için raporu
   * olduğundan karamsar gösterirdi.
   */
  girisKanitiniDenetle(olgular, hesaplar.filter((h) => !h.isDemo), engeller);
}

/**
 * "Bu yol üretimde gerçekten çalışıyor mu?" — Faz 4'ün en kolay atlanan şartı.
 *
 * Auth kaydının VAR OLMASI, o kayıtla GİRİLEBİLDİĞİ anlamına gelmez: Email
 * sağlayıcısı kapalı olabilir, `password_hash` içe aktarımı sessizce
 * uyuşmayabilir, anon anahtar eksik olabilir. Bunların hepsi bugün fark
 * edilmez, çünkü bcrypt yedeği devrede ve kullanıcı yine giriyor. Yedek
 * kalktığı gün fark edilir — ve o gün geri dönüş yoktur.
 *
 * Tek gerçek kanıt, `auth.users.last_sign_in_at`in en az bir hesapta dolu
 * olmasıdır: birileri o yoldan GERÇEKTEN girmiş demektir.
 */
function girisKanitiniDenetle(
  olgular: Olgular,
  /** YALNIZ gerçek kimlikler — demo bu listeye girmez (gerekçe çağıranda). */
  hesaplar: HesapOlgusu[],
  engeller: Engel[]
): void {
  const kanit = hesaplar.filter((h) => h.lastSignInAt.olculdu && h.lastSignInAt.deger !== null);
  const olcumsuz = hesaplar.filter((h) => !h.lastSignInAt.olculdu);

  if (kanit.length > 0) {
    /*
     * Yol kanıtlanmış. Bayrak KAPALIYSA yine de söylenmeli: Faz 4 sonrası
     * tek yol bu olacak, ama bugün kullanılmıyor — yani bugünkü davranış
     * yarınki davranışın kanıtı değil. Engel değil, çünkü yolun çalıştığı
     * en az bir kez görülmüş.
     */
    if (!olgular.supabaseLoginEnabled) {
      engeller.push(
        UYARI(
          "giris-denenmemis",
          `SUPABASE_AUTH_LOGIN kapalı: Supabase girişi ${kanit.length} hesapta çalışmış ama bugün devrede değil. Bayrağı açıp bir süre koşturmak, Faz 4 öncesi son provadır.`
        )
      );
    }
    return;
  }

  const parcalar = [
    `Ölçülen ${hesaplar.length} hesabın hiçbirinde Supabase Auth girişi (last_sign_in_at) yok`,
    olgular.supabaseLoginEnabled
      ? "SUPABASE_AUTH_LOGIN açık ama hiç başarılı giriş kaydı düşmemiş"
      : "SUPABASE_AUTH_LOGIN kapalı — giriş yolu hiç denenmemiş",
    olcumsuz.length > 0 ? `${olcumsuz.length} hesabın giriş damgası ölçülemedi` : "",
  ].filter(Boolean);

  engeller.push(
    ENGEL(
      "giris-denenmemis",
      `${parcalar.join("; ")}. Faz 4 sonrası TEK giriş yolu bu olacak; hiç denenmemiş bir yolu tek yol yapmak paraşütü açmadan atlamaktır.`
    )
  );
}
