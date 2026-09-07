import { readFileSync } from "node:fs";
import { tr, en } from "../lib/i18n-dict.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
/** Yorumları ayıkla: kuralı ANLATAN metin, kuralın kanıtı değildir. */
const kodu = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * KAPI: kardeş sırasını elle düzenleme arayüzü (PersonDrawer).
 *
 * ## Neden bu bir kapı testi
 *
 * Sıralamanın SAF kısmı `lib/siblings.ts`te ve `siblings.test.mts` onu
 * doğruluyor. Burada kilitlenen şey mantık değil, ARAYÜZÜN VERDİĞİ SÖZ — ve
 * bu sözün her parçası derlemeyi kırmadan, sessizce geri alınabilir:
 *
 *  1. **Ok düğmelerinin silinmesi.** Bu işin EN OLASI gerilemesi: sürükleme
 *     çalışır durumda dururken ok düğmeleri "artık gereksiz" diye atılır.
 *     Oysa sürükleme klavyeyle yapılamaz, ekran okuyucuyla görülemez ve
 *     dokunmatikte zordur. Düğmeler gidince özellik, onları kullanan
 *     insanlar için TÜMÜYLE kaybolur — ve hiçbir test kırılmaz.
 *  2. **Kütüphane getirmek.** `dnd-kit`/`react-beautiful-dnd` eklemek bu
 *     kodu kısaltır ama pakete onlarca kilobayt bindirir; karar bilinçliydi.
 *  3. **HTML5 sürüklemeye geçmek.** `draggable` daha az koddur ama parmakla
 *     HİÇ çalışmaz: özellik telefonda sessizce yok olur.
 *  4. **İyimsermiş gibi yapıp kalıcı durumu istemcide tutmak** — hata
 *     hâlinde ekranda duran sıra, sunucudakinden farklı kalır.
 *  5. **Gizlilik kaçağı** — liste HAM sıradan besleniyor; ekrana ham adı
 *     basmak `view()` katmanını delerdi.
 *
 * Bileşen JSX taşıdığı için `node --experimental-strip-types` ile içe
 * aktarılamıyor; kilit kaynak düzeyinde.
 */

const drawer = kodu(read("../components/PersonDrawer.tsx"));
const pkg = read("../package.json");

/**
 * `i` konumundaki özniteliği taşıyan AÇILIŞ ETİKETİNİ döndürür.
 * Ok fonksiyonlarındaki `=>` yüzünden "ilk `>`"e bakmak yetmiyor: etiket
 * `onClick={() => …}` görünce erkenden kesilirdi.
 */
function etiket(src: string, i: number): string {
  const bas = src.lastIndexOf("<", i);
  for (let j = bas; j < src.length; j++) {
    if (src[j] === ">" && src[j - 1] !== "=") return src.slice(bas, j + 1);
  }
  return src.slice(bas);
}

/* ═══ 1. ERİŞİLEBİLİR YEDEK YOL: OK DÜĞMELERİ DURUYOR ═════════════════════
 *
 * Bu bölümün tamamı tek bir cümlenin kilidi: sürükleme, ok düğmelerinin
 * YERİNE değil YANINA geldi.
 */
{
  check(/moveSibling\(-1\)/.test(drawer) && /moveSibling\(1\)/.test(drawer),
    "yukarı ve aşağı taşıma çağrıları duruyor");
  check(/moveInList/.test(drawer), "ok düğmeleri saf `moveInList` kuralını kullanıyor");
  check(/aria-label=\{t\("drawer\.siblingUp"\)\}/.test(drawer), "yukarı düğmesinin erişilebilir adı var");
  check(/aria-label=\{t\("drawer\.siblingDown"\)\}/.test(drawer), "aşağı düğmesinin erişilebilir adı var");

  /*
   * Düğmeler GERÇEK `<button>`: sürüklenebilir bir `<div>`e çevrilseydi
   * erişilebilir ad kalır ama klavye yolu giderdi.
   */
  for (const [ad, anahtar] of [["yukarı", "siblingUp"], ["aşağı", "siblingDown"]] as const) {
    const el = etiket(drawer, drawer.indexOf(`aria-label={t("drawer.${anahtar}")}`));
    check(el.startsWith("<button"), `${ad} denetimi bir <button>`);
  }

  /*
   * Ve sürükleme listesinin İÇİNDE değiller: liste kapalıyken (varsayılan)
   * da erişilebilir yol açık olmalı. Listeyi açan düğmenin arkasına
   * saklansalardı, klavye kullanıcısı önce sürükleme arayüzünü açmak
   * zorunda kalırdı.
   */
  const iAcilir = drawer.indexOf("{reorderOpen && (");
  check(iAcilir > 0, "sürükleme listesi bir açılır bölümde");
  check(drawer.indexOf('t("drawer.siblingUp")') < iAcilir, "yukarı düğmesi açılır bölümün DIŞINDA");
  check(drawer.indexOf('t("drawer.siblingDown")') < iAcilir, "aşağı düğmesi açılır bölümün DIŞINDA");

  /* Sınırlarda kapalı: ilk kardeşi yukarı, sonuncuyu aşağı itmek boş yazma. */
  check(/disabled=\{reordering \|\| orderIndex === 0\}/.test(drawer), "ilk sıradayken yukarı kapalı");
  check(/disabled=\{reordering \|\| orderIndex === shownIds\.length - 1\}/.test(drawer),
    "son sıradayken aşağı kapalı");
}

/* ═══ 2. SÜRÜKLEME: İŞARETÇİ OLAYLARI, YENİ BAĞIMLILIK YOK ════════════════ */
{
  const sürükleKütüphaneleri = ["@dnd-kit", "react-beautiful-dnd", "react-dnd", "sortablejs", "react-sortable"];
  for (const lib of sürükleKütüphaneleri) {
    check(!pkg.includes(lib), `bağımlılık eklenmemiş: ${lib}`);
    check(!drawer.includes(lib), `bileşen ${lib} kullanmıyor`);
  }

  check(/onPointerDown=\{/.test(drawer), "sürükleme işaretçi olayıyla başlıyor");
  check(/onPointerMove=\{/.test(drawer) && /onPointerUp=\{/.test(drawer), "taşıma ve bırakma bağlı");
  /* İptal olmadan sürükleme "takılı" kalır: parmak kesilirse satır asılı kalırdı. */
  check(/onPointerCancel=\{/.test(drawer), "iptal (pointercancel) ele alınıyor");
  check(/setPointerCapture\(e\.pointerId\)/.test(drawer),
    "işaretçi yakalanıyor (parmak satırdan taşsa da olaylar geliyor)");

  /*
   * HTML5 sürükleme YOK. Bu negatif iddia `kodu()` üzerinden çalışıyor:
   * dosyadaki gerekçe yorumu `draggable` kelimesini KURALI ANLATMAK için
   * geçiriyor.
   */
  for (const kalinti of ["draggable", "onDragStart", "onDragOver", "onDragEnter", "onDrop=", "dataTransfer"]) {
    check(!drawer.includes(kalinti), `HTML5 sürükleme kalıntısı yok: ${kalinti}`);
  }

  /*
   * DOKUNMA. `touch-action: none` olmadan parmak sürükleme yerine sayfayı
   * kaydırır; tarayıcı kaydırmayı başlattığı anda işaretçi olayları da
   * kesilir (pointercancel) — yani özellik telefonda çalışmaz görünür.
   */
  check(/touch-none/.test(drawer), "tutamaçta touch-action: none var");
  {
    /* …ve YALNIZ tutamaçta: liste kaydırılabilir kalmalı. */
    const eleman = etiket(drawer, drawer.indexOf("onPointerDown={"));
    check(/touch-none/.test(eleman), "touch-none sürüklemeyi başlatan elemanın kendisinde");
    check((drawer.match(/touch-none/g) ?? []).length === 1, "touch-none listenin tamamına konmamış");
    check(/overflow-y-auto/.test(drawer), "liste kaydırılabilir");
  }
}

/* ═══ 3. TUTAMAÇ, TUTAMAYACAĞI SÖZÜ VERMİYOR ══════════════════════════════
 *
 * Sürükleme klavyeyle yapılamıyor. Tutamaç odaklanılabilir bir `<button>`
 * olsaydı, klavye kullanıcısı ona gelir, ENTER'a basar ve hiçbir şey olmazdı
 * — sessiz bir çıkmaz. Ekran okuyucuya da kapalı; erişilebilir yol ok
 * düğmeleri ve tutamaç onların KOPYASI değil.
 */
{
  const eleman = etiket(drawer, drawer.indexOf("onPointerDown={"));
  check(eleman.startsWith("<span"), "tutamaç odaklanılamayan bir <span>");
  check(/aria-hidden/.test(eleman), "tutamaç ekran okuyucudan gizli");
  check(!/tabIndex/.test(eleman), "tutamaç sekme sırasına sokulmamış");
  check(/title=\{t\("drawer\.siblingDrag"\)\}/.test(eleman), "tutamacın görsel ipucu metni sözlükten");
}

/* ═══ 4. YAZMA TEK YOLDAN, VAR OLAN UÇTAN ════════════════════════════════
 *
 * İki giriş (ok düğmesi + sürükleme) ama TEK yazma yolu: ikisi ayrı ayrı
 * yazsaydı, iyimser gösterim/geri alma/hata metni birinde düzeltilip
 * ötekinde eskimiş hâlde kalırdı.
 */
{
  check((drawer.match(/reorderSiblings\(/g) ?? []).length === 1,
    "sıra yazması TEK çağrı yerinde (`commitOrder`)");
  check(!/fetch\(/.test(drawer), "bileşen kendi ucunu açmıyor, `lib/actions` sarmalayıcısını kullanıyor");
  check((drawer.match(/commitOrder\(newIds\)/g) ?? []).length === 2,
    "ok düğmesi ve sürükleme AYNI yazma yolundan geçiyor");
  /* Boş yazma elenmiş: aynı yere bırakmak ve sınırda ok basmak istek üretmez. */
  check((drawer.match(/newIds === shownIds\) return;/g) ?? []).length === 2,
    "değişiklik yoksa iki yolda da istek gönderilmiyor");
}

/* ═══ 5. İYİMSER GÖSTERİM, KALICI DURUM SUNUCUDAN ════════════════════════
 *
 * Sürüklerken satırın nereye düşeceği anında görünüyor; ama kalıcı sıra
 * yalnız sunucu yanıtından sonra tazeleniyor ve hata olursa ekran sunucudaki
 * sıraya geri dönüyor. Aksi hâlde kaydedilmemiş bir sıra ekranda kalır ve
 * kullanıcı işin bittiğini sanır.
 */
{
  check(/dropAt/.test(drawer) && /bg-primary/.test(drawer), "bırakma yeri görsel olarak gösteriliyor");
  check(/await reorderSiblings\(newIds\);\s*router\.refresh\(\);/.test(drawer),
    "kalıcı sıra sunucu yanıtından sonra tazeleniyor");
  check(/setPending\(null\); \/\/ eski \(sunucudaki\) sıraya dön|catch \(e\) \{\s*setPending\(null\)/.test(
    read("../components/PersonDrawer.tsx")),
    "hata hâlinde iyimser kopya düşürülüyor");
  check(/setError\(userMessage\(e, t\("err\.generic"\)\)\)/.test(drawer), "hata kullanıcıya yazılıyor");
  check(/\{error && <p/.test(drawer), "hata metni çiziliyor");
  /*
   * İyimser kopyanın ne zaman düşeceği TÜRETİLİYOR (efektle senkronlanan
   * ikinci bir durum değil): sunucudaki sıra, yazmadan önceki temelden
   * ayrıldığı anda kopya görmezden geliniyor.
   */
  check(/pending\.baseKey === groupKey/.test(drawer), "kopya sunucu sırasına göre türetiliyor");
}

/* ═══ 6. YALNIZ DÜZENLEME YETKİSİ OLANA GÖRÜNÜYOR ════════════════════════
 *
 * `/api/family/reorder` `canEdit(role)` istiyor. Katkı vericiye bu bölümü
 * göstermek, basınca 403 yiyeceği bir düğme vaat etmek olurdu.
 */
{
  check(/\{!readOnly && authority\.canEditAll && shownIds\.length >= 2 && orderIndex >= 0 && \(/.test(drawer),
    "bölüm salt-okunurda ve yetkisizde çizilmiyor");
  const route = kodu(read("../app/api/family/reorder/route.ts"));
  check(/if \(!canEdit\(ctx\.role\)\)/.test(route), "sunucu kapısı da `canEdit` (arayüz onu yansıtıyor)");
}

/* ═══ 7. GİZLİLİK: SIRA HAM VERİDEN, AD `view()`TEN ══════════════════════
 *
 * `siblingOrder` maskeli kopyada taşınmıyor, o yüzden SIRA ham veriden
 * hesaplanmak zorunda. Ama ekrana basılan ad o ham kayıttan alınamaz —
 * gizli/yaşayan kişinin adı maskeden geçmeli.
 */
{
  check(/const sib = view\(raw\);/.test(drawer), "satırdaki kişi view()'dan geçiyor");
  check(/fullName\(sib\)/.test(drawer), "ekrana maskeli kopyanın adı basılıyor");
  check(!/fullName\(raw\)/.test(drawer), "ham kayıt doğrudan çizilmiyor");
  check(/siblingGroup\(rawPerson, people\)/.test(drawer), "sıra HAM veriden hesaplanıyor");
}

/* ═══ 8. METİNLER İKİ SÖZLÜKTE DE VAR ════════════════════════════════════
 *
 * Eksik anahtar sessizce anahtarın kendisini çizer ("drawer.siblingDrag"
 * yazan bir ipucu); parite testi bunu göremez, çünkü o yalnız sözlükleri
 * karşılaştırır, KULLANIMI değil.
 */
{
  const anahtarlar = new Set<string>();
  const iBolum = drawer.indexOf('t("drawer.siblingOrder"');
  const bolum = drawer.slice(iBolum, drawer.indexOf('{error && <p', iBolum));
  for (const m of bolum.matchAll(/\bt\("([^"]+)"/g)) anahtarlar.add(m[1]);
  for (const zorunlu of ["drawer.siblingUp", "drawer.siblingDown", "drawer.siblingDrag"]) {
    check(anahtarlar.has(zorunlu), `bölüm ${zorunlu} anahtarını kullanıyor`);
  }
  check(anahtarlar.size >= 6, `anahtarlar toplandı (${anahtarlar.size})`);
  const eksikTr = [...anahtarlar].filter((k) => !(k in tr));
  const eksikEn = [...anahtarlar].filter((k) => !(k in en));
  check(eksikTr.length === 0, `tr'de eksik anahtar yok (${eksikTr.join(", ")})`);
  check(eksikEn.length === 0, `en'de eksik anahtar yok (${eksikEn.join(", ")})`);
  /* Sabit metin kaçağı yok: bölümde tırnaklı Türkçe cümle bırakılmamış. */
  check(!/>[^<>{}]*[çğıöşüÇĞİÖŞÜ][^<>{}]*</.test(bolum.replace(/\{[^{}]*\}/g, "")),
    "bölümde sözlük dışı Türkçe metin yok");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
