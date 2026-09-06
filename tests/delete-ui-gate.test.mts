import { readFileSync } from "node:fs";
import { tr, en } from "../lib/i18n-dict.ts";
import { GRACE_DAYS } from "../lib/retention.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
/** Yorumları ayıkla: kuralı ANLATAN metin, kuralın kanıtı değildir. */
const kodu = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * KAPI: silme arayüzü (ağaç silme + hesap silme).
 *
 * ## Neden bu bir kapı testi
 *
 * Silmenin asıl kapısı sunucuda; arayüz bir güvenlik sınırı değil. Ama burada
 * arayızın kendisi bir ARIZA KAYNAĞI, çünkü sildiği şey geri getirilemez bir
 * içerik: kişiler, fotoğraflar, mektuplar. Üç ayrı hata türü var ve üçü de
 * sessiz:
 *
 *  1. Yanlış şeyi silmek — ana ağaçta silme düğmesi göstermek, ya da teyit
 *     istemeden silmek. Kullanıcı basar, ne olduğunu sonra anlar.
 *  2. Yanlış vaat — silme artık 30 gün beklemeli (`lib/retention.ts`).
 *     "Bu işlem geri alınamaz" demek YANLIŞ bir cümle ve zararı somut:
 *     kullanıcı var olan geri getirme yolunu aramaz.
 *  3. Sessiz kısmi başarı — 207 `res.ok` olduğu için `if (!res.ok) throw`
 *     kalıbı onu tam başarı sayar. Kullanıcıya "her şey silindi" denir, oysa
 *     verisinin bir kısmı duruyordur.
 *
 * Bu üçü de derlemeyi kırmadan, testsiz bir düzenlemede kolayca geri gelir.
 * Bileşenler JSX taşıdığı için `node --experimental-strip-types` ile içe
 * aktarılamıyor; kilit kaynak düzeyinde.
 */

const switcher = kodu(read("../components/TreeSwitcher.tsx"));
const treeDlg = kodu(read("../components/DeleteTreeDialog.tsx"));
const account = kodu(read("../components/DeleteAccountSection.tsx"));
const settings = kodu(read("../components/SettingsDialog.tsx"));
const actions = kodu(read("../lib/actions.ts"));
const scopeList = kodu(read("../components/DeleteScopeList.tsx"));
const login = kodu(read("../app/login/page.tsx"));

/** `i` konumundan sonraki ilk açılış iminden başlayıp dengeli bloğu döndürür. */
function blok(src: string, i: number): string {
  const eslenik: Record<string, string> = { "(": ")", "{": "}", "[": "]" };
  while (i < src.length && !(src[i] in eslenik)) i++;
  const ac = src[i];
  if (!ac) return "";
  const kapa = eslenik[ac];
  let derinlik = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === ac) derinlik++;
    else if (src[j] === kapa) {
      derinlik--;
      if (derinlik === 0) return src.slice(i, j + 1);
    }
  }
  return "";
}

/* ═══ 1. ANA AĞAÇTA SİLME SEÇENEĞİ YOK ═════════════════════════════════════
 *
 * Sunucu ana ağacı zaten silmiyor. Düğmeyi yine de göstermek, kullanıcıyı
 * basıp "Silinemedi" yemeye davet etmek olurdu — sebebi anlaşılmayan bir ret,
 * görünmeyen bir düğmeden kötüdür. Hesabını silmek isteyen kullanıcının yolu
 * ayarlardaki "Hesabı sil" bölümü.
 */
{
  const iKosul = switcher.indexOf("{!tree.home && (");
  check(iKosul > 0, "canlı ağaç satırında `!tree.home` koşulu var");
  const kosulBlok = blok(switcher, iKosul);
  check(kosulBlok.includes("setSilinecek(tree)"), "silme düğmesi o koşulun İÇİNDE");
  /*
   * Tek giriş noktası: pencereyi açan başka bir yol olsaydı yukarıdaki iddia
   * doğru kalır ama ana ağaç yine silinebilirdi.
   */
  check((switcher.match(/setSilinecek\(tree\)/g) ?? []).length === 1,
    "silme penceresini açan BAŞKA yol yok");
}

/* ═══ 2. TEYİT: AD YAZILMADAN DÜĞME ETKİN DEĞİL ════════════════════════════
 *
 * Tek "Emin misin?" yetmez: açılır menüde çöp kutuları yan yana ve ağaç
 * adları birbirine benziyor. Bekleme süresi de bunu gereksiz kılmıyor —
 * fark edilmeyen bir yanlış silme, süre dolunca kalıcı olur.
 */
{
  check(/const eslesti = confirmMatches\(onay, tree\.name\)/.test(treeDlg),
    "ağaç teyidi yazılan adı ağacın adıyla karşılaştırıyor");
  /*
   * Karşılaştırma SUNUCUNUN kuralı (`lib/retention.ts`). Arayüz kendi
   * kopyasını yazsaydı ikisi ayrışır ve ayrışmanın yönü kötü olurdu: düğme
   * etkinleşir, sunucu 400 döner, kullanıcı doğru yazdığı hâlde reddedilir.
   */
  check(/from "@\/lib\/retention"/.test(treeDlg), "kural lib/retention.ts'ten geliyor");
  check(!/onay\.trim\(\) === tree\.name/.test(treeDlg),
    "bileşen karşılaştırmanın KENDİ kopyasını yazmıyor");

  const iDugme = treeDlg.indexOf("onClick={sil}");
  check(iDugme > 0, "silme düğmesi `sil`e bağlı");
  const dugme = treeDlg.slice(treeDlg.lastIndexOf("<Button", iDugme), treeDlg.indexOf(">", iDugme));
  check(/disabled=\{!eslesti/.test(dugme), "düğme ad eşleşene kadar ETKİN DEĞİL");
  /* Çift kemer: düğme bir şekilde etkinleşse bile istek gitmesin. */
  check(/if \(!eslesti\) return;/.test(treeDlg), "gönderim yolunda da teyit denetimi var");
}

/* ═══ 3. HESAP SİLME: HEM ŞİFRE HEM AD ═════════════════════════════════════
 *
 * Şifre "sen misin?", aile adı "ne yaptığının farkında mısın?" sorusu. Yalnız
 * biri sorulsaydı açık kalmış bir oturumda tek tıkla hesap silinebilirdi.
 */
{
  check(/const eslesti = confirmMatches\(onay, familyName\)/.test(account), "aile adı teyidi var");
  check(/const hazir = sifre\.length > 0 && eslesti;/.test(account),
    "hazır olma koşulu ŞİFRE VE ad teyidinin İKİSİNE birden bağlı");
  check(/type="password"/.test(account), "şifre alanı var");

  const iDugme = account.indexOf("onClick={sil}");
  check(iDugme > 0, "silme düğmesi `sil`e bağlı");
  const dugme = account.slice(account.lastIndexOf("<Button", iDugme), account.indexOf(">", iDugme));
  check(/disabled=\{!hazir/.test(dugme), "düğme ikisi de tamam olana kadar ETKİN DEĞİL");
  check(/if \(!hazir\) return;/.test(account), "gönderim yolunda da denetim var");
  check(/deleteAccount\(sifre, onay\.trim\(\)/.test(account), "uca şifre VE teyit birlikte gidiyor");

  /* Yalnız hesap sahibine görünüyor: davetli üyeye 403 yiyeceği bir düğme
     göstermek, olmayan bir yetkiyi vaat etmek olurdu. */
  check(/\{isFounder && familyName && \(/.test(settings), "bölüm yalnız kurucuya çiziliyor");
  check(/<DeleteAccountSection/.test(settings), "ayarlar ekranına bağlı");

  /* Başarıdan sonra oturum kapanıp ana sayfaya dönülüyor. */
  check(/signOut\(\{ redirect: false \}\)/.test(account), "başarıdan sonra oturum kapatılıyor");
  check(/router\.push\("\/"\)/.test(account), "ana sayfaya yönlendirme var");
}

/* ═══ 4. 207 AYRI ELE ALINIYOR ═════════════════════════════════════════════
 *
 * 207 = kayıt beklemeye alındı ama bazı veriler işlenemedi. `res.ok` doğru
 * döndüğü için sessizce "tamam" sayılması işten değil; o zaman kullanıcı
 * verisinin gittiğini sanır, oysa duruyordur.
 */
{
  check(/res\.status === 207/.test(actions), "istemci yardımcısı 207'yi ayırt ediyor");
  check(/durum: "kismi"/.test(actions), "kısmi başarı ayrı bir durum olarak dönüyor");
  /*
   * Birlik (union) tipi kilitleniyor: `failed` yalnız "kismi" dalında
   * bulunuyor, yani çağıran `durum`a bakmadan derleyemiyor. Tek bir
   * `{ ok: true }` nesnesi dönseydi 207'yi görmezden gelmek bir SATIR bile
   * yazmadan mümkün olurdu.
   */
  check(/\| \{ durum: "kismi"; failed: string\[\]/.test(actions), "kısmi durum `failed` taşıyor");

  for (const [ad, src] of [["ağaç silme", treeDlg], ["hesap silme", account]] as const) {
    check(/r\.durum === "kismi" \? r\.failed : undefined/.test(src),
      `${ad}: kısmi başarı ayrıca saklanıyor`);
    check(/sonuc\.failed && sonuc\.failed\.length > 0/.test(src),
      `${ad}: işlenemeyen veriler kullanıcıya listeleniyor`);
  }
  check(/t\("treeDelete\.partial"\)/.test(treeDlg), "ağaç silmede kısmi başarı METNİ var");
  check(/t\("account\.delete\.partial"\)/.test(account), "hesap silmede kısmi başarı METNİ var");
}

/* ═══ 5. YANLIŞ VAAT YOK: "geri alınamaz" ═════════════════════════════════
 *
 * Silme artık 30 gün beklemeli. "Bu işlem geri alınamaz" cümlesi hem yanlış
 * hem zararlı: kullanıcı var olan geri getirme yolunu aramaz.
 *
 * DİKKAT — bu bir NEGATİF iddia ve tam da bu yüzden `kodu()` üzerinden
 * çalışıyor: bileşenlerin başlık yorumlarında "geri alınamaz" ifadesi
 * KURALI ANLATMAK için geçiyor. Ham kaynağa bakılsaydı iddia, kuralı
 * açıklayan yorumun varlığı yüzünden düşerdi.
 */
{
  const yanlisVaat = /geri alınamaz|geri alınamıyor|geri dönüşü olmayan bir işlem|cannot be undone|can'?t be undone|irreversible/i;
  for (const [ad, src] of [
    ["ağaç silme", treeDlg],
    ["hesap silme", account],
    ["ağaç seçici", switcher],
  ] as const) {
    check(!yanlisVaat.test(src), `${ad}: kodda "geri alınamaz" vaadi yok`);
  }

  /* Asıl metinler sözlükte; onları da tara. */
  const silmeAnahtari = (k: string) =>
    k.startsWith("treeDelete.") || k.startsWith("account.delete.") ||
    k.startsWith("deleteScope.") || k.startsWith("tree.deleted") ||
    k.startsWith("login.restore.") ||
    k === "tree.restore" || k === "tree.restoreFailed" || k === "tree.purgeToday";
  for (const [dil, sozluk] of [["tr", tr], ["en", en]] as const) {
    const suclu = Object.keys(sozluk).filter((k) => silmeAnahtari(k) && yanlisVaat.test(sozluk[k]));
    check(suclu.length === 0, `${dil}: silme metinlerinde "geri alınamaz" vaadi yok (${suclu.join(", ")})`);
  }

  /* Doğru cümle KURULUYOR mu: bekleme süresi ve geri getirme yolu yazıyor. */
  check(/\{days\}/.test(tr["treeDelete.lead"]) && /\{days\}/.test(en["treeDelete.lead"]),
    "ağaç silme metni bekleme süresini söylüyor");
  check(/\{days\}/.test(tr["account.delete.lead"]) && /\{days\}/.test(en["account.delete.lead"]),
    "hesap silme metni bekleme süresini söylüyor");
  /*
   * Gün sayısı sözlüğe YAZILMIYOR, `GRACE_DAYS`ten geliyor. Metne "30"
   * yazılsaydı süre değiştiğinde iki dilde de yalan söyleyen bir cümle
   * kalırdı — üstelik kimse fark etmezdi.
   */
  check(/days: GRACE_DAYS/.test(treeDlg) && /days: GRACE_DAYS/.test(account),
    "gün sayısı tek kaynaktan (GRACE_DAYS) geliyor");
  check(GRACE_DAYS > 0, "bekleme süresi tanımlı (bu kapının gerekçesi)");
}

/* ═══ 6. KALICI SİLME ANI (purgeAt) KULLANICIYA GÖSTERİLİYOR ══════════════
 *
 * "30 gün" soyut; kullanıcı ay sonunda hangi gün olduğunu bilemez. Tarih
 * gösterilmezse bekleme süresi pratikte takip edilemez bir söz olur.
 */
{
  check(/purgeAt: r\.purgeAt/.test(treeDlg), "ağaç silme yanıtından purgeAt alınıyor");
  check(/purgeAt: r\.purgeAt/.test(account), "hesap silme yanıtından purgeAt alınıyor");
  check(/t\("treeDelete\.purgeAt", \{ date: tarihYaz\(sonuc\.purgeAt/.test(treeDlg),
    "ağaç silmede kalıcı silme tarihi ÇİZİLİYOR");
  check(/t\("account\.delete\.purgeAt", \{ date: tarihYaz\(sonuc\.purgeAt\)/.test(account),
    "hesap silmede kalıcı silme tarihi ÇİZİLİYOR");
  check(/purgeAt = typeof data\?\.purgeAt === "string"/.test(actions),
    "yardımcı purgeAt'i yanıttan okuyor");
  for (const [dil, sozluk] of [["tr", tr], ["en", en]] as const) {
    check(/\{date\}/.test(sozluk["treeDelete.purgeAt"]), `${dil}: ağaç purgeAt metninde tarih yeri var`);
    check(/\{date\}/.test(sozluk["account.delete.purgeAt"]), `${dil}: hesap purgeAt metninde tarih yeri var`);
  }
}

/* ═══ 7. GERİ GETİRME YALNIZ SİLİNMİŞ AĞAÇLARDA ══════════════════════════
 *
 * Bekleme süresinin TEK anlamı geri getirme yolu. Görünmezse elimizde yalnız
 * gecikmeli bir silme kalır. Öte yandan düğme canlı ağaçta görünseydi
 * anlamsız olurdu: sunucu "silinmemiş" bir ağacı geri getiremez.
 */
{
  const iCanli = switcher.indexOf("canli.map(");
  const iSilinen = switcher.indexOf("deletedTrees.map(");
  check(iCanli > 0 && iSilinen > 0, "iki ayrı liste var (canlı / silinmiş)");
  const canliBlok = blok(switcher, iCanli);
  const silinenBlok = blok(switcher, iSilinen);
  check(!canliBlok.includes("geriGetir("), "canlı ağaç satırında geri getirme YOK");
  check(silinenBlok.includes("geriGetir(tree.treeId)"), "silinmiş ağaç satırında geri getirme VAR");
  check(silinenBlok.includes('t("tree.restore")'), "düğme metni sözlükten");
  /* Kalan gün en görünür bilgi: kararı verdiren sayı o. */
  check(/t\("tree\.deletedDaysLeft", \{ days: kalan \}\)/.test(silinenBlok),
    "kalan gün sayısı gösteriliyor");
  check(/daysLeft\(tree\.deletedAt/.test(silinenBlok),
    "kalan gün ortak kuraldan (lib/retention.ts) hesaplanıyor");
  check(/restoreTree\(treeId/.test(switcher), "geri getirme ucu çağrılıyor");
  /*
   * Bölüm ancak silinmiş ağaç varsa çiziliyor — boş bir "Silinenler" başlığı
   * her kullanıcıya sürekli bir çöp kutusu göstermek olurdu.
   */
  check(/\{deletedTrees\.length > 0 && \(/.test(switcher), "bölüm yalnız doluyken çiziliyor");
}

/* ═══ 8. SİLMEDEN ÖNCE DIŞA AKTARMA TEKLİF EDİLİYOR ══════════════════════
 *
 * Bekleme süresi dolduktan sonra veri gerçekten yok. Yedek teklifi ayrı bir
 * sayfada dursaydı, "önce yedeğini al" cümlesini yalnız oraya gidenler
 * görürdü — yani ihtiyacı olmayanlar.
 */
{
  check(/\/api\/family\/export/.test(treeDlg), "ağaç silme penceresinde dışa aktarma var");
  /*
   * Yedek, ağaç DEĞİŞTİRİLMEDEN alınıyor: `x-tree-id` başlığı hangi ağacın
   * istendiğini söylüyor. Başlık düşerse dışa aktarma sessizce YANLIŞ ağacı
   * (aktif olanı) indirir — silinmek üzere olanı değil.
   */
  check(/"x-tree-id": tree\.treeId/.test(treeDlg), "yedek, silinecek ağacın kendisinden alınıyor");
  check(/\/api\/family\/export/.test(account), "hesap silme bölümünde dışa aktarma var");

  /* "Yanında": ikisi AYNI satırda. */
  const iSatir = account.indexOf('className="flex flex-wrap items-center gap-2"');
  check(iSatir > 0, "silme ve yedek düğmeleri ortak bir satırda");
  const satir = account.slice(iSatir, account.indexOf("</div>", iSatir));
  check(satir.includes("onClick={sil}") && satir.includes("onClick={yedekAl}"),
    "yedek düğmesi silme düğmesinin YANINDA");
  /* "Önce yedeğini al" cümlesi de o satırın hemen üstünde, aynı ekranda. */
  const iCumle = account.indexOf('t("account.delete.backupHint")');
  check(iCumle > 0 && iCumle < iSatir && iSatir - iCumle < 400,
    "\"önce yedeğini al\" cümlesi düğmeye bakarken görünüyor");
}

/* ═══ 9. NE SİLİNECEĞİ ÖNCEDEN YAZIYOR ═══════════════════════════════════
 *
 * Kullanıcı neyi kaybettiğini sonradan öğrenmemeli. Liste TEK yerde: iki
 * ekran kendi kopyasını taşısaydı, yeni bir veri türü eklendiğinde birininki
 * güncellenir ötekinde eksik kalırdı — yani vaat sessizce çürürdü.
 */
{
  for (const tur of ["people", "media", "recipes", "letters", "obituaries", "stories", "gatherings", "proposals", "members"]) {
    check(scopeList.includes(`"${tur}"`), `silinecekler listesinde ${tur} var`);
    check(!!tr[`deleteScope.${tur}`] && !!en[`deleteScope.${tur}`], `deleteScope.${tur} iki dilde de var`);
  }
  check(/<DeleteScopeList \/>/.test(treeDlg), "ağaç silme listeyi gösteriyor");
  check(/<DeleteScopeList \/>/.test(account), "hesap silme listeyi gösteriyor");
  /* Hesap silmede kaç ağaç / kaç kişi gideceği de söyleniyor. */
  check(/t\("account\.delete\.summary", \{ trees: treeCount, people: peopleCount \}\)/.test(account),
    "hesap silmede ağaç ve kişi sayısı yazıyor");
}

/* ═══ 10. EKRANLARDA SABİT METİN YOK ═════════════════════════════════════
 *
 * Kullanılan her anahtar İKİ sözlükte de bulunmalı. Eksik anahtar sessizce
 * anahtarın kendisini çizer ("treeDelete.submit" yazan bir düğme) — parite
 * testi bunu göremez, çünkü o yalnız sözlükleri karşılaştırır, kullanımı
 * değil.
 */
{
  const kaynaklar = [treeDlg, account, switcher, scopeList, login];
  const anahtarlar = new Set<string>();
  for (const src of kaynaklar) {
    for (const m of src.matchAll(/\bt\("([^"]+)"/g)) anahtarlar.add(m[1]);
  }
  /* Şablonlu anahtar (`deleteScope.${tur}`) elle eklenir. */
  for (const m of scopeList.matchAll(/^\s*"([a-z]+)",$/gm)) anahtarlar.add(`deleteScope.${m[1]}`);
  const eksikTr = [...anahtarlar].filter((k) => !(k in tr));
  const eksikEn = [...anahtarlar].filter((k) => !(k in en));
  check(anahtarlar.size > 25, `anahtarlar toplandı (${anahtarlar.size})`);
  check(eksikTr.length === 0, `tr'de eksik anahtar yok (${eksikTr.join(", ")})`);
  check(eksikEn.length === 0, `en'de eksik anahtar yok (${eksikEn.join(", ")})`);
}

/* ═══ 11. HESAP GERİ GETİRME YOLU GİRİŞ EKRANINDA ═══════════════════════
 *
 * Beklemedeki hesapla GİRİŞ YAPILAMIYOR (`lib/credentials.ts`), geri alma ucu
 * da oturumsuz (`POST /api/account/restore`). Giriş ekranında bu düğme
 * olmasaydı kullanıcının verisi 30 gün duruyor ama ona ulaşacak hiçbir yol
 * bulunmuyor olurdu — yani bekleme süresi kâğıt üzerinde kalırdı.
 */
{
  check(/restoreAccount\(familyName, password/.test(login), "giriş ekranı geri getirme ucunu çağırıyor");
  /*
   * Yalnız başarısız girişten sonra: uç "böyle hesap yok" ile "şifre yanlış"
   * arasında bilerek ayrım yapmıyor, dolayısıyla kimin hesabının beklemede
   * olduğunu önden bilemiyoruz.
   */
  check(/\{error && !restoreFailed && \(/.test(login), "geri getirme yalnız başarısız girişten sonra görünüyor");
  check(/t\("login\.restore\.action"\)/.test(login), "düğme metni sözlükten");
  /* 207'de otomatik giriş YOK: kullanıcı önce eksik kalanları okumalı. */
  check(/if \(r\.durum === "kismi"\) \{\s*setRestoreFailed\(r\.failed\);\s*return;/.test(login),
    "kısmi başarıda otomatik giriş yapılmıyor, liste gösteriliyor");
  check(/restoreAccount/.test(actions) && /\/api\/account\/restore/.test(actions),
    "istemci yardımcısı geri getirme ucunu tanıyor");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
