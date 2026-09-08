import { readFileSync, readdirSync } from "node:fs";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
/** Yorumları ayıkla: kuralı ANLATAN metin, kuralın kanıtı değildir. */
const kodu = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * KAPI: üst katmanların SÖZÜ ile DAVRANIŞI aynı şey olsun (B2 / B4 / B8).
 *
 * Üç bulgu, tek kök: bir katmanın "ben bir penceresim" demesi ile öyle
 * davranması ayrı ayrı ilerlemişti.
 *
 *  • B2 — `Modal` tabanlı on iki pencere `role="dialog" aria-modal="true"`
 *    yazıyordu ama açılışta odak `body`de kalıyor, ilk Tab arkadaki üst
 *    çubuğa çıkıyor, kapanışta odak açan düğmeye dönmüyor ve arka plan ne
 *    `inert` ne `aria-hidden` oluyordu. Söz verilip tutulmayan semantik, hiç
 *    verilmemiş sözden kötüdür: yardımcı teknoloji ona güvenip kendi kaçış
 *    yollarını kapatır.
 *  • B4 — yazdırma önizlemesi, ESC'yi dinlemeyen TEK tam ekran katmandı.
 *  • B8 — kitap, yazdırma, sohbet ve kişi paneli tam ekran davranıp sıradan
 *    `div`/`aside` olarak duruyordu; sohbetin `<aside>`ı adsızdı.
 *
 * Kapı tek tek ekran saymıyor (sayarsa on üçüncüsü yarın yine eksik doğar);
 * İKİ YÖNLÜ BİR EŞLEME kuruyor: `aria-modal` diyen her dosya sözü tutan
 * kancayı çağırmalı, ve her tam ekran katman ESC'yi dinlemeli.
 */

const gez = (d: string, out: string[] = []): string[] => {
  for (const e of readdirSync(new URL(d + "/", import.meta.url), { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    if (e.isDirectory()) gez(`${d}/${e.name}`, out);
    else if (e.name.endsWith(".tsx")) out.push(`${d}/${e.name}`);
  }
  return out;
};
const DOSYALAR = [...gez("../components"), ...gez("../app")];
check(DOSYALAR.length > 40, `istemci dosyaları tarandı (${DOSYALAR.length})`);

/* ══ 1. `aria-modal` DİYEN, SÖZÜ TUTAN KANCAYI ÇAĞIRIR ═══════════════════ */
{
  /*
   * Asıl kural bu. `aria-modal="true"` üç şeyi vaat eder: dışarısı
   * okunamaz, odaklanamaz, tıklanamaz. Üçünü de `useDialogLayer` sağlıyor
   * (kök zincirindeki kardeşlere `inert`, odağı içeri alma, Tab tuzağı,
   * kapanışta odağı geri verme). Vaadi kancasız etmek, denetimde ölçülen
   * hâlin ta kendisi.
   */
  const sozVerip = [];
  for (const f of DOSYALAR) {
    const src = kodu(read(f));
    if (!/aria-modal/.test(src)) continue;
    /* İMPORT DEĞİL, ÇAĞRI aranıyor: `import useDialogLayer …` satırı dosyada
       kalıp çağrı silindiğinde mutasyon kapıdan geçiyordu. */
    if (!/useDialogLayer\(/.test(src)) sozVerip.push(f.replace("../", ""));
  }
  check(sozVerip.length === 0, `aria-modal diyen her katman odak yönetimini kuruyor (${sozVerip.join(", ")})`);
}

/* ══ 2. TAM EKRAN KATMANLARIN HEPSİ ESC DİNLER ══════════════════════════ */
{
  /*
   * B4. Kullanıcı bir tuşun "her yerde" çalışıp çalışmadığını tek tek
   * denemez; bir yerde çalışmayınca tuşa değil kendine güvenmez. Yazdırma
   * önizlemesi listenin dışındaydı ve tek çıkışı fareyle "Kapat"tı.
   *
   * `onClose` propu olan bir tam ekran katman, kapanabilir demektir —
   * kapanabilen her katman ESC ile de kapanmalı.
   */
  const KATMANLAR = [
    "../components/PrintView.tsx",
    "../components/BookView.tsx",
    "../components/AiChat.tsx",
    "../components/CommandPalette.tsx",
    "../components/EgoNetwork.tsx",
    "../components/PersonDrawer.tsx",
    "../components/ui/Modal.tsx",
  ];
  for (const f of KATMANLAR) {
    const src = kodu(read(f));
    check(/fixed inset-0/.test(src), `${f.replace("../", "")}: tam ekran katman`);
    check(/useEscapeKey\(/.test(src), `${f.replace("../", "")}: ESC ile kapanıyor`);
  }
}

/* ══ 3. `Modal` düzeltmenin TEK yeri ════════════════════════════════════ */
{
  /*
   * On iki çağıranın hiçbiri değişmedi ve değişmemeli: odak yönetimi
   * pencerenin kendi işi, içeriğininki değil. `layerRef` de burada kritik —
   * zincir perdeyi de saran dış kutudan başlamazsa perde `inert` olur ve
   * "boşluğa tıklayınca kapan" davranışı sessizce ölür.
   */
  const m = kodu(read("../components/ui/Modal.tsx"));
  check(/useDialogLayer\(panelRef, \{ layerRef \}\)/.test(m), "Modal odak katmanını perdeyi dışarıda bırakarak kuruyor");
  check(/ref=\{layerRef\}/.test(m) && /ref=\{panelRef\}/.test(m), "iki kök de bağlanmış");
  check(/aria-modal="true"/.test(m) && /role="dialog"/.test(m), "Modal kipselliğini ilan ediyor");

  /* Ve çağıranlar gerçekten dokunulmadan çalışıyor: hiçbiri kendi odak
     yönetimini kurmuyor (kurarsa iki tuzak birbiriyle kavga eder). */
  const cagiranlar = DOSYALAR.filter((f) => /from "\.\/ui\/Modal"|from "@\/components\/ui\/Modal"/.test(read(f)));
  check(cagiranlar.length >= 12, `Modal çağıranları bulundu (${cagiranlar.length})`);
  const kendiTuzagi = cagiranlar.filter((f) => /useDialogLayer/.test(kodu(read(f))));
  check(kendiTuzagi.length === 0, `Modal çağıranları kendi odak tuzağını kurmuyor (${kendiTuzagi.join(", ")})`);
}

/* ══ 4. KİPSELLİK KOŞULLUYSA, ÖZNİTELİK DE KOŞULLU ══════════════════════ */
{
  /*
   * B8'in en ince kararı. Kişi paneli dar ekranda perdeli bir modal (ölçülen
   * 390×680 — sayfanın %85'i), `sm`den itibaren yan yana duran, ağacın
   * tıklanabilir kaldığı bir panel. `aria-modal="true"` sabit yazılsaydı,
   * geniş ekranda yardımcı teknolojiye "dışarısı yok" denirdi — oysa dışarısı
   * hem var hem de asıl iş orada. Bu yüzden hem öznitelik hem odak hapsi
   * aynı koşula bağlı.
   */
  const d = kodu(read("../components/PersonDrawer.tsx"));
  check(/aria-modal=\{mobil \|\| undefined\}/.test(d), "kişi paneli kipselliği koşullu ilan ediyor");
  check(/useDialogLayer\(panelRef, \{ layerRef, enabled: mobil \}\)/.test(d), "odak hapsi de aynı koşulda");
  check(/matchMedia\("\(max-width: 639px\)"\)/.test(d), "koşul perdenin çizildiği genişlikle aynı (sm:hidden)");
  check(/role="dialog"/.test(d), "panel her hâlde bir pencere (landmark değil)");

  /* Gömülü çevre haritası da aynı ayrımda: sekme içeriğiyken hapsedilmiyor. */
  const e = kodu(read("../components/EgoNetwork.tsx"));
  check(/enabled: !embedded/.test(e), "gömülü çevre haritasında odak hapsi yok");
}

/* ══ 5. ADSIZ KATMAN YOK ════════════════════════════════════════════════ */
{
  /*
   * Sohbetin `<aside>`ı hiç `aria-label` taşımıyordu: ekran okuyucunun bölge
   * listesinde neye ait olduğu belirsiz bir kutu. Bir pencerenin adı, onu
   * açtığını hatırlamayan kullanıcının tek ipucu.
   */
  for (const [f, iz] of [
    ["../components/AiChat.tsx", 'aria-label={t("ai.chat.title")}'],
    ["../components/PrintView.tsx", 'aria-label={t("print.previewTitle")}'],
    ["../components/BookView.tsx", "aria-label={bookTitle}"],
  ] as const) {
    check(kodu(read(f)).includes(iz), `${f.replace("../", "")}: katmanın adı var`);
  }
}

/* ══ 6. KANCA DÖRT İŞİ DE YAPIYOR ═══════════════════════════════════════ */
{
  /*
   * Kancayı çağırmak, kanca içi boşalırsa hiçbir şey ifade etmez. Dört
   * davranışın dördü de ölçülmüş arızalara birebir karşılık geliyor:
   * odak içeri girmiyordu, Tab dışarı çıkıyordu, kapanışta geri dönmüyordu,
   * arka plan canlı kalıyordu.
   */
  const h = kodu(read("../lib/useDialogLayer.ts"));
  check(/setAttribute\("inert", ""\)/.test(h) && /removeAttribute\("inert"\)/.test(h),
    "arka plan `inert` yapılıyor ve geri alınıyor");
  check(/if \(panel\.contains\(document\.activeElement\)\) return;/.test(h),
    "odak içeri alınıyor — ama panelde zaten odak varsa dokunulmuyor (PersonForm/palet istisnaları)");
  /* Ve BİR KARE sonra bakılıyor: `autoFocus` bu efektten sonra yerleşiyor,
     senkron bakınca istisna kırılıyordu (ölçüm: `BUTTON:Kapat`). */
  check(/requestAnimationFrame\(/.test(h) && /cancelAnimationFrame\(/.test(h),
    "odak devri bir kare bekliyor ve temizlikte iptal ediliyor");
  check(/e\.key !== "Tab"/.test(h) && /e\.preventDefault\(\)/.test(h), "Tab pencerede tutuluyor");
  check(/acan\.focus\(\)/.test(h), "kapanışta odak açan öğeye dönüyor");
  /* …ve YALNIZ gerçek kapanışta: React'in geliştirme kipindeki çift kurulumu
     ile `enabled` değişimleri de temizliği tetikliyor; koşulsuz geri verme
     `autoFocus` istisnasını eziyordu (ölçüm: `INPUT[Ayşe]` yerine `Kapat`). */
  /* Koşul GERİ VERME satırında olmalı: `!panel.isConnected` dosyanın başka
     yerinde de geçiyor (Tab tuzağı), o yüzden iddia ikisini birlikte arıyor —
     yoksa mutasyon kapıdan geçiyordu. */
  check(/!panel\.isConnected && acan/.test(h), "odak yalnız katman gerçekten kapandığında geri veriliyor");
  /*
   * Açan öğe ÇİZİM sırasında yakalanmalı: `autoFocus` commit'te, paletin
   * kendi odak efekti de bu efektten önce çalışıyor; efektte okunsaydı
   * "açan" diye pencerenin kendi girdisi kaydedilirdi (ölçümde `BODY`).
   */
  check(/useState<HTMLElement \| null>\(\(\) =>/.test(h), "açan öğe çizim sırasında yakalanıyor");
  /* Yığın: iki katman üst üste açıkken tuzağı yalnız EN ÜSTTEKİ kurar. */
  check(/yigin\[yigin\.length - 1\]/.test(h), "tuzak yığının tepesinde çalışıyor");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
