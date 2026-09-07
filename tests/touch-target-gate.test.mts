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

/* ══ 2. Ölçekten bağımsız hızlı-ekle düğmeleri ═══════════════════════════ */
/*
 * Kart kenarındaki "+" düğmeleri React Flow'un `transform: scale()`
 * uyguladığı tuvalin İÇİNDE. 366 kişilik ağaçta açılış ölçeği ~0.25 olduğu
 * için 24px'lik düğme ekranda 6px'e iniyordu: uygulamanın İLK AÇILDIĞI
 * hâlde bu afordanslar pratikte yoktu.
 */
check(/^\.ft-nub \{/m.test(css), "ters-ölçekleme sınıfı tanımlı");
check(/var\(--ft-zoom/.test(css), "sınıf tuval ölçeğini okuyor");
check(/clamp\(1,/.test(css), "büyütme alt/üst sınırla kısıtlı (düğme kartı yutmasın)");
{
  const ft = kodu(read("../components/FamilyTree.tsx"));
  check(/setProperty\("--ft-zoom"/.test(ft), "ölçek CSS değişkenine yazılıyor");
  /*
   * ÜÇ YOLDAN DA yazılmalı. Yalnız `onMove`a bağlansaydı, kullanıcı tuvale
   * hiç dokunmadığı sürece — yani tam da açılış hâlinde — değişken hiç
   * yazılmaz ve varsayılan 1 ile düğmeler yine 6px kalırdı.
   */
  check(/onMove=\{[^}]*yayinlaOlcek/.test(ft), "kullanıcı zoom'unda yazılıyor");
  check(/onInit[\s\S]{0,300}?yayinlaOlcek\(/.test(ft), "açılışta yazılıyor");
  check(/fitView\(\{ padding: 0\.15[\s\S]{0,200}?yayinlaOlcek\(/.test(ft), "otomatik sığdırmadan sonra yazılıyor");
  const pn = kodu(read("../components/PersonNode.tsx"));
  check(/ft-nub/.test(pn), "kart düğmeleri sınıfı taşıyor");
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

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
