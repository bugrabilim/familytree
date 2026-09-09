import {
  olculdu,
  olculemedi,
  phase4Readiness,
  type AgacOlgusu,
  type Engel,
  type HesapOlgusu,
  type Olgular,
} from "../lib/phase4-readiness.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

/**
 * FAZ 4 KAPISININ SAF KATMANI.
 *
 * Kapının iki varlık sebebi burada kilitleniyor:
 *  1. Şüphede DAİMA "hazır değil" — ölçülemeyen olgu asla temiz sayılmaz.
 *  2. Boş envanter "temiz" değildir — sıfır ağaç "hepsi temiz" demek değil.
 *
 * Her iddia MUTASYONLA sınanıyor: temiz bir durumdan tek bir olgu bozuluyor
 * ve kapının o teki gördüğü doğrulanıyor. "Hepsi bozukken kırmızı" demek
 * kolaydır ve hiçbir şey kanıtlamaz.
 */

/* ── Kurgu yardımcıları ───────────────────────────────────────────────────── */

const temizAgac = (over: Partial<AgacOlgusu> = {}): AgacOlgusu => ({
  treeId: "t1",
  name: "Pirci",
  blobPeople: olculdu(128),
  dbPeople: olculdu(128),
  inDb: olculdu(true),
  driftClean: olculdu(true),
  stamp: olculdu("2026-09-06T00:00:00.000Z"),
  ...over,
});

const temizHesap = (over: Partial<HesapOlgusu> = {}): HesapOlgusu => ({
  accountId: "604a6f47-b9c2-4924-a66f-ce0681925baa",
  label: "Pirci",
  isDemo: false,
  hasPasswordHash: true,
  authUser: olculdu(true),
  lastSignInAt: olculdu("2026-09-07T08:00:00.000Z"),
  aynaKaymasi: olculdu({ aynadaVar: true, ayrisan: [] }),
  ...over,
});

const temiz = (over: Partial<Olgular> = {}): Olgular => ({
  trees: olculdu([temizAgac()]),
  accounts: olculdu([temizHesap()]),
  supabaseLoginEnabled: true,
  bcryptFallbackEnabled: false,
  ...over,
});

const kodlar = (e: Engel[]) => e.map((x) => x.kod);
const engelKodlari = (e: Engel[]) => e.filter((x) => x.agirlik === "engel").map((x) => x.kod);

/* ── 1. Hepsi temizken HAZIR ──────────────────────────────────────────────── */

{
  const k = phase4Readiness(temiz());
  check(k.hazir === true, "hepsi temizken hazır");
  check(k.engeller.length === 0, "temiz durumda hiç engel/uyarı yok");
  check(k.sayim.engel === 0 && k.sayim.uyari === 0, "sayım sıfır");
}

/* ── 2. Ayna eksik: tek ağaçta bile engel ─────────────────────────────────── */

{
  // MUTASYON: iki ağaçtan YALNIZ birinde ayna geride.
  const o = temiz({
    trees: olculdu([
      temizAgac({ treeId: "demo", name: "demo" }),
      temizAgac({ treeId: "t2", name: "Pirci", blobPeople: olculdu(128), dbPeople: olculdu(0) }),
    ]),
  });
  const k = phase4Readiness(o);
  check(k.hazir === false, "tek ağaçta ayna eksikse hazır DEĞİL");
  check(engelKodlari(k.engeller).includes("ayna-eksik"), "ayna-eksik engeli var");
  const e = k.engeller.find((x) => x.kod === "ayna-eksik")!;
  check(/Pirci/.test(e.ayrinti), "gerekçe hangi ağaç olduğunu söylüyor");
  check(/128/.test(e.ayrinti) && /Postgres 0/.test(e.ayrinti), "gerekçe iki tarafın sayısını da veriyor");
  check(/128 kişi eksik/.test(e.ayrinti), "gerekçe eksiği hesaplıyor");
}
{
  // Göç edilmemiş ağaç da ayna eksikliğidir.
  const k = phase4Readiness(temiz({ trees: olculdu([temizAgac({ inDb: olculdu(false) })]) }));
  check(engelKodlari(k.engeller).includes("ayna-eksik"), "Postgres'te satırı olmayan ağaç engel");
}
{
  /*
   * TERS YÖN sayıya bağlanmıyor: Postgres'te FAZLA kişi olması yayılmamış bir
   * silme olabilir ve hangi tarafın haklı olduğu sayıya bakarak söylenemez.
   * Onu kayıt kayıt bakan kayma denetimi bildirir.
   */
  const k = phase4Readiness(temiz({ trees: olculdu([temizAgac({ dbPeople: olculdu(500) })]) }));
  check(k.hazir === true, "Postgres'te fazla kişi tek başına ayna-eksik sayılmıyor");
}

/* ── 3. Kayma: temiz değilse engel ────────────────────────────────────────── */

{
  const k = phase4Readiness(temiz({ trees: olculdu([temizAgac({ driftClean: olculdu(false) })]) }));
  check(k.hazir === false && engelKodlari(k.engeller).includes("kayma-var"), "kayma varsa engel");
  check(/drift/.test(k.engeller.find((x) => x.kod === "kayma-var")!.ayrinti),
    "gerekçe kullanıcıyı drift ucuna gönderiyor");
}

/* ── 4. ÖLÇÜLEMEDİ ≠ SORUN YOK ────────────────────────────────────────────── */

/*
 * Bu dosyanın en önemli bloğu. Geri dönüşü olmayan bir işin kapısında
 * "bilmiyorum" ile "temiz" aynı şey değildir. Her ölçüm tek tek düşürülüyor.
 */
for (const [ad, agac] of [
  ["Blob sayısı", temizAgac({ blobPeople: olculemedi("Blob okunamadı") })],
  ["Postgres sayısı", temizAgac({ dbPeople: olculemedi("bağlantı düştü") })],
  ["ağaç satırı", temizAgac({ inDb: olculemedi("tree row: timeout") })],
  ["kayma denetimi", temizAgac({ driftClean: olculemedi("people rows: timeout") })],
] as const) {
  const k = phase4Readiness(temiz({ trees: olculdu([agac]) }));
  check(k.hazir === false, `${ad} ölçülemediğinde hazır DEĞİL`);
  check(engelKodlari(k.engeller).includes("olculemedi"), `${ad}: olculemedi kodu engel ağırlığında`);
  check(!engelKodlari(k.engeller).includes("ayna-eksik"),
    `${ad}: ölçülemeyen olgu 'ayna eksik' diye YALAN raporlanmıyor`);
  check(k.engeller.some((e) => e.ayrinti.length > 20), `${ad}: gerekçe düşen ölçümün nedenini taşıyor`);
}
{
  // Envanterin kendisi okunamadıysa da hazır değil.
  const k = phase4Readiness(temiz({ trees: olculemedi("blob list 503") }));
  check(k.hazir === false && engelKodlari(k.engeller).includes("olculemedi"), "ağaç envanteri okunamazsa engel");
  check(/503/.test(k.engeller[0].ayrinti), "envanter hatasının nedeni raporda");
}
{
  const k = phase4Readiness(temiz({ accounts: olculemedi("users.json okunamadı") }));
  check(k.hazir === false && engelKodlari(k.engeller).includes("olculemedi"), "hesap envanteri okunamazsa engel");
}
{
  const k = phase4Readiness(temiz({ accounts: olculdu([temizHesap({ authUser: olculemedi("Auth 500") })]) }));
  check(k.hazir === false, "Auth sorgusu düştüğünde hazır DEĞİL");
  check(!engelKodlari(k.engeller).includes("auth-eksik"),
    "ölçülemeyen Auth sorgusu 'hesap Auth'ta yok' diye raporlanmıyor");
}

/* ── 5. BOŞ ENVANTER TEMİZ DEĞİLDİR ───────────────────────────────────────── */

/*
 * Klasik tuzak: `[].every(clean)` → `true`. Sıfır ağaç "her ağaç temiz"
 * değil, "hiç ölçüm yok" demektir.
 */
{
  const k = phase4Readiness(temiz({ trees: olculdu([]) }));
  check(k.hazir === false, "boş ağaç envanterinde hazır DEĞİL");
  check(engelKodlari(k.engeller).includes("olculemedi"), "boş ağaç envanteri ölçüm yokluğu sayılıyor");
  check(/DEĞİL/.test(k.engeller[0].ayrinti), "gerekçe tuzağı açıkça anlatıyor");
}
{
  const k = phase4Readiness(temiz({ accounts: olculdu([]) }));
  check(k.hazir === false, "boş hesap envanterinde hazır DEĞİL");
  check(engelKodlari(k.engeller).includes("olculemedi"), "boş hesap envanteri ölçüm yokluğu sayılıyor");
}
{
  // Her ikisi de boş: yine de hazır DEĞİL (ve "hiç engel yok" demiyor).
  const k = phase4Readiness({ trees: olculdu([]), accounts: olculdu([]), supabaseLoginEnabled: true, bcryptFallbackEnabled: false });
  check(k.hazir === false && k.sayim.engel === 2, "tamamen boş envanter iki ayrı engel üretiyor");
}

/* ── 6. Auth kapsaması ────────────────────────────────────────────────────── */

{
  const k = phase4Readiness(temiz({
    accounts: olculdu([temizHesap(), temizHesap({ accountId: "x", label: "hesap x", authUser: olculdu(false) })]),
  }));
  check(k.hazir === false && engelKodlari(k.engeller).includes("auth-eksik"), "Auth'ta olmayan hesap engel");
  check(/giriş YAPAMAZ/.test(k.engeller.find((x) => x.kod === "auth-eksik")!.ayrinti),
    "gerekçe sonucu (kilitlenme) söylüyor");
}

/* ── 7. Demo kimlik deposunda ─────────────────────────────────────────────── */

/*
 * ENGELİN ANLAMI TERSİNE ÇEVRİLDİ.
 *
 * Eskiden `demo-acikta` "demonun auth.users kaydı yok" demekti — yani demoyu
 * kimlik sistemine SOKMAYI öneriyordu. Ürün kararı bunun tersi oldu: demo bir
 * hesap değil, bir vitrin (`lib/demo-account.ts`); kimlik sisteminin DIŞINDA
 * durmalı. Artık sorulan soru "demo hâlâ `users.json`da bir hesap satırı
 * olarak duruyor mu".
 *
 * Bu blok o tersine çevrilmeyi kilitliyor: demoyu Auth'a eklemek engeli
 * KALDIRMAMALI, satırın hiç olmaması ise kapıyı yeşile çevirmeli.
 */
{
  const demo = temizHesap({
    accountId: "demo-hesap",
    label: "Demirtaş (demo)",
    isDemo: true,
    hasPasswordHash: true,
    authUser: olculdu(false),
    lastSignInAt: olculdu(null),
  });
  const k = phase4Readiness(temiz({ accounts: olculdu([temizHesap(), demo]) }));
  check(k.hazir === false, "demo kimlik deposunda dururken hazır DEĞİL");
  check(engelKodlari(k.engeller).includes("demo-acikta"), "demo-acikta engeli var");
  check(!engelKodlari(k.engeller).includes("auth-eksik"),
    "demo, sıradan bir 'auth-eksik' olarak raporlanmıyor (ayrı sorun, ayrı çözüm)");
  const e = k.engeller.find((x) => x.kod === "demo-acikta")!;
  check(/users\.json/.test(e.ayrinti), "gerekçe kalıntının nerede durduğunu söylüyor");
  check(/ELLE silinmeli/.test(e.ayrinti), "gerekçe NE YAPILACAĞINI söylüyor (satırı sil)");
}
{
  /*
   * MUTASYON: demo Auth'a aktarılmış. Eski kural bunu "sorun çözüldü" sayardı;
   * yeni kural için hiçbir şey değişmez — demo kalıntısı hâlâ depoda.
   */
  const demo = temizHesap({ accountId: "demo-hesap", isDemo: true, authUser: olculdu(true) });
  const k = phase4Readiness(temiz({ accounts: olculdu([temizHesap(), demo]) }));
  check(k.hazir === false, "demoyu Auth'a eklemek engeli KALDIRMIYOR (yanlış çözüm)");
  check(engelKodlari(k.engeller).includes("demo-acikta"), "Auth kaydı olan demo satırı da engel");
}
{
  /*
   * DOĞRU ÇÖZÜM: demo satırı hiç yok. Kimliksiz demo, kapıya hiç görünmez —
   * `lib/demo-account.ts` artık `users.json`a yazmadığı için beklenen durum bu.
   */
  const k = phase4Readiness(temiz({ accounts: olculdu([temizHesap()]) }));
  check(k.hazir === true, "demo satırı yoksa kapı yeşil");
  check(!kodlar(k.engeller).includes("demo-acikta"), "olmayan satır için engel üretilmiyor");
}
{
  /*
   * Demo, giriş KANITI sayımına girmiyor: Supabase Auth'la hiç girmeyecek,
   * paydayı şişirmesi raporu olduğundan karamsar gösterirdi.
   */
  const demo = temizHesap({
    accountId: "demo-hesap", isDemo: true,
    authUser: olculdu(false), lastSignInAt: olculdu(null),
  });
  const k = phase4Readiness(temiz({ accounts: olculdu([temizHesap(), demo]) }));
  check(!engelKodlari(k.engeller).includes("giris-denenmemis"),
    "gerçek hesabın girişi kanıt sayılıyor, demo kanıtı bozmuyor");
  const k2 = phase4Readiness(temiz({
    accounts: olculdu([temizHesap({ lastSignInAt: olculdu(null) }), demo]),
  }));
  const e2 = k2.engeller.find((x) => x.kod === "giris-denenmemis")!;
  check(/Ölçülen 1 hesabın/.test(e2.ayrinti), "sayım yalnız gerçek kimlikleri sayıyor (demo hariç)");
}

/* ── 8. Giriş hiç denenmemiş ──────────────────────────────────────────────── */

{
  const k = phase4Readiness(temiz({
    accounts: olculdu([temizHesap({ lastSignInAt: olculdu(null) })]),
    supabaseLoginEnabled: false,
    bcryptFallbackEnabled: true,
  }));
  check(k.hazir === false, "hiç Supabase girişi yokken hazır DEĞİL");
  check(engelKodlari(k.engeller).includes("giris-denenmemis"), "giris-denenmemis engeli var");
  const e = k.engeller.find((x) => x.kod === "giris-denenmemis")!;
  check(/SUPABASE_AUTH_LOGIN kapalı/.test(e.ayrinti), "gerekçe bayrağın durumunu söylüyor");
}
{
  // Bayrak AÇIK ama yine hiç giriş yok → yol hâlâ kanıtlanmamış.
  const k = phase4Readiness(temiz({
    accounts: olculdu([temizHesap({ lastSignInAt: olculdu(null) })]),
    supabaseLoginEnabled: true,
  }));
  check(engelKodlari(k.engeller).includes("giris-denenmemis"), "bayrak açık olması giriş kanıtı DEĞİL");
}
{
  // Giriş damgası ÖLÇÜLEMEDİ → kanıt yok → engel (şüphede hazır değil).
  const k = phase4Readiness(temiz({
    accounts: olculdu([temizHesap({ lastSignInAt: olculemedi("liste alınamadı") })]),
  }));
  check(k.hazir === false, "giriş damgası ölçülemediğinde hazır DEĞİL");
  check(/ölçülemedi/.test(k.engeller.find((x) => x.kod === "giris-denenmemis")!.ayrinti),
    "gerekçe kaç hesabın ölçülemediğini söylüyor");
}
{
  // Tek bir hesabın girişi bile yolu kanıtlar.
  const k = phase4Readiness(temiz({
    accounts: olculdu([
      temizHesap({ lastSignInAt: olculdu(null) }),
      temizHesap({ accountId: "b", label: "hesap b", lastSignInAt: olculdu("2026-09-01T00:00:00Z") }),
    ]),
  }));
  check(k.hazir === true, "bir hesabın girişi yolu kanıtlıyor");
}

/* ── 9. Yalnız UYARI varken hazır ─────────────────────────────────────────── */

/*
 * Ayrım olmasaydı kapı hiç açılmazdı ve insanlar kapıyı baypas etmeyi
 * öğrenirdi — hiç kapı olmamasından beter.
 */
{
  const k = phase4Readiness(temiz({ trees: olculdu([temizAgac({ stamp: olculdu(null) })]) }));
  check(k.hazir === true, "damga yokluğu tek başına Faz 4'ü durdurmuyor");
  check(kodlar(k.engeller).includes("damga-yok"), "damga-yok yine de bildiriliyor");
  check(k.sayim.uyari === 1 && k.sayim.engel === 0, "uyarı sayılıyor, engel sayılmıyor");
  check(k.engeller[0].agirlik === "uyari", "damga-yok ağırlığı uyarı");
}
{
  // Bayrak kapalı ama yol daha önce kanıtlanmış → uyarı, engel değil.
  const k = phase4Readiness(temiz({ supabaseLoginEnabled: false, bcryptFallbackEnabled: true }));
  check(k.hazir === false, "kapalı bayrak artık ENGEL: bcrypt tek yol, users.json gidemez");
  check(engelKodlari(k.engeller).includes("yedek-acik"), "yedek-acik engeli var");
  check(kodlar(k.engeller).includes("giris-denenmemis"), "giris-denenmemis uyarısı yine düşüyor");
}
{
  /*
   * Göç edilmemiş ağaçta damga uyarısı ÜRETİLMİYOR: satırı olmayan ağaçta
   * damganın boş olması ayrı bir bulgu değil, `ayna-eksik`in sonucu. Aynı
   * gerçeği iki kez bildirmek raporu gürültüye boğar.
   */
  const k = phase4Readiness(temiz({
    trees: olculdu([temizAgac({ inDb: olculdu(false), stamp: olculdu(null) })]),
  }));
  check(!kodlar(k.engeller).includes("damga-yok"), "göç etmemiş ağaçta damga uyarısı tekrarlanmıyor");
}

/* ── 10. Saflık: aynı olgular aynı kararı verir ───────────────────────────── */

{
  const o = temiz({ trees: olculdu([temizAgac({ driftClean: olculdu(false) })]) });
  const a = phase4Readiness(o);
  const b = phase4Readiness(o);
  check(JSON.stringify(a) === JSON.stringify(b), "karar tekrarlanabilir (saf)");
}

/* ── 11. Bugünkü ÜRETİM durumu (2026-09-07 ölçümü) ────────────────────────── */

/*
 * Belgede yazan üç engelin kapıdan gerçekten üçü birden çıktığını
 * gösteriyor. Bu, dosyanın hem regresyon testi hem de belgesi.
 */
{
  const k = phase4Readiness({
    trees: olculdu([
      temizAgac({ treeId: "demo-hesap", name: "demo", blobPeople: olculdu(366), dbPeople: olculdu(366), stamp: olculdu(null) }),
      temizAgac({ treeId: "misafir", name: "Misafir ağacı", blobPeople: olculdu(7), dbPeople: olculdu(7), stamp: olculdu(null) }),
      temizAgac({ treeId: "pirci", name: "Pirci", blobPeople: olculdu(0), dbPeople: olculdu(0), stamp: olculdu(null) }),
    ]),
    accounts: olculdu([
      temizHesap({ lastSignInAt: olculdu(null) }),
      temizHesap({ accountId: "demo-hesap", label: "Demirtaş (demo)", isDemo: true, authUser: olculdu(false), lastSignInAt: olculdu(null) }),
    ]),
    supabaseLoginEnabled: false,
    bcryptFallbackEnabled: true,
  });
  check(k.hazir === false, "üretim durumu: Faz 4 HAZIR DEĞİL");
  const e = new Set(engelKodlari(k.engeller));
  check(e.has("demo-acikta"), "üretim: demo satırı hâlâ users.json'da (elle temizlenecek kalıntı)");
  check(e.has("giris-denenmemis"), "üretim: Supabase girişi hiç yapılmamış");
  check(k.sayim.uyari === 3, "üretim: üç ağacın damgası uyarı olarak düşüyor");
}


/* ── 12. Bcrypt yedeği açıkken Faz 4 durur ────────────────────────────────── */
/*
 * Kalan parça `users.json`ı emekliye ayırıyor — bcrypt yolunun OKUDUĞU
 * dosyayı. Yedek açıkken yapılırsa geriye çalışan bir giriş yolu kalmayabilir.
 */

{
  const k = phase4Readiness(temiz({ bcryptFallbackEnabled: true }));
  check(k.hazir === false, "yedek açıkken hazır DEĞİL");
  check(engelKodlari(k.engeller).includes("yedek-acik"), "yedek-acik ENGEL ağırlığında");
  const e = k.engeller.find((x) => x.kod === "yedek-acik")!;
  check(/AUTH_BCRYPT_FALLBACK açık/.test(e.ayrinti),
    "bayrak açıkken gerekçe 'acil durum anahtarı kullanımda' diyor");
  check(/users\.json/.test(e.ayrinti), "gerekçe hangi dosyanın gittiğini söylüyor");
}
{
  // Aynı engel, ÖTEKİ sebeple: Supabase girişi kapalı → bcrypt zaten tek yol.
  const k = phase4Readiness(temiz({ supabaseLoginEnabled: false, bcryptFallbackEnabled: true }));
  const e = k.engeller.find((x) => x.kod === "yedek-acik")!;
  check(/SUPABASE_AUTH_LOGIN kapalı/.test(e.ayrinti), "öteki sebep ayrı anlatılıyor (onarımı farklı)");
  check(!/AUTH_BCRYPT_FALLBACK/.test(e.ayrinti), "yanlış onarıma yönlendirmiyor");
}
{
  /*
   * `giris-denenmemis`in kapatamadığı boşluk: geçmişte bir Supabase girişi
   * VAR (yani o denetim yalnız uyarı veriyor) ama bayrak bugün kapalı.
   * Kapı bunu artık durduruyor.
   */
  const k = phase4Readiness(temiz({ supabaseLoginEnabled: false, bcryptFallbackEnabled: true }));
  const gd = k.engeller.find((x) => x.kod === "giris-denenmemis");
  check(gd?.agirlik === "uyari", "eski denetim hâlâ yalnız uyarı veriyor");
  check(k.hazir === false, "ama yeni denetim kapıyı kapatıyor (boşluk kapandı)");
}
{
  // Yedek kapalıyken hiçbir şey eklenmiyor.
  const k = phase4Readiness(temiz());
  check(k.hazir === true, "yedek kapalıyken hazır");
  check(!kodlar(k.engeller).includes("yedek-acik"), "yedek kapalıyken kod hiç görünmüyor");
}


/* ── 13. Kimlik kayması Faz 4'ü durduruyor ────────────────────────────────── */
/*
 * Kalan parça okuma yolunu Postgres'e çeviriyor; ayna yanlışsa o an hesabın
 * KENDİSİ yanlış olur. Ölçüm alan düzeyinde, çünkü eksiklik satır düzeyinde
 * görünmüyor: `session_epoch` boş bir satır "eksik" değil "çağ yok" diye
 * okunur ve şifre sıfırlamanın oturum düşürme koruması sessizce ölür.
 */

{
  const k = phase4Readiness(temiz({
    accounts: olculdu([temizHesap({
      aynaKaymasi: olculdu({ aynadaVar: true, ayrisan: ["sessionEpoch", "recoveryCodeIndex"] }),
    })]),
  }));
  check(k.hazir === false, "alan ayrışmasında hazır DEĞİL");
  check(engelKodlari(k.engeller).includes("kimlik-kaymasi"), "kimlik-kaymasi engeli var");
  const e = k.engeller.find((x) => x.kod === "kimlik-kaymasi")!;
  check(/sessionEpoch/.test(e.ayrinti) && /recoveryCodeIndex/.test(e.ayrinti),
    "gerekçe HANGİ alanların ayrıştığını sayıyor");
}
{
  // Satırın hiç olmaması ayrı bir cümle hak ediyor: alan listesi anlamsız.
  const k = phase4Readiness(temiz({
    accounts: olculdu([temizHesap({ aynaKaymasi: olculdu({ aynadaVar: false, ayrisan: [] }) })]),
  }));
  check(engelKodlari(k.engeller).includes("kimlik-kaymasi"), "aynada satır yoksa da engel");
  const e = k.engeller.find((x) => x.kod === "kimlik-kaymasi")!;
  check(/satırı YOK/.test(e.ayrinti), "gerekçe satırın yokluğunu söylüyor");
}
{
  // Ölçülemedi ≠ temiz.
  const k = phase4Readiness(temiz({
    accounts: olculdu([temizHesap({ aynaKaymasi: olculemedi("ağ hatası") })]),
  }));
  check(k.hazir === false, "ayna ölçülemediğinde hazır DEĞİL");
  check(engelKodlari(k.engeller).includes("olculemedi"), "ölçülemedi olarak bildiriliyor");
}
{
  /*
   * Auth denetiminden AYRI: bir hesabın Auth kaydı olup aynası bozuk
   * olabilir. `continue` ile Auth dalına bağlansaydı o durum hiç
   * raporlanmazdı.
   */
  const k = phase4Readiness(temiz({
    accounts: olculdu([temizHesap({
      authUser: olculdu(true),
      aynaKaymasi: olculdu({ aynadaVar: true, ayrisan: ["passwordHash"] }),
    })]),
  }));
  check(engelKodlari(k.engeller).includes("kimlik-kaymasi"),
    "Auth temizken bile ayna kayması bildiriliyor");
}
{
  const k = phase4Readiness(temiz());
  check(k.hazir === true, "ayna temizken hazır");
  check(!kodlar(k.engeller).includes("kimlik-kaymasi"), "temizken kod hiç görünmüyor");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
