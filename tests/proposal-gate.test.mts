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
const cek = kodu(read("../app/api/family/proposals/withdraw/route.ts"));
const uygula = kodu(read("../lib/proposal-apply.ts"));
const geri = kodu(read("../app/api/family/proposals/undo/route.ts"));
const icerik = kodu(read("../lib/proposal-content.ts"));
const depolar = ["recipes", "gatherings", "letters"].map((d) => [d, kodu(read(`../app/api/family/${d}/route.ts`))] as const);
const gorunumler = ["RecipesView", "LettersView"].map((c) => [c, kodu(read(`../components/${c}.tsx`))] as const)
  .concat([["GatheringsDialog", kodu(read("../components/GatheringsDialog.tsx"))]]);
const dialog = kodu(read("../components/ProposalsDialog.tsx")).replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

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
  /*
   * Uygulama mantığı `lib/proposal-apply.ts`e taşındı: tek onay ile toplu
   * onay AYNI yoldan geçsin diye. Rota onu ÇAĞIRIYOR, kendi kopyasını
   * yazmıyor — yazsaydı iki yol ayrışır ve tek tek onaylandığında
   * ilişkileri temizlenen bir silme, toplu onaylandığında temizlenmezdi.
   */
  check(/applyToTree\(data as FamilyData, p\)/.test(patch), "onay ortak uygulayıcıyı çağırıyor");
  check(/applyProposal\(data\.people\[i\], p\)/.test(uygula), "uygulayıcı bayatlık denetiminden geçiyor");
  check(!/applyProposal\(/.test(rota), "rota kendi uygulama kopyasını yazmıyor");
  check(/if \(!uygula\.ok\)/.test(patch) && /status: 409/.test(patch),
    "bayat öneri 409 ile REDDEDİLİYOR (yeni bilgi ezilmiyor)");
  check(/stale: uygula\.fail\.stale/.test(patch), "hangi alanların bayatladığı söyleniyor");

  /*
   * SIRA: önce ağaç yazılıyor, sonra öneri "onaylandı" işaretleniyor. Ters
   * olsaydı ve ağaç yazımı düşseydi, öneri onaylanmış görünür ama değişiklik
   * hiç gerçekleşmezdi — kimsenin fark etmeyeceği bir yalan.
   */
  const iAgac = patch.indexOf("await saveFamilyData(");
  const iOneri = patch.indexOf("await replaceProposals(");
  check(iAgac > -1 && iOneri > iAgac, "ağaç yazımı, öneri damgasından ÖNCE");

  /* Kişi arada silinmişse onay uygulanamaz; "onaylandı" damgası da vurulmaz. */
  check(/if \(i === -1\) return \{ ok: false, fail: \{ kod: "kisi-yok" \} \};/.test(uygula),
    "silinmiş kişi için onay reddediliyor");
  check(/case "kisi-yok"/.test(uygula), "gerekçe kullanıcıya çevriliyor");

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
  check(/createPerson\(data, \{/.test(uygula), "ekleme onayı ortak oluşturucuyu çağırıyor");
  check(!/createPerson\(/.test(rota), "rota kişi oluşturmayı kendi yapmıyor");
  check(!/nextCode\(/.test(rota), "rota kendi kod üretimini yapmıyor");
  {
    const i = uygula.indexOf('kindOf(p) === "ekleme"');
    const j = uygula.indexOf("const i = data.people.findIndex", i);
    const dal = i > -1 && j > i ? uygula.slice(i, j) : "";
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
    const i = uygula.indexOf('kindOf(p) === "silme"');
    const j = uygula.indexOf("const uygula = applyProposal", i);
    const dal = i > -1 && j > i ? uygula.slice(i, j) : "";
    check(/filter\(\(x\) => x\.id !== silinen\)/.test(dal), "kayıt siliniyor");
    check(/parentIds/.test(dal) && /spouseIds/.test(dal), "ebeveyn ve eş bağları temizleniyor");
    check(/formerSpouseIds/.test(dal), "eski eş bağları da temizleniyor");
    check(/associations/.test(dal), "çevre bağları da temizleniyor");
  }

  /* Üç tür de aynı iyimser kilidin ARKASINDA. */
  {
    const iKilit = patch.indexOf("versionMismatch(req");
    const iUygula = patch.indexOf("applyToTree(");
    check(iKilit > -1 && iUygula > iKilit, "uygulama kilitten SONRA");
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

/* --- 8. Geri çekme (madde 35/D) ------------------------------------------ */
/*
 * Geri çekme AYRI uçta duruyor ve durması gerekiyor: karar ucu `canEdit`
 * istiyor, bu uç ise `canPropose`. Aynı gövdeye konsaydı orada iki kapı
 * yan yana dururdu ve hangi dalın hangisinden geçtiği, gövde büyüdükçe
 * okunması gereken bir şeye dönerdi. Kuyruğun kapı testi de bunu kilitliyor
 * ("PATCH dalında canPropose hiç geçmiyor").
 */
check(/if \(!canPropose\(ctx\.role\)\)/.test(cek), "geri çekme her üyeye açık (canPropose)");
check(!/canEdit/.test(cek), "geri çekme yöneticilik İSTEMİYOR");
check(!isPublicPath("/api/family/proposals/withdraw"), "geri çekme ucu oturumsuz açık DEĞİL");

/*
 * SAHİPLİK DENETİMİ SAF KATMANDA. Rota `withdraw()` çağırıyor ve durumu
 * kendisi kurmuyor; kurmuş olsaydı "yalnız kendi önerin" kuralı iki yere
 * bölünür ve biri unutulurdu.
 */
check(/withdraw\(p, ctx\.authorId,/.test(cek), "sahiplik saf katmana ctx.authorId ile soruluyor");
check(!/status: "geri-cekildi"/.test(cek), "rota durumu ELLE kurmuyor");
check(/replaceProposal\(ctx\.treeId, cekildi\.proposal\)/.test(cek), "sonuç depoya yazılıyor");

/*
 * AĞACA DOKUNMUYOR. Bekleyen bir öneri ağaca hiç uygulanmadı; buradan bir
 * yazma çıkması, geri çekmeyi sessizce bir düzenleme yoluna çevirirdi —
 * üstelik `canEdit` kapısının arkasından geçmeden.
 */
check(!/saveFamilyData/.test(cek), "geri çekme ağacı YAZMIYOR");

/* --- 9. Ekran: iki adımlı onay, tek adımlı ret --------------------------- */
{
  /*
   * Onay ağacı hemen değiştiriyor ve kartlar alt alta; yanlış karta basmak
   * tek tıklık bir kaza olmamalı. Ret bilerek tek adımlı: geri alınabilir.
   */
  check(/onClick=\{\(\) => setOnay\(\{ id: p\.id, ne: "onaylandi" \}\)\}/.test(dialog),
    "ONAY düğmesi doğrudan onaylamıyor, doğrulama açıyor");
  check(/onClick=\{\(\) => karar\(p\.id, "reddedildi"\)\}/.test(dialog), "RET tek adımlı");
  check(/onClick=\{\(\) => setOnay\(\{ id: p\.id, ne: "geri-cekildi" \}\)\}/.test(dialog),
    "GERİ ÇEK düğmesi de doğrulama açıyor");
  check(!/window\.confirm/.test(dialog), "tarayıcı confirm'i kullanılmıyor (çevrilemez, engellenebilir)");

  /* Geri çekme düğmesi yalnız ÖNERENDE — sunucu da ayrıca uyguluyor. */
  check(/p\.by === authorId/.test(dialog), "geri çek düğmesi kendi önerisine bağlı");
  check(/canDecide && \(/.test(dialog), "onay/ret düğmeleri karar yetkisine bağlı");

  /* Geri çekme AYRI uca gidiyor, karar ucuna değil. */
  check(/"\/api\/family\/proposals\/withdraw"/.test(dialog), "ekran ayrı ucu çağırıyor");
  {
    const i = dialog.indexOf("const geriCek");
    const govde = dialog.slice(i, dialog.indexOf("\n  };", i));
    check(i > -1, "geriCek bulundu");
    check(!/setBaseVersion/.test(govde), "geri çekme taban sürümü değiştirmiyor (ağaç değişmedi)");
    check(!/onApplied/.test(govde), "geri çekme ağacı tazeletmiyor");
  }

  /*
   * "ekleme"/"silme" önerileri de kartta GÖRÜNMELİ. Kart yalnız `changes`i
   * çiziyordu; o iki türde alan boş olduğu için karar veren, neyi
   * onayladığını bilmeden onaylıyordu.
   */
  check(/p\.kind === "ekleme"\s*\?\s*t\("proposal\.kindAdd"\)/.test(dialog), "ekleme önerisi etiketleniyor");
  check(/p\.person \?\? \{\}/.test(dialog), "önerilen yeni kişinin alanları çiziliyor");
  /* İçerik önerisi de kartta görünüyor: hangi depoya ne ekleneceği. */
  check(/t\("proposal\.kindContent"\)/.test(dialog), "içerik önerisi etiketleniyor");
  check(/proposal\.store\.\$\{p\.content\?\.store/.test(dialog), "hangi koleksiyon olduğu yazıyor");
  check(/p\.content\?\.item \?\? \{\}/.test(dialog), "önerilen kaydın alanları çiziliyor");
}

/* --- 10. Toplu onay (madde 35/E) ----------------------------------------- */
{
  const patch = rota.slice(rota.indexOf("export async function PATCH"));

  /*
   * AĞAÇ TEK KEZ YAZILIYOR. Her öneri için ayrı kaydetseydik N Blob yazması
   * ve N sürüm damgası olurdu; istemcinin taban sürümü her damgada bayatlar
   * ve kullanıcı ikinci onayda KENDİ az önceki onayı yüzünden 409 yerdi.
   */
  const iDongu = patch.indexOf("for (const id of ids)");
  /*
   * İddia döngünün GÖVDESİNE bakıyor, sıraya değil.
   *
   * İlk hâli "kaydetme, döngü başlangıcından SONRA gelsin" diyordu ve
   * kaydetmeyi döngünün İÇİNE taşıyan mutasyonu hiç yakalamadı: içeri
   * taşınan çağrı da döngü başlangıcından sonra geliyor ve sayısı yine bir
   * kalıyor. Yani iddia doğruydu ama yanlış şeyi ölçüyordu.
   */
  const govdeSon = patch.indexOf("\n  }", iDongu);
  const dongu = iDongu > -1 && govdeSon > iDongu ? patch.slice(iDongu, govdeSon) : "";
  check(iDongu > -1 && govdeSon > iDongu, "döngü gövdesi bulundu");
  check(!/saveFamilyData\(/.test(dongu), "döngü GÖVDESİNDE kaydetme yok");
  check(!/replaceProposal/.test(dongu), "döngü GÖVDESİNDE öneri yazma yok");
  check(!/getFamilyData\(/.test(dongu), "döngü GÖVDESİNDE ağaç okuma yok");
  check((patch.match(/await saveFamilyData\(/g) ?? []).length === 1, "kaydetme tek noktada");
  const iYaz = patch.indexOf("await saveFamilyData(");
  check(iYaz > govdeSon, "kaydetme döngüden SONRA");

  /* Kilit ve kuyruk okuması da döngüden ÖNCE — id başına bir okuma değil. */
  check(patch.indexOf("versionMismatch(req") < iDongu, "iyimser kilit döngüden ÖNCE");
  check(patch.indexOf("await listProposals(ctx.treeId)") < iDongu, "kuyruk bir kez okunuyor");
  check(!/findProposal\(/.test(rota), "id başına ayrı okuma YOK");

  /*
   * ÖNERİ DAMGALARI DA TEK YAZMADA. `replaceProposal`ı döngüye almak, 20
   * önerilik bir onayda 20 ayrı çakışma penceresi açardı ve arada biri
   * öneri açarsa toplu onay YARIM kalırdı: ağaç yazılmış, öneriler hâlâ
   * "bekliyor".
   */
  check(/await replaceProposals\(ctx\.treeId, yazilacak\)/.test(patch), "damgalar toplu yazılıyor");
  check(patch.indexOf("await replaceProposals(") > iDongu, "damgalama döngüden sonra");
  {
    const i = store.indexOf("export async function replaceProposals");
    const govde = store.slice(i, store.indexOf("\nexport", i + 10));
    check(i > -1, "replaceProposals bulundu");
    check((govde.match(/mutate\(/g) ?? []).length === 1, "toplu değişiklik TEK mutate ile");
  }

  /*
   * KISMİ BAŞARI. Bayat ya da kişisi silinmiş bir öneri yalnız KENDİSİ
   * düşüyor; ötekiler uygulanıyor. Hepsini geri almak, tek bayat öneriyle
   * yüz onaylık bir kuyruğu kilitlerdi.
   */
  check(/continue;/.test(patch), "düşen öneri döngüyü kesmiyor");
  {
    /* Düşen öneri `yazilacak`a GİRMEMELİ: girseydi uygulanmadan onaylanmış görünürdü. */
    const iHata = patch.indexOf("applyFailMessage(uygula.fail)");
    const iSonra = patch.indexOf("yazilacak.push(", iHata);
    const arasi = iHata > -1 && iSonra > iHata ? patch.slice(iHata, iSonra) : "";
    check(iHata > -1, "uygulama hatası ele alınıyor");
    check(/continue;/.test(arasi), "hata dalı `yazilacak`a ULAŞMADAN kesiliyor");
  }
  check(/agacDegisti/.test(patch), "hiçbiri uygulanmadıysa ağaç yazılmıyor");

  /* Tavan: sınırsız kimlik listesi, tek istekte ağacı N kez tarardı. */
  check(/ids\.length > MAX_TOPLU/.test(patch), "toplu istek tavanı var");

  /* Tekrarlı kimlikler ayıklanıyor: aynı öneri iki kez uygulanmasın. */
  check(/\[\.\.\.new Set\(ham\)\]/.test(patch), "yinelenen kimlikler ayıklanıyor");

  /*
   * TEK öneri yanıtı BİÇİM DEĞİŞTİRMEDİ: `{ proposal, version }`. Toplu
   * yanıta çevrilseydi mevcut ekran sessizce bozulurdu — ve bozulma
   * "onaylandı ama liste tazelenmiyor" gibi görünürdü.
   */
  check(/if \(!toplu\)/.test(patch), "tek öneri yanıtı ayrı");
  check(/ok: true, proposal: yazilacak\[0\], version: yeniSurum/.test(patch), "tek yanıt eski biçimde");
  check(/results: sonuclar\.map/.test(patch), "toplu yanıt hangi önerinin düştüğünü söylüyor");
}

/* --- 11. Ekran: toplu seçim --------------------------------------------- */
{
  /*
   * Toplu işlem TEK istek. Öneri başına ayrı istek atılsaydı her yazma
   * sürüm damgasını ilerletir ve ikinci istek kendi öncekinin damgası
   * yüzünden 409 yerdi — tam da toplu onayın çözmesi gereken şey.
   */
  const i = dialog.indexOf("const topluKarar");
  const govde = i > -1 ? dialog.slice(i, dialog.indexOf("\n  };", i)) : "";
  check(i > -1, "topluKarar bulundu");
  check(/JSON\.stringify\(\{ ids, decision \}\)/.test(govde), "seçilenler TEK istekte gidiyor");
  /*
   * İddia "for yok" DEĞİL — gövdede sonuçları dolaşan meşru bir döngü var
   * ve o iddia onu yanlışlıkla kırmızıya düşürüyordu. Kural tek şey söylüyor:
   * gövdede TEK bir ağ isteği olmalı.
   */
  check((govde.match(/await fetch\(/g) ?? []).length === 1, "gövdede tek bir istek var");
  check(!/\.map\(async/.test(govde) && !/Promise\.all/.test(govde), "istekler paralelleştirilmiyor");
  check(/setBaseVersion\(d\.version\)/.test(govde), "taban sürüm güncelleniyor");
  /* Bayat alanlar kart kart gösteriliyor: toplu bir hata satırı hangi öneride ne olduğunu söylemezdi. */
  check(/r\.stale/.test(govde), "düşen önerilerin bayat alanları kartlarına dağıtılıyor");

  /* Toplu onay da doğrulamadan geçiyor — tek onaydan daha çok şey değiştiriyor. */
  check(/onClick=\{\(\) => setTopluOnay\(true\)\}/.test(dialog), "toplu ONAY doğrulama açıyor");
  check(/onClick=\{\(\) => topluKarar\("reddedildi"\)\}/.test(dialog), "toplu RET tek adımlı");

  /* Seçim kutusu yalnız karar verebilende ve BEKLEYEN öneride. */
  {
    const j = dialog.indexOf('type="checkbox"');
    const once = dialog.slice(Math.max(0, j - 200), j);
    check(j > -1, "seçim kutusu var");
    check(/canDecide && p\.status === "bekliyor"/.test(once), "kutu yalnız karar verebilende ve bekleyende");
  }
  /* Çubuk da öyle: seçecek bir şey yokken yer kaplamamalı. */
  check(/canDecide && bekleyen\.length > 0 && \(/.test(dialog), "toplu çubuk koşullu");
}

/* --- 12. Onayı geri alma (madde 35/F) ------------------------------------ */
{
  /*
   * YETKİ: karar verende. Öneriyi yazana açık olsaydı, üye onaylanmış bir
   * değişikliği tek başına ağaçtan çıkarabilirdi — yani yazma kapısının
   * etrafından dolaşırdı. Kuyruğun ret ucuyla aynı kademe.
   */
  check(/if \(!canEdit\(ctx\.role\)\)/.test(geri), "geri alma canEdit istiyor");
  check(!/canPropose/.test(geri), "geri almada canPropose hiç geçmiyor");
  check(!isPublicPath("/api/family/proposals/undo"), "geri alma ucu oturumsuz açık DEĞİL");

  /* Yalnız ONAYLANMIŞ öneri geri alınabilir: uygulanmamış bir şey geri alınamaz. */
  check(/p\.status !== "onaylandi"/.test(geri), "yalnız onaylanmış öneri geri alınıyor");

  /* İyimser kilit, yazmadan ÖNCE — öbür yazan uçlarla aynı kural. */
  check(/if \(versionMismatch\(req, data\.updatedAt\)\)/.test(geri), "iyimser kilit var");
  {
    const iKilit = geri.indexOf("versionMismatch(req");
    const iYaz = geri.indexOf("await saveFamilyData(");
    check(iKilit > -1 && iYaz > iKilit, "kilit denetimi yazmadan ÖNCE");
  }
  /* Sıra: önce ağaç, sonra öneri damgası. Ters olsaydı ağaç yazımı düştüğünde
   * öneri "geri alındı" görünür, değişiklik ağaçta durmaya devam ederdi. */
  {
    const iYaz = geri.indexOf("await saveFamilyData(");
    const iDamga = geri.indexOf("await replaceProposal(");
    check(iYaz > -1 && iDamga > iYaz, "ağaç yazımı, öneri damgasından ÖNCE");
  }

  /* Mantık ORTAK katmanda; rota kendi tersini yazmıyor. */
  check(/undoApplied\(data, p\)/.test(geri), "rota ortak geri alıcıyı çağırıyor");
  check(!/applyProposal\(/.test(geri) && !/data\.people\.filter/.test(geri),
    "rota kendi geri alma kopyasını yazmıyor");
  check(/markUndone\(p,/.test(geri), "öneri durumu saf katmanda kuruluyor");

  /*
   * "alan" geri alması TERS ÖNERİ ile yapılıyor. Ayrı bir "geri uygula"
   * yazılsaydı bayatlık denetimi ikinci kez yazılmak zorunda kalırdı ve
   * unutulması, onaydan sonra yazılan bilgiyi sessizce yok ederdi.
   */
  check(/applyProposal\(data\.people\[i\], invert\(p\)\)/.test(uygula), "alan geri alması ters öneriyle");

  /*
   * "silme" onayında KOPARILAN BAĞLAR kaydediliyor. Kaydedilmeseydi geri
   * alma, kaydı bağsız bir yetim olarak geri getirirdi: çocukları artık onu
   * ebeveyn olarak listelemiyor ve bu, kaydın kendi `parentIds`inden
   * türetilemez.
   */
  check(/const refs: RemovedRef\[\] = \[\]/.test(uygula), "koparılan bağlar toplanıyor");
  check(/undo: \{ person: kayit, refs \}/.test(uygula), "silinen kaydın tam hâli saklanıyor");
  /* Geri koyma EKLEMELİ: dizinin tamamı yazılsaydı, silmeden SONRA eklenen bir bağ kaybolurdu. */
  {
    const i = uygula.indexOf("for (const ref of u.refs");
    const dal = i > -1 ? uygula.slice(i, uygula.indexOf("return { ok: true };", i)) : "";
    check(i > -1, "bağ geri koyma döngüsü var");
    check(/!x\.parentIds\.includes\(geri\.id\)/.test(dal), "ebeveyn bağı yalnız yoksa ekleniyor");
    check(!/x\.parentIds = ref\./.test(dal), "dizinin tamamı geri YAZILMIYOR");
  }
  /* "ekleme"de oluşan kaydın kimliği onay anında yazılıyor: sonradan türetilemez. */
  check(/undo: \{ createdId: kur\.person\.id \}/.test(uygula), "oluşan kaydın kimliği saklanıyor");
  {
    const patch = rota.slice(rota.indexOf("export async function PATCH"));
    check(/undo: uygula\.undo/.test(patch), "onay, geri alma kaydını öneriye yazıyor");
  }
  /* Geri alma kaydı yoksa geri alma reddediliyor — "sanki oldu" demiyor. */
  check(/kod: "kayit-yok"/.test(uygula), "kayıtsız geri alma reddediliyor");
}

/* --- 13. Ekran: geri al düğmesi ------------------------------------------ */
{
  check(/setOnay\(\{ id: p\.id, ne: "geri-al" \}\)/.test(dialog), "geri al düğmesi doğrulama açıyor");
  {
    const i = dialog.indexOf('p.status === "onaylandi" ? (');
    const dal = i > -1 ? dialog.slice(i, dialog.indexOf(") : (", i)) : "";
    check(i > -1, "onaylanmış kart dalı var");
    check(/canDecide &&/.test(dal), "geri al yalnız karar verebilende");
  }
  {
    const i = dialog.indexOf("const geriAl");
    const govde = i > -1 ? dialog.slice(i, dialog.indexOf("\n  };", i)) : "";
    check(i > -1, "geriAl bulundu");
    check(/"\/api\/family\/proposals\/undo"/.test(govde), "ayrı uca gidiyor");
    /* Ağacı DEĞİŞTİRİYOR: geri çekmenin aksine taban sürüm ve görünüm tazeleniyor. */
    check(/setBaseVersion\(d\.version\)/.test(govde), "taban sürüm güncelleniyor");
    check(/onApplied\?\.\(\)/.test(govde), "ağaç görünümü tazeleniyor");
    check(/mutationHeaders\(\)/.test(govde), "taban sürüm başlığı gönderiliyor");
  }
}

/* --- 14. İçerik önerileri (madde 37) ------------------------------------- */

/*
 * BOŞLUK KAPANDI. Tarif/etkinlik/mektup EKLEME üyeye doğrudan yazma olarak
 * açıktı — "üyenin her değişikliği onaydan geçer" kuralının tek istisnası.
 * Öneri motoru bu depoları da taşıdığına göre gerekçe kalktı.
 */
for (const [ad, src] of depolar) {
  check(!/canPropose/.test(src), `${ad}: doğrudan yazma yolu kapandı`);
  check(/seviye === "oku" \? true : canEdit\(ctx\.role\)/.test(src), `${ad}: okuma dışı her şey canEdit`);
  /* POST hâlâ "ekle" seviyesini soruyor: rotanın ne yaptığı okunur kalsın. */
  const post = src.slice(src.indexOf("export async function POST"), src.indexOf("export async function PUT"));
  check(/guard\("ekle"\)/.test(post), `${ad}: POST kapıdan geçiyor`);
}

/* Üye artık formu doldurup 403 yemiyor: ekleme öneriye yönleniyor. */
for (const [ad, src] of gorunumler) {
  check(/if \(method === "POST" && authority\.proposes\)/.test(src), `${ad}: üyede ekleme öneriye gidiyor`);
  check(/await proposeContent\("/.test(src), `${ad}: ortak öneri yardımcısı kullanılıyor`);
  /*
   * YALNIZ EKLEME dallanıyor. Güncelleme/silme zaten yöneticinin ve onları
   * da öneriye yönlendirmek, var olmayan bir yeteneği varmış gibi
   * göstermek olurdu.
   */
  const i = src.indexOf('if (method === "POST" && authority.proposes)');
  const dal = i > -1 ? src.slice(i, src.indexOf("return;", i)) : "";
  check(!/PUT|DELETE/.test(dal), `${ad}: yalnız ekleme dallanıyor`);
}

/*
 * UYGULAMA AYRI: içerik önerisi AĞACA değil kendi deposuna yazıyor.
 * `applyToTree` senkron ve yazma yapmıyor; çağıran sonunda tek bir
 * `saveFamilyData` yapıyor. İkisi tek işleve sığdırılsaydı senkron
 * uygulayıcı asenkron olur ve "ağaç değişti mi" sorusu bulanıklaşırdı.
 */
check(/export async function applyContent/.test(icerik), "içerik uygulayıcısı ayrı");
check(/addRecipe\(treeId/.test(icerik) && /addGathering\(treeId/.test(icerik) && /addLetter\(treeId/.test(icerik),
  "her depo KENDİ ekleme işleviyle yazılıyor");
/*
 * Derin doğrulama kopyalanmıyor: depo `null` dönerse onay reddediliyor.
 * Kopyalansaydı iki kural zamanla ayrışır ve kullanıcının kendi eklediğinde
 * geçen bir kayıt, öneriyle eklendiğinde reddedilirdi.
 */
check(!/MAX_RECIPES|MAX_LETTERS|normalizeRecipe/.test(icerik), "depo kuralları buraya kopyalanmadı");
check((icerik.match(/ok: false, error:/g) ?? []).length >= 3, "her depo için ret gerekçesi var");

{
  const patch = rota.slice(rota.indexOf("export async function PATCH"));
  check(/kindOf\(p\) === "icerik"/.test(patch), "onay içerik türünü ayırıyor");
  const i = patch.indexOf('kindOf(p) === "icerik"');
  const dal = patch.slice(i, patch.indexOf("if (karar === \"onaylandi\") {", i));
  check(/await applyContent\(ctx\.treeId, p\)/.test(dal), "içerik deposuna yazılıyor");
  /*
   * İçerik onayı `agacDegisti` işaretlemiyor: ağaç dosyasına dokunulmadığı
   * hâlde yeni bir sürüm damgası üretilseydi, açık olan her düzenleme
   * ekranına gereksiz bir çakışma düşerdi.
   */
  check(!/agacDegisti/.test(dal), "içerik onayı ağacı DEĞİŞTİ saymıyor");

  /*
   * Kilit de yalnız ağaca dokunan onaylarda. Uygulansaydı bir tarifi
   * onaylamak, araya başka birinin kişi düzenlemesi girdiği için "ağaç
   * başka bir yerde değişti" diye reddedilebilirdi — hiçbir çakışma
   * olmadığı hâlde.
   */
  check(/const agacaDokunan = ids\.some/.test(patch), "ağaca dokunan öneri var mı diye bakılıyor");
  check(/karar === "onaylandi" && agacaDokunan/.test(patch), "ağaç yalnız gerekiyorsa okunuyor");
}

{
  const post = rota.slice(rota.indexOf("export async function POST"), rota.indexOf("export async function PATCH"));
  check(/buildContent\(body\.store, body\.item\)/.test(post), "içerik gövdesi saf katmanda kuruluyor");
  check(/body\.kind === "icerik"/.test(post), "tür kabul ediliyor");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
