import { readFileSync, readdirSync } from "node:fs";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
/** Yorumları ayıkla: kuralı ANLATAN metin, kuralın kanıtı değildir. */
const kodu = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * KAPI: dokunma hedefleri ve ölçekten bağımsız afordanslar (denetim G/H).
 *
 * Bu bölümdeki bulguların ortak yanı, hiçbirinin bir hata üretmemesi:
 * düğme oradadır, tıklanabilir görünür, ama parmakla basılamaz ya da başka
 * bir şeyin altında kalır. Test koşusu bunu göremez, tarayıcı ölçümü görür.
 * Ölçüm yapıldı ve düzeltildi; burası düzeltmenin geri alınmasını yakalıyor.
 *
 * Piksel ölçmüyor (ölçemez de) — düzeltmeyi TAŞIYAN mekanizmaları
 * kilitliyor: ortak onay kutusu sınıfı, ters-ölçekleme değişkeni, denetim
 * kümesinin konumu ve dokunma boyutlarının sınıfı.
 */

const css = read("../app/globals.css");

/* ══ 1. Ortak onay kutusu ═════════════════════════════════════════════════ */
/*
 * Tarayıcının yerel kutusu 13x13px çiziliyor — 24px'lik asgari hedefin çok
 * altında ve Takvim sekmesinde tek ekranda 363 tanesi vardı.
 */
check(/^\.ui-check \{/m.test(css), "ortak onay kutusu sınıfı tanımlı");
check(/\.ui-check[\s\S]{0,400}?width: 18px/.test(css), "kutu 18px");
check(/\.ui-check:checked/.test(css), "işaretli hâl çiziliyor");
check(/\.ui-check:indeterminate/.test(css), "belirsiz hâl çiziliyor (toplu seçim)");
check(/\.ui-check:disabled/.test(css), "kapalı hâl ayırt ediliyor");
{
  /*
   * HER onay kutusu ortak sınıfı kullanmalı. İddia dosya dosya geziyor:
   * "bir yerde ui-check var" demek, on dosyadan dokuzunun 13px kalmasına
   * izin verirdi — nitekim ilk turda iki dosya (ShareDialog, ProposalsDialog)
   * tam olarak böyle atlanmıştı.
   */
  const dizinler = ["../components", "../components/ui", "../app"];
  const eksik: string[] = [];
  const gez = (d: string) => {
    for (const ad of readdirSync(new URL(d + "/", import.meta.url), { withFileTypes: true })) {
      if (ad.isDirectory()) { gez(`${d}/${ad.name}`); continue; }
      if (!ad.name.endsWith(".tsx")) continue;
      const src = kodu(read(`${d}/${ad.name}`));
      for (const m of src.matchAll(/type="checkbox"/g)) {
        /*
         * JSX'te `className` aynı satırda olmayabilir; öznitelik bloğunun
         * tamamına bakılıyor. Pencere geniş tutuldu (çok satırlı `onChange`
         * gövdeleri araya giriyor): dar bir pencere, sınıfı TAŞIYAN bir
         * kutuyu eksik sayıp sahte kırmızı üretiyordu.
         */
        const blok = src.slice(Math.max(0, m.index! - 400), m.index! + 900);
        if (!/ui-check/.test(blok)) eksik.push(`${d}/${ad.name}`);
      }
    }
  };
  for (const d of dizinler) gez(d);
  check(eksik.length === 0, `her onay kutusu ui-check kullanıyor (eksik: ${[...new Set(eksik)].join(", ")})`);
}

/* ══ 2. AÇILIŞ ÖLÇEĞİ ve hızlı-ekle düğmeleri (B3) ══════════════════════ */
/*
 * ÖLÇÜLEN ÖNCEKİ HÂL (366 kişilik demo, ilk açılan ekran, `fitView`):
 *   320 → ölçek 0.164, kart 23x21, 13px ad ekranda 2.1px, nub 8.8px
 *   390 → 0.199, 28x25, 2.6px, nub 10.7 (seçiliyken 14.3)
 *   768 → 0.267, 37x34, 3.5px, nub 14.4
 *  1440 → 0.277, 39x35, 3.6px, nub 15 (seçiliyken 20)
 *
 * Yani uygulamanın İLK AÇILDIĞI hâlde ne kart adı okunuyor ne de kişi
 * eklenebiliyordu. Eski `.ft-nub` yorumu "0.2 ölçekte ~18px" diyordu;
 * ölçüm 10.7 verdi — iddia hiç doğrulanmamıştı (tam telafi 5x gerekiyor,
 * üst sınır 3x).
 *
 * ÜRÜN KARARI (gerekçesi FamilyTree.tsx `ACILIS_OLCEGI` bloğunda):
 * açılışta SIĞDIRMA YOK; odak kişi 1:1 ölçekte ortalanıyor. "Hepsini gör"
 * zaten bir düğme ("Tümünü sığdır") ve orası kısıtlanmadı.
 *
 * ÖLÇÜLEN SONRAKİ HÂL (aynı dört genişlik): ölçek 1.000, kart 140x126,
 * ad ekranda 13px, seçili kartın nub'ı 44x44 (1440'ta `lg` olduğu için
 * fareye göre 24). Ölçek 0.8'in altına indiğinde nub `display:none`.
 *
 * Bu bölüm o kararı KİLİTLER: sığdırmaya geri dönmek, tabanı düşürmek ya
 * da basılamayan nub'ları geri getirmek testi kırar.
 */
{
  const ft = kodu(read("../components/FamilyTree.tsx"));
  check(/const ACILIS_OLCEGI = 1;/.test(ft), "açılış ölçeği okunur tabanda (1:1)");
  check(/const NUB_ESIGI = 0\.8;/.test(ft), "nub çizim eşiği tanımlı");
  /*
   * Açılış kamerası `fitView` OLMAMALI. İddia doğrudan `onInit`e bakıyor:
   * "bir yerde setCenter var" demek, onInit'in yine sığdırmasına izin
   * verirdi — düzeltilen arızanın tam olarak kendisi.
   */
  check(/const onInit = useCallback\(\(\) => \{[\s\S]{0,160}?okunurKamera\(0\)/.test(ft),
    "açılışta odak kişi ortalanıyor (fitView değil)");
  check(/setCenter\([\s\S]{0,120}?zoom: ACILIS_OLCEGI/.test(ft), "ortalama okunur ölçekte yapılıyor");
  check(!/fitView\(\{ padding: 0\.15, duration: first/.test(ft), "küme değişince de sığdırmaya düşmüyor");
  /* Ama KULLANICININ istediği "tümünü sığdır" kısıtlanmadı — yetenek duruyor. */
  check(/onClick=\{\(\) => fitView\(\{ padding: 0\.15, duration: 400 \}\)\}/.test(ft),
    "\"Tümünü sığdır\" düğmesi hâlâ kısıtsız sığdırıyor");

  check(/setProperty\("--ft-zoom"/.test(ft), "ölçek CSS değişkenine yazılıyor");
  check(/dataset\.ftNub = z >= NUB_ESIGI/.test(ft), "nub görünürlüğü de aynı yerden duyuruluyor");
  /*
   * İki yoldan da yazılmalı. Yalnız `onMove`a bağlansaydı, kullanıcı tuvale
   * hiç dokunmadığı sürece — yani tam da açılış hâlinde — değişkenler hiç
   * yazılmazdı.
   */
  check(/onMove=\{[^}]*yayinlaOlcek/.test(ft), "kullanıcı zoom'unda yazılıyor");
  check(/okunurKamera = useCallback\([\s\S]{0,400}?yayinlaOlcek\(ACILIS_OLCEGI\)/.test(ft),
    "kamera oynayınca da yazılıyor");
}
check(/^\.ft-nub \{/m.test(css), "ters-ölçekleme sınıfı tanımlı");
check(/var\(--ft-zoom/.test(css), "sınıf tuval ölçeğini okuyor");
check(/clamp\(1,/.test(css), "büyütme alt/üst sınırla kısıtlı (düğme kartı yutmasın)");
/*
 * Ve eşiğin altında nub HİÇ çizilmiyor: basılamayan bir hedef, olmayan
 * hedeften kötüdür — kullanıcı deniyor ve olmuyor. Seçicinin `.react-flow`
 * ile daraltılmış olması da iddianın parçası: öznitelik `:root`ta duruyor,
 * daraltılmasaydı Soy görünümündeki nub'lar ağacın bayat ölçeği yüzünden
 * kaybolurdu.
 */
check(/:root\[data-ft-nub="kapali"\] \.react-flow \.ft-nub \{\s*display: none;/.test(css),
  "eşik altında nub çizilmiyor (ve kural yalnız tuvale ait)");
{
  const pn = kodu(read("../components/PersonNode.tsx"));
  check(/ft-nub/.test(pn), "kart düğmeleri sınıfı taşıyor");
  check(/w-11 h-11 lg:w-6 lg:h-6/.test(pn), "nub kutusu dokunmada 44, farede 24");
  /* Kaydırma da ikiye ayrılmalı: tek değer bırakılsaydı nub bir boyda
     kartın kenarında, öbüründe havada kalırdı. */
  check(/-top-\[22px\] lg:-top-3/.test(pn) && /-bottom-\[22px\] lg:-bottom-3/.test(pn),
    "nub kaydırması kutu boyuyla birlikte değişiyor");
}

{
  /*
   * Aynı karar Soy görünümünde de geçerli: oradaki "bu kişiyi merkeze al"
   * nub'ı da kendi `scale()`inin altında ve 390px'te ekranda 7px'e iniyordu.
   * Eşik TEK yerden geliyor — iki ayrı sayı zamanla ayrışırdı.
   */
  const pv = kodu(read("../components/PedigreeView.tsx"));
  check(/import \{ NUB_ESIGI \} from "\.\/FamilyTree"/.test(pv), "Soy görünümü eşiği paylaşıyor");
  check(/nubGoster: olcek >= NUB_ESIGI/.test(pv), "eşik altında nub çizilmiyor");
  check(/\{!isRoot && nubGoster && \(/.test(pv), "karar gerçekten çizime bağlı");
}

/* ══ 3. Tuval denetimlerinin dokunma boyu ═══════════════════════════════ */
/*
 * Küme `!bottom-24` ile ekranın altından 96px yukarıdaydı ve tek sütun
 * hâlinde 28x106px yer kaplıyordu. Ölçek ~0.2'ye düştüğünde bir kişi kartı
 * 28x25px olduğu için sütun TAM DÖRT KARTI örtüyor, o kartlar hiç
 * açılamıyordu — sessiz bir arıza: tıklama gidiyor, hiçbir şey olmuyor.
 *
 * KONUM İDDİASI BURADAN TAŞINDI: küme artık tuvalin köşesinde değil, kendi
 * satırında (bkz. `canvas-chrome-gate.test.mts`). Burada kalan, o onarımın
 * DİĞER yarısı: düğmelerin dokunma boyu. React Flow'un `ControlButton`ı
 * `Controls` sarmalayıcısı olmadan da kullanılıyor, dolayısıyla boyu veren
 * kural hâlâ tek başına ayakta durmak zorunda.
 */
{
  const ft = kodu(read("../components/FamilyTree.tsx"));
  check(/<ControlButton/.test(ft), "tuval düğmeleri ControlButton olarak duruyor");
  check(/\.react-flow__controls-button[\s\S]{0,300}?width: 44px/.test(css), "düğmeler dokunma boyunda");
  check(/@media \(min-width: 1024px\)[\s\S]{0,400}?\.react-flow__controls-button[\s\S]{0,200}?width: 36px/.test(css),
    "farede kompakt (36px)");
}

/* ══ 4. Zorunlu alan uyarısı, kullanıcı bir şey yapmadan ÇIKMIYOR ════════ */
/*
 * Etiket alanı boş açıldığı için uyarı ilk çizimde zaten görünüyordu:
 * kullanıcı tek harf yazmadan hata almış oluyordu. Bir formun, doldurulmasını
 * isterken doldurulmadığı için uyarması, uyarıyı gürültüye çevirir.
 */
{
  const sd = kodu(read("../components/ShareDialog.tsx"));
  check(/const labelWarn = labelMissing && dokunuldu;/.test(sd), "uyarı dokunmaya bağlı");
  check(/\{labelWarn && <p/.test(sd), "metin dokunmadan önce çizilmiyor");
  check(!/\$\{labelMissing \? "border-amber/.test(sd), "kenarlık da dokunmadan önce kehribar değil");
  /*
   * Ve düğme KAPALI DEĞİL: kapalı düğme sebebini söylemiyor, kullanıcı
   * alana hiç uğramadıysa neyi eksik bıraktığını hiç öğrenemiyordu.
   */
  check(!/disabled=\{busy \|\| labelMissing/.test(sd), "düğme etiket yüzünden kapatılmıyor");
  check(/if \(!label\.trim\(\)\) \{ setDokunuldu\(true\); return; \}/.test(sd),
    "basınca uyarı açılıyor ve oluşturma yapılmıyor");
}

/* ══ 5. GENEL YÜZEYİN dokunma hedefleri ═════════════════════════════════ */
/*
 * #307 uygulamanın İÇİNİ ölçmüştü (üst çubuk, tuval, çekmece). Oturum
 * AÇMADAN görülen yüzey — açılış/tanıtım, kimlik ekranları, hukuki sayfalar —
 * o turda ölçülmemişti ve 320/360/390'da tekrar eden beş hedef eşik altındaydı:
 *
 *   alt bilgi bağlantıları   27-105 x 18   (landing, /tanitim)
 *   TR / EN dil düğmeleri    30 x 28       (her sayfa)
 *   tema düğmesi             36 x 36       (/login /register /privacy /terms /g)
 *   SSS <summary> başlıkları 246-316 x 24  (landing #sss)
 *   "Kurtarma kodu"/"E-posta" 108-143 x 32 (/forgot-password)
 *
 * Hepsi #307'nin kalıbıyla onarıldı: KUTUNUN KENDİSİ büyüyor (`min-h-11` /
 * `h-11` / `min-w-11`), `lg` üstünde eski sıkı ölçü geri geliyor. Görünmez
 * `::before` vuruş alanı bilerek kullanılmadı: alt bilgi bağlantıları dikey
 * bir sütunda 8px arayla dizili, görünmez kutular komşusunun üstüne taşar ve
 * üstteki dokunuşu yutardı — #307'nin H2/H5'te onardığı arızanın aynısı.
 *
 * Ölçüm sonrası (320/360/390/768): beş kalemin hepsi >= 44px; 1024+ eski
 * ölçüler (28/36/24/32) geri geliyor.
 */
{
  const land = kodu(read("../components/Landing.tsx"));
  /* Alt bilgi bağlantıları TEK bir sınıf sabitinden geliyor — on çağrı yerine
     tek tek `min-h-11` yazılsaydı biri unutulur, kimse fark etmezdi. */
  check(/const footLink =/.test(land), "alt bilgi bağlantıları ortak sınıf sabitinden geliyor");
  const fl = land.match(/const footLink =([\s\S]*?);\n/)?.[1] ?? "";
  check(/min-h-11/.test(fl) && /min-w-11/.test(fl), "alt bilgi bağlantısı dokunma boyunda");
  check(/lg:min-h-0/.test(fl), "farede (lg) eski sıkı yerleşim geri geliyor");
  check(/-mx-2 px-2/.test(fl), "kutu büyürken metin hizası korunuyor (negatif kenar boşluğu)");
  /* Ve HER alt bilgi bağlantısı o sabiti kullanmalı: "bir yerde footLink var"
     demek, on bağlantıdan dokuzunun 18px kalmasına izin verirdi. */
  const footStart = land.indexOf("<footer");
  const foot = footStart > -1 ? land.slice(footStart) : "";
  const kacirilan = [...foot.matchAll(/<(?:a|Link|button)\b[^>]*className="[^"]*"/g)]
    .filter((m) => !/footLink/.test(m[0]));
  check(footStart > -1 && kacirilan.length === 0,
    `alt bilgideki her bağlantı ortak sınıfı taşıyor (kaçan: ${kacirilan.map((m) => m[0].slice(0, 50)).join(" | ")})`);
  /* SSS başlığı: açma/kapama TEK afordans, eşiğin altında kalması "SSS
     mobilde açılmıyor" demekti. */
  check(/<summary className="[^"]*min-h-11 lg:min-h-0/.test(land), "SSS başlıkları dokunma boyunda");
  /* Üst bardaki iki CTA: YÜKSEKLİK büyütmek yatay bütçeye dokunmuyor, o
     yüzden 320px'teki denge (bkz. 7. bölüm) bozulmadan 36 → 44 oldu. */
  check((land.match(/h-11 lg:h-9/g) ?? []).length >= 2, "üst bardaki giriş/kayıt düğmeleri dokunma boyunda");
}
{
  /*
   * Kimlik ekranlarının ÇIKIŞ yolları: "Şifremi unuttum" 98x18, "Hesap
   * oluştur" 96x18, "Giriş sayfasına dön" 131x18 idi. Kural üç sayfaya ayrı
   * ayrı değil, yuvayı sağlayan SARMALAYICIYA yazıldı — yuvayı dolduran her
   * yeni sayfa ölçüyü kendiliğinden alsın.
   */
  const as = kodu(read("../components/AuthShell.tsx"));
  check(/\[&_a\]:min-h-11/.test(as), "AuthShell alt yuvasındaki bağlantılar dokunma boyunda");
  check(/lg:\[&_a\]:min-h-0/.test(as), "farede (lg) eski yerleşim geri geliyor");
  check(/h-11 lg:h-9 pl-2 pr-3/.test(as), "\"Ana sayfa\" dönüş bağlantısı dokunma boyunda");
  const lp = kodu(read("../components/LegalPage.tsx"));
  check(/min-h-11 lg:min-h-0/.test(lp), "hukuki sayfada marka bağlantısı dokunma boyunda");
  check(/h-11 lg:h-10/.test(lp), "hukuki sayfanın TEK çıkış düğmesi dokunma boyunda");
}
{
  const tt = kodu(read("../components/ThemeToggle.tsx"));
  check(/w-11 h-11 lg:w-9 lg:h-9/.test(tt), "tema düğmesi dokunmada 44, farede 36");
  const ls = kodu(read("../components/LanguageSwitch.tsx"));
  check(/h-11 min-w-11 lg:h-7 lg:min-w-0/.test(ls), "dil düğmeleri dokunmada 44, farede 30x28");
  const fg = kodu(read("../app/forgot-password/ForgotForm.tsx"));
  check(/min-h-11 lg:min-h-0/.test(fg), "kurtarma yolu sekmeleri dokunma boyunda");
}

/* ══ 6. Alt bilgideki segment kontrolü sütunu DOLDURMUYOR ════════════════ */
/*
 * Blok düzeyinde bir `display:flex` kutusu kapsayıcısının genişliğini
 * doldurur. Üst çubukta görünmüyordu (orada kendisi bir flex ÖĞESİ: her
 * genişlikte 69-71px), ama alt bilginin dikey sütununda kutu 320px'te 288,
 * 768px'te 344, 1024px'te 170, 1440px'te 195px'e yayılıp içinde iki küçük
 * düğmenin sola sıkıştığı boş gri bir çubuğa dönüşüyordu.
 *
 * Çözüm `w-fit`; `inline-flex` DEĞİL. Sebebi ölçüldü: Tailwind'in ürettiği
 * sırada `.inline-flex`, çağrı yerlerinin görünürlük için kullandığı
 * `.hidden`i eziyor — denemede dil anahtarı 320px'te üst barda çizilip belgeyi
 * 425px'e taşırdı. `.flex` `.hidden`in altında kalıyor.
 * Ölçüm sonrası: sarmalayıcı her genişlikte 96px (fare: 71px).
 */
{
  const ls = kodu(read("../components/LanguageSwitch.tsx"));
  const kok = ls.match(/className=\{`([^`]*)\$\{className\}`\}/)?.[1] ?? "";
  check(/\bw-fit\b/.test(kok), `dil anahtarı içeriğine göre daralıyor (kök sınıf: ${kok.trim()})`);
  check(!/\binline-flex\b/.test(kok), "kök `inline-flex` değil (çağrı yerlerindeki `hidden`i ezerdi)");
}

/* ══ 7. En dar ekranda üst bar TAŞMIYOR ═════════════════════════════════ */
/*
 * Tema düğmesi (44px) üst bara girince 320px'te 3px taşma ÖLÇÜLDÜ; boşluklar
 * `sm` altında 8→4 ve 6→4'e indirilerek 10px kazanıldı. Ölçüm sonrası
 * 320/360/390'da taşma 0 ve "Hesap oluştur"un sağ kenarı TR'de 315, EN'de
 * 306 (viewport 320). Boşluklar geri büyütülürse taşma geri gelir.
 */
{
  const land = kodu(read("../components/Landing.tsx"));
  check(/h-16 flex items-center gap-1 sm:gap-4/.test(land), "üst bar dış boşluğu dar ekranda 4px");
  check(/ml-auto lg:ml-0 shrink-0 flex items-center gap-1 sm:gap-2/.test(land), "sağ küme boşluğu dar ekranda 4px");
  /* Ve tema düğmesi gerçekten HER genişlikte çiziliyor: `hidden` ile
     gizlenmiş bir düğme erişim değildir (bulgu 10'un tam hâli). */
  check(/<ThemeToggle className="shrink-0" \/>/.test(land), "tema düğmesi üst barda mobilde de görünür");
  check(/<LanguageSwitch \/>[\s\S]{0,80}<ThemeToggle \/>/.test(land), "alt bilgide dil + tema birlikte");
}

/* ══ 8. GÖRÜNÜMLERİN İÇİ — dokunma hedefleri (B7) ═══════════════════════ */
/*
 * #329 uygulamanın GENEL yüzeyini ölçmüştü (açılış, kimlik, hukuki
 * sayfalar); görünümlerin İÇİ taranmamıştı ve orada 69 ayrı desen eşiğin
 * altındaydı. 390px'te ölçülen en çok değenler:
 *
 *   32px  "Düzenle / Merkeze al / Ortala / Çevre grafiği / Sil"  (PersonDrawer)
 *   32px  "Tarif ekle / Mektup yaz / Duyuru ekle / Etkinlik ekle" (ilgili görünümler)
 *   32x32 pencere kapatma düğmesi — on iki pencerenin hepsi
 *   28x28 "Takvime ekle" (takvimde 64 örnek), kuşak −/+, kardeş sırası ▲▼
 *   27-28 liste/harita/istatistik süzgeç etiketleri
 *   256x28 kök seçici (`soy`, `yelpaze`)
 *   16px  "Ebeveyn/Eş/Çocuk/Bağ/Yakın çevre ekle" (PersonDrawer, >=1024)
 *   18x18 tablodaki "Tümünü seç"; 20x20 sütun süzgeçleri
 *
 * Onarımın kalıbı #329 ile aynı: KUTUNUN KENDİSİ büyüyor (`h-11` /
 * `min-h-11`), `lg` üstünde eski sıkı ölçü geri geliyor. Görünmez `::before`
 * vuruş alanı burada da reddedildi ve gerekçe #329'dakiyle aynı kaldı: tablo
 * satırları 34px, takvim satırları 28px arayla diziliyor; görünmez kutu
 * komşusunun üstüne taşar ve üstteki satırın dokunuşunu yutardı. Yer KAPLAYAN
 * bir kutu taşmaz, iter.
 *
 * Ölçüm sonrası (390px, on üç sekme taranarak): eşik altında kalan tek
 * etkileşimli desen, veri işareti olan histogram çubukları (genişlik veriden
 * geliyor) ve Leaflet'in kendi künye bağlantısı.
 */
{
  /*
   * Asıl kaldıraç burada: 69 bulgunun onu tek bir dosyadan geliyordu, çünkü
   * `Button` `sm`i 32px, `md`yi 40px çiziyordu. Çağrı yerlerine tek tek
   * `h-11` yazmak, on ikisinden birini unutmakla eşdeğerdi.
   */
  const btn = kodu(read("../components/ui/Button.tsx"));
  check(/sm: "h-11 lg:h-8 /.test(btn), "Button `sm` dokunmada 44, farede 32");
  check(/md: "h-11 lg:h-10 /.test(btn), "Button `md` dokunmada 44, farede 40");

  /* Pencere kapatma düğmesi TEK yerde — on iki çağıran onu paylaşıyor. */
  const modal = kodu(read("../components/ui/Modal.tsx"));
  check(/w-11 h-11 lg:w-8 lg:h-8/.test(modal), "pencere kapatma düğmesi dokunma boyunda");

  /* Kök seçici ve kuşak sayacı da paylaşılan denetimler (soy + yelpaze). */
  const rs = kodu(read("../components/RootSelect.tsx"));
  check(/h-11 lg:h-7/.test(rs), "kök seçici dokunma boyunda");
  const gs = kodu(read("../components/GenerationStepper.tsx"));
  check(/w-11 h-11 lg:w-7 lg:h-7/.test(gs), "kuşak −/+ düğmeleri dokunma boyunda");
  check(/w-11 h-11 lg:h-7/.test(gs), "kuşak alanı dokunma boyunda");

  /* Takvim satırındaki "Takvime ekle" — 64 örnekle en çok tekrar eden hedef. */
  const ca = kodu(read("../components/CalendarAdd.tsx"));
  check(/w-11 h-11 lg:w-7 lg:h-7/.test(ca), "\"Takvime ekle\" dokunma boyunda");

  /*
   * PersonDrawer'daki metin-düğmeleri. Bunlar zaten `min-h-11` taşıyordu ama
   * `lg:min-h-0` ile MASAÜSTÜNDE 16px'e dönüyorlardı — ve kişi eklemenin
   * panel üzerindeki tek yolu bunlar. "lg'de eski ölçü" kuralı, eski ölçü
   * kullanılabilir olduğunda geçerli; 16px değil.
   */
  const pd = kodu(read("../components/PersonDrawer.tsx"));
  check(!/lg:min-h-0/.test(pd), "panelde `lg` altında 16px'e dönen düğme kalmadı");
  check(/min-h-11 lg:min-h-8/.test(pd), "\"Ebeveyn/Eş/Çocuk ekle\" farede de 32px");
  check(/w-11 h-11 lg:w-7 lg:h-7/.test(pd), "kardeş sırası ▲▼ dokunma boyunda");
  const bs = kodu(read("../components/BondSection.tsx"));
  check(/min-h-11 lg:min-h-8/.test(bs), "\"Bağ ekle\" farede de 32px");

  /*
   * Onay kutusunun VURUŞ kutusu. `.ui-check` görsel olarak 18px kalıyor
   * (44px'lik bir tik kutusu formu tanınmaz hâle getirirdi); hedefi büyüten
   * şey onu saran gerçek yerleşim kutusu.
   */
  check(/^\.ui-check-hit \{/m.test(css), "çıplak onay kutusunun vuruş kutusu tanımlı");
  check(/\.ui-check-hit[\s\S]{0,200}?min-height: 44px/.test(css), "vuruş kutusu 44px");
  check(/@media \(min-width: 1024px\)[\s\S]{0,200}?\.ui-check-hit[\s\S]{0,120}?min-height: 0/.test(css),
    "farede eski yerleşim geri geliyor");
  const tv = kodu(read("../components/TableView.tsx"));
  check((tv.match(/ui-check-hit/g) ?? []).length >= 2, "tablodaki çıplak kutular (tümünü seç + satır) sarılı");
  check(/w-11 h-11 lg:w-5 lg:h-5/.test(tv), "sütun süzgeci düğmesi dokunma boyunda");

  /* Kaydırıcılar ve Leaflet'in kendi düğmeleri — ikisi de JSX'ten değil
     CSS'ten büyüyor, çünkü biri yerel denetim biri üçüncü taraf. */
  check(/^\.ui-range \{[\s\S]{0,80}?height: 44px/m.test(css), "kaydırıcı kutusu dokunma boyunda");
  check(/\.leaflet-bar a[\s\S]{0,120}?height: 44px/.test(css), "harita yakınlaştırma düğmeleri dokunma boyunda");
}

/* ══ 9. BAŞLIK HİYERARŞİSİ (B9) ═════════════════════════════════════════ */
/*
 * Ölçülen önceki hâl (390px, sekme sekme `h1..h6` sayımı):
 *   agac / cevre / soy / yelpaze / liste → HİÇ başlık yok (0 adet)
 *   takvim → `h1` yok, `h2` ile başlıyor
 *   istatistik → iki kez `h2 → h4` atlaması
 *
 * Yani ekran okuyucunun başlık gezinmesi uygulamanın ASIL görünümlerinde
 * tamamen boştu: "hangi sayfadayım" sorusunun cevabı yoktu.
 *
 * Kural: her görünüm bileşeni KENDİ `h1`ini çizer. Metin sekme şeridiyle
 * aynı sözlük anahtarından geliyor, böylece ikisi ayrışamıyor. Görsel
 * gürültü eklenmedi: dördü `sr-only` (şerit aynı bilgiyi zaten gözle
 * veriyor), `cevre`de ise VAR OLAN görünür başlık `p`den `h1`e çevrildi —
 * gizli bir ikinci başlık eklemek yerine mevcut olanı doğru etiketlemek.
 */
{
  const gorunumler: Array<[string, string]> = [
    ["../components/FamilyTree.tsx", "view.agac.label"],
    ["../components/PedigreeView.tsx", "view.soy.label"],
    ["../components/FanChart.tsx", "view.yelpaze.label"],
    ["../components/ListView.tsx", "view.liste.label"],
    ["../components/CalendarView.tsx", "view.takvim.label"],
  ];
  for (const [f, anahtar] of gorunumler) {
    const src = kodu(read(f));
    check(new RegExp(`<h1 className="sr-only">\\{t\\("${anahtar.replace(/\./g, "\\.")}"\\)\\}</h1>`).test(src),
      `${f.replace("../components/", "")}: görünümün sr-only h1'i var`);
  }
  /* `cevre`: gizli başlık DEĞİL, var olanın doğru etiketlenmesi. */
  const ego = kodu(read("../components/EgoNetwork.tsx"));
  check(/<h1 className="font-serif font-semibold[^"]*">\s*\{t\("ego\.title"\)\}\s*<\/h1>/.test(ego),
    "EgoNetwork: görünür başlık h1 olarak işaretli");

  /*
   * Atlamalar. Bu iki bölüm İstatistik görünümünde bir `h2`nin altında
   * çiziliyor; `h4` kullanmak zinciri bir seviye boş bırakıyordu. İddia
   * dosya düzeyinde: görsel boyut sınıflardan geldiği için `h4`e dönmek
   * hiçbir görsel iz bırakmaz, yani gözle fark edilmez.
   */
  for (const f of ["../components/MilestonesView.tsx", "../components/ReportCardView.tsx"]) {
    const src = kodu(read(f));
    check(!/<h4[\s>]/.test(src), `${f.replace("../components/", "")}: h2 → h4 atlaması yok`);
    check(/<h3[\s>]/.test(src), `${f.replace("../components/", "")}: bölüm başlıkları h3`);
  }
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
