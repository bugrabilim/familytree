import { readFileSync } from "node:fs";
import { isPublicPath } from "../lib/public-routes.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
/** Yorumları ayıkla: kuralı ANLATAN metin, kuralın kanıtı değildir. */
const kodu = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * KAPI: değişiklik önerileri (madde 35/B).
 *
 * Öneri akışının bütün amacı, katkı vericinin yazma kapısını DOLANMADAN
 * değişiklik isteyebilmesi. Bu dosyanın kilitlediği şey tam olarak o: akışın
 * kendisi bir dolanma yoluna dönüşmesin.
 */

const rota = kodu(read("../app/api/family/proposals/route.ts"));
const store = kodu(read("../lib/proposal-store.ts"));

/* --- 1. Kim ne yapabilir ------------------------------------------------- */
/*
 * EN PAHALI HATA burada olurdu: kararı `canContribute`e bağlamak. O zaman
 * katkı verici kendi önerisini onaylayıp yazma kapısını tamamen dolanırdı —
 * yani rol, gecikmeli bir editor olurdu ve bütün iş boşa giderdi.
 */
{
  const patch = rota.slice(rota.indexOf("export async function PATCH"));
  check(/if \(!canEdit\(ctx\.role\)\) return forbidden\(/.test(patch),
    "KARAR canEdit istiyor (üye kendi önerisini onaylayamaz)");
  check(!/canPropose/.test(patch), "PATCH dalında canPropose hiç geçmiyor");
}
{
  const post = rota.slice(rota.indexOf("export async function POST"), rota.indexOf("export async function PATCH"));
  check(/if \(!canPropose\(ctx\.role\)\) return forbidden\(\);/.test(post),
    "öneri açmak ağacın her ÜYESİNE açık");
  check(!/canEdit\(ctx\.role\)/.test(post), "öneri açmak yöneticilik İSTEMİYOR (rolün tek amacı bu)");
}
{
  const get = rota.slice(rota.indexOf("export async function GET"), rota.indexOf("export async function POST"));
  check(/if \(!canPropose\(ctx\.role\)\) return forbidden\(\);/.test(get), "kuyruğu her üye görebiliyor");
  check(/visibleTo\(hepsi, ctx\.authorId, kararVerebilir\)/.test(get),
    "kuyruk görünürlükten geçiyor (katkı verici yalnız kendi önerisini görür)");
  /*
   * Rozet sayısı katkı vericiye gönderilseydi, göremediği önerilerin
   * varlığını sayıdan çıkarırdı — görünürlük kuralını sayı üstünden delen
   * bir sızıntı.
   */
  check(/pending: kararVerebilir \? pendingCount\(hepsi\) : undefined/.test(get),
    "bekleyen SAYISI yalnız karar verebilene gidiyor");
}
check(!isPublicPath("/api/family/proposals"), "uç oturumsuz açık DEĞİL");

/* --- 2. `from` istemciden gelmiyor --------------------------------------- */
/*
 * Öneri, dayandığı değeri (`from`) taşıyor ve onay anındaki bayatlık
 * denetimi ona bakıyor. İstemci yazabilseydi, öneriyi açan taraf `from`u
 * kaydın şimdiki değerine eşitleyip denetimden geçer, yani denetim kendi
 * kendini iptal ederdi.
 */
check(/buildChanges\(person, istek\)/.test(rota), "değişiklikler KAYIT ile karşılaştırılarak kuruluyor");
{
  const post = rota.slice(rota.indexOf("export async function POST"), rota.indexOf("export async function PATCH"));
  check(!/from:/.test(post), "rotada elle kurulan bir `from` alanı yok");
  check(/const person = data\.people\.find/.test(post), "kişi kaydı okunuyor");
}

/* --- 3. Onay: bayatlık ve sıra ------------------------------------------- */
{
  const patch = rota.slice(rota.indexOf("export async function PATCH"));
  check(/applyProposal\(data\.people\[i\], p\)/.test(patch), "onayda öneri kayda uygulanıyor");
  check(/if \(!uygula\.ok\)/.test(patch) && /status: 409/.test(patch),
    "bayat öneri 409 ile REDDEDİLİYOR (yeni bilgi ezilmiyor)");
  check(/stale: uygula\.stale/.test(patch), "hangi alanların bayatladığı söyleniyor");

  /*
   * SIRA: önce ağaç yazılıyor, sonra öneri "onaylandı" işaretleniyor. Ters
   * olsaydı ve ağaç yazımı düşseydi, öneri onaylanmış görünür ama değişiklik
   * hiç gerçekleşmezdi — kimsenin fark etmeyeceği bir yalan.
   */
  const iAgac = patch.indexOf("await saveFamilyData(");
  const iOneri = patch.indexOf("await replaceProposal(");
  check(iAgac > -1 && iOneri > iAgac, "ağaç yazımı, öneri damgasından ÖNCE");

  /* Kişi arada silinmişse onay uygulanamaz; "onaylandı" damgası da vurulmaz. */
  check(/if \(i === -1\)/.test(patch), "silinmiş kişi için onay reddediliyor");

  /*
   * İYİMSER KİLİT ayrıca gerekiyor: bayatlık denetimi yalnız ÖNERİLEN
   * alanları koruyor, ağaç ise tek dosya. Okuma ile yazma arasında başkası
   * başka bir kişiyi kaydettiyse bu yazma onu ezerdi.
   */
  check(/if \(versionMismatch\(req, data\.updatedAt\)\)/.test(patch), "iyimser kilit var");
  {
    const iKilit = patch.indexOf("versionMismatch(req");
    const iYaz = patch.indexOf("await saveFamilyData(");
    check(iKilit > -1 && iYaz > iKilit, "kilit denetimi yazmadan ÖNCE");
  }
}

/* --- 4. Yazma yalnız onay dalında ---------------------------------------- */
/*
 * `saveFamilyData` yalnız onay dalında çağrılmalı. Ret dalında da çağrılsaydı
 * reddedilen bir öneri ağacı yazardı — akışın tam tersi.
 */
check((rota.match(/await saveFamilyData\(/g) ?? []).length === 1, "ağaca tek bir yazma noktası var");
{
  const patch = rota.slice(rota.indexOf("export async function PATCH"));
  const iOnay = patch.indexOf('if (karar === "onaylandi")');
  const iYaz = patch.indexOf("await saveFamilyData(");
  check(iOnay > -1 && iYaz > iOnay, "yazma onay KOŞULUNUN içinde");
}

/* --- 5. Bildirim: en iyi çaba, ve değer taşımıyor ------------------------ */
{
  /*
   * Bildirim başarısızlığı öneriyi DÜŞÜRMEMELİ: posta gitmese de talep
   * kuyrukta durmalı, yoksa katkı verici yazdığını kaybeder.
   */
  check(/await bildir\([^)]*\)\.catch\(/.test(rota), "bildirim en iyi çaba (catch'li)");
  const iEkle = rota.indexOf("await addProposal(");
  const iBildir = rota.indexOf("await bildir(");
  check(iEkle > -1 && iBildir > iEkle, "bildirim, öneri SAKLANDIKTAN sonra");

  /*
   * Önerilen DEĞERLER postaya konmuyor, yalnız sayısı. Gövde, ağaçtaki
   * kişisel bilgiyi (doğum tarihi, adres, hastalık) gizlilik katmanından
   * geçmeden dışarı taşırdı; uygulamadaki her görüntü `view()` üstünden
   * çiziliyor, posta bunu atlayan tek yüzey olurdu.
   */
  const b = rota.slice(rota.indexOf("async function bildir"));
  check(/Object\.keys\(p\.changes\)\.length/.test(b), "postaya alan SAYISI giriyor");
  check(!/p\.changes\[/.test(b) && !/c\.to/.test(b) && !/JSON\.stringify\(p\.changes/.test(b),
    "önerilen DEĞERLER postaya girmiyor");
  check(/if \(!adres\) return;/.test(b), "adres yoksa sessizce geçiliyor");
}

/* --- 6. Depo: okunamayan kuyruk BOŞ kuyruk değil ------------------------- */
/*
 * Aynı hata bu depoda yedi kez yapıldı: geçici bir okuma hatasında boş kayıt
 * dönmek, sonraki yazmanın her şeyin üstüne yazması demekti. Burada kaybedilen
 * şey, birinin yazıp kimsenin görmediği katkı olurdu.
 */
check(/if \(!blob\) return empty\(\);/.test(store), "dosya GERÇEKTEN yoksa boş");
check(/if \(!res\.ok\) throw new Error\(/.test(store), "HTTP hatasında fırlatılıyor");
check(!/catch[^{]*\{\s*return empty\(\);/.test(store), "catch içinde boş dönüş YOK");

/* --- Öneri TÜRLERİ: ekleme ve silme --------------------------------------- */
/*
 * Rolleri daraltmanın ön koşulu bu iki tür. Yoksa yetkisi alınan kişi "yeni
 * kişi ekle" ve "kaydı sil" isteklerini hiçbir yoldan iletemez ve daraltma,
 * bir yeteneği yok etmiş olur.
 */
{
  const patch = rota.slice(rota.indexOf("export async function PATCH"));

  /*
   * EKLEME onayı kişiyi ORTAK oluşturucudan kuruyor. Rota kendi kopyasını
   * yazsaydı ikisi ayrışır ve kullanıcı kendi eklediğinde kurulan bir bağ
   * öneriyle eklendiğinde kurulmazdı — fark aylar sonra tek yönlü kalmış bir
   * eş bağı olarak ortaya çıkardı.
   */
  check(/createPerson\(data, \{/.test(patch), "ekleme onayı ortak oluşturucuyu çağırıyor");
  check(!/nextCode\(/.test(rota), "rota kendi kod üretimini yapmıyor");
  {
    const i = patch.indexOf('kindOf(p) === "ekleme"');
    const j = patch.indexOf("} else {", i);
    const dal = i > -1 && j > i ? patch.slice(i, j) : "";
    /*
     * `addedBy` ÖNEREN kişi, onaylayan değil: kaydı isteyen odur ve
     * öneriyle eklenen kaydı sonradan düzeltmek de ona açık kalmalı.
     */
    check(/addedBy: p\.by/.test(dal), "eklenen kaydın sahibi ÖNEREN");
    /*
     * İlişki dizileri KAPALI: öneri gövdesi kayıt defterinden süzülüyor ve
     * o diziler deftere girmiyor; bağ yalnız `relation` üstünden kuruluyor.
     */
    check(/allowLinkArrays: false/.test(dal), "öneri yolunda ilişki dizileri kapalı");
  }

  /*
   * SİLME onayı kaydı İLİŞKİ GRAFİĞİNDEN de düşürüyor. Yalnız kaydı atmak,
   * başkalarının listelerinde olmayan bir kimliğe işaret eden bağlar
   * bırakırdı ve o bağlar ekranda sessizce kaybolan ebeveyn/eş olurdu.
   */
  {
    const i = patch.indexOf('kindOf(p) === "silme"');
    const j = patch.indexOf("} else {", i);
    const dal = i > -1 && j > i ? patch.slice(i, j) : "";
    check(/filter\(\(x\) => x\.id !== silinen\)/.test(dal), "kayıt siliniyor");
    check(/parentIds/.test(dal) && /spouseIds/.test(dal), "ebeveyn ve eş bağları temizleniyor");
    check(/formerSpouseIds/.test(dal), "eski eş bağları da temizleniyor");
    check(/associations/.test(dal), "çevre bağları da temizleniyor");
  }

  /* Üç tür de aynı iyimser kilidin ARKASINDA. */
  {
    const iKilit = patch.indexOf("versionMismatch(req");
    const iEkleme = patch.indexOf('kindOf(p) === "ekleme"');
    check(iKilit > -1 && iEkleme > iKilit, "tür ayrımı kilitten SONRA");
  }
}
{
  /*
   * Öneri açarken TÜR TUTARLILIĞI depoya girmeden sınanıyor: türü "ekleme"
   * olup `personId` taşıyan bir kayıt, onay anında hangi kod yolunun
   * çalışacağını belirsiz kılardı.
   */
  const post = rota.slice(rota.indexOf("export async function POST"), rota.indexOf("export async function PATCH"));
  check(/isCoherent\(/.test(post), "tür tutarlılığı yazmadan önce sınanıyor");
  const iTutarli = post.indexOf("isCoherent(");
  const iEkle = post.indexOf("await addProposal(");
  check(iTutarli > -1 && iEkle > iTutarli, "sınama, depoya yazmadan ÖNCE");
  check(/buildNewPerson\(/.test(post), "ekleme önerisi kayıt defterinden süzülüyor");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
