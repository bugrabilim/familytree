import { readFileSync } from "node:fs";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
/** Yorumları ayıkla: kuralı ANLATAN metin, kuralın kanıtı değildir. */
const kodu = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * KAPI: oturum geri çağırma (denetim B4/B5/B6/B8).
 *
 * ## Buradaki asıl mesele
 *
 * Bu uygulamada sunucu tarafında OTURUM KAYDI YOK. Hem NextAuth çerezi
 * (30 gün) hem mobil JWT (60 gün) imzalandıktan sonra kendi başına geçerli;
 * "bu oturumu iptal et" diyebileceğimiz bir yer yok. Dolayısıyla yetki
 * kaldıran her işlem — üyeyi çıkarmak, rolünü düşürmek, şifreyi sıfırlamak —
 * eskiden yalnız GELECEKTEKİ girişleri etkiliyordu; elde jetonu olan
 * içeride kalmaya devam ediyordu.
 *
 * Çözüm tek yerde: `resolveActiveTree` her istekte iddiayı DEPOYA soruyor.
 * Bu dosya o denetimlerin varlığını ve yönünü kilitliyor.
 */

const ctx = kodu(read("../lib/tree-context.ts"));
const users = kodu(read("../lib/users.ts"));
const token = kodu(read("../lib/mobile-token.ts"));
const authTs = kodu(read("../auth.ts"));

/* ══ 1. ÜYELİK HER İSTEKTE DEPODAN SORULUYOR (B4/B6) ════════════════════ */
{
  const i = ctx.indexOf("if (!isFounder) {");
  check(i > 0, "üye dalı bulundu");
  const dal = ctx.slice(i, ctx.indexOf("const homeRole", i));
  check(/getTreeAccess\(accountId\)/.test(dal), "üye kaydı depodan okunuyor");
  check(/if \(!uye\) return \{ ok: false, status: 401 \}/.test(dal),
    "kaydı olmayan üye 401 alıyor (çıkarma canlı oturumu düşürüyor)");
  /*
   * ROL DE KAYITTAN. Jetondaki rol kullanılsaydı, yetkisi düşürülen üye eski
   * rolüyle yazmaya devam ederdi — çıkarmayla aynı arıza, daha sessizi.
   */
  check(/role: normalizeRole\(uye\.role\)/.test(dal), "rol jetondan DEĞİL kayıttan");
  /*
   * Jetondaki rol üye dalında YALNIZ BİR KEZ, o da okuma hatası dalında
   * geçmeli. İlk yazdığımda bunu iç içe bir olumsuz düzenli ifadeyle
   * kurmuştum ve iddia kendi kapsamını kaybedip sahte kırmızıya düştü —
   * konumu saymak hem doğru hem okunur.
   */
  const jetonRolu = [...dal.matchAll(/role: sessionUser\.role/g)];
  check(jetonRolu.length === 1, `jetondaki rol tek yerde (${jetonRolu.length})`);
  const iCatch = dal.indexOf("} catch {");
  const iSon = dal.indexOf("if (!uye)");
  check(iCatch > -1 && jetonRolu[0]?.index !== undefined &&
        jetonRolu[0].index > iCatch && jetonRolu[0].index < iSon,
    "jetondaki rol YALNIZ okuma-hatası dalında");
  /*
   * `memberId` TAŞIMAYAN OTURUM REDDEDİLİYOR (B6).
   *
   * Eskiden `authorId` `accountId`e — yani AĞACIN kimliğine — düşüyordu ve
   * `visibleTo` o oturumu KURUCU sanıyordu: üye, kurucunun önerilerini
   * görüyor ve geri çekebiliyordu. Yazarı bilinmeyen bir üye oturumunun
   * taşıyabileceği tek doğru davranış yeniden giriş istemek.
   */
  check(/if \(!uyeId\) return \{ ok: false, status: 401 \}/.test(dal),
    "kimliksiz üye oturumu reddediliyor");
  check(/authorId: uye\.id/.test(dal), "yazar kimliği üye KAYDINDAN");
  check(!/authorId: accountId/.test(dal), "üye dalında yazar ağacın kimliğine DÜŞMÜYOR");
}

/* ══ 2. ŞİFRE SIFIRLAMA ESKİ OTURUMLARI DÜŞÜRÜYOR (B5) ═════════════════ */
{
  check(/user\.sessionEpoch = new Date\(\)\.toISOString\(\);/.test(users),
    "sıfırlama oturum çağını ileri alıyor");
  const i = users.indexOf("export async function applyRecoveryReset");
  const govde = users.slice(i, users.indexOf("\n}", i));
  check(/sessionEpoch/.test(govde), "çağ damgası sıfırlamanın İÇİNDE");

  check(/const cag = await sessionEpochOf\(accountId\)/.test(ctx), "her istekte çağ soruluyor");
  check(/if \(!Number\.isNaN\(sinir\) && verilis < sinir\) return \{ ok: false, status: 401 \}/.test(ctx),
    "çağdan eski oturum 401 alıyor");
  /*
   * `iat` YOKSA ve çağ VARSA reddediliyor: çağ konmuş bir hesapta "ne zaman
   * verildiği bilinmeyen" bir oturum, tam olarak düşürmek istediğimiz eski
   * oturumdur. `?? Date.now()` gibi bir varsayılan denetimi delik bırakırdı.
   */
  check(/sessionUser\.iat \? sessionUser\.iat \* 1000 : 0/.test(ctx),
    "iat'siz oturum çağ denetimini GEÇEMİYOR");
  /* Denetim, çağ hiç yokken çalışmıyor — eski hesaplar etkilenmiyor. */
  check(/if \(cag\) \{/.test(ctx), "hiç sıfırlanmamış hesapta denetim yok");
}

/* ══ 3. `iat` iki kimlik yolunda da taşınıyor ══════════════════════════ */
/*
 * Denetim `iat`e dayanıyor; taşınmadığı yol denetimin uygulanmadığı yoldur.
 * Mobil jeton 60 gün geçerli — taşımasaydı en uzun ömürlü oturum türü
 * denetimin tamamen dışında kalırdı.
 */
check(/session\.user\.iat = typeof token\.iat === "number"/.test(authTs), "web oturumu iat taşıyor");
check(/iat: typeof payload\.iat === "number"/.test(token), "mobil jeton iat taşıyor");
check(/setIssuedAt\(\)/.test(token), "mobil jeton iat'i İMZALIYOR");
{
  const i = ctx.indexOf("async function resolveSessionUser");
  const govde = ctx.slice(i, ctx.indexOf("\n}", ctx.indexOf("return null;", i)));
  check(/iat: claims\.iat/.test(govde), "mobil yolda iat çözülüyor");
  check(/iat: session\.user\.iat/.test(govde), "web yolunda iat çözülüyor");
}

/* ══ 4. ARIZA YÖNÜ: altyapı hatası kimseyi dışarı atmıyor ═════════════ */
/*
 * Depo okunamadığında üyeyi reddetmek, kendi altyapı hatamızı kullanıcının
 * erişim kaybına çevirmek olurdu — `isAccountDeleted` de aynı kararı
 * veriyor. Ama bu YALNIZ okuma hatasında; "üye bulunamadı" bir hata değil,
 * bir YANIT ve reddediliyor.
 */
{
  const i = ctx.indexOf("try {", ctx.indexOf("if (!isFounder) {"));
  const j = ctx.indexOf("if (!uye)", i);
  const yakala = ctx.slice(ctx.indexOf("} catch {", i), j);
  check(/ok: true/.test(yakala), "okuma hatasında üye dışarı atılmıyor");
  check(j > i, "bulunamayan üye ayrı ele alınıyor");
  const sonra = ctx.slice(j, j + 120);
  check(/status: 401/.test(sonra), "bulunamayan üye REDDEDİLİYOR");
}


/* ── Kurucuya özel uçlar da geri çağırmadan GEÇİYOR ─────────────────────── */
/*
 * Bu kapı mekanizmayı yalnız `tree-context` İÇİNDE kilitliyordu; denetimi
 * hiç ÇAĞIRMAYAN rotaları kimse denetlemiyordu. `/api/trees`,
 * `/api/trees/switch` ve `/api/trees/restore` oturumu doğrudan `auth()`ten
 * okuyordu, dolayısıyla iki koruma da onlarda YOKTU:
 *
 *  · "hesabımı sildim" diyen kullanıcı, açık sekmesinden bekleme süresi
 *    boyunca ağaç kurmaya/silmeye/yeniden adlandırmaya devam edebiliyordu;
 *  · çerezi çalınan kullanıcının belgelenmiş çaresi (şifre sıfırlama) bu
 *    uçlarda işlemiyordu — saldırgan aynı çerezle ağacı yumuşak siliyor,
 *    bekleme süresi dolunca zamanlanmış iş onu KALICI olarak siliyordu.
 */
{
  const ROTALAR = [
    "../app/api/trees/route.ts",
    "../app/api/trees/switch/route.ts",
    "../app/api/trees/restore/route.ts",
  ];
  for (const yol of ROTALAR) {
    const ad = yol.split("/").slice(-2).join("/");
    const src = kodu(read(yol));
    check(/resolveFounder\(/.test(src), `${ad}: ortak kurucu kapısından geçiyor`);
    check(!/\bauth\(\)/.test(src), `${ad}: oturumu DOĞRUDAN okumuyor (kopya kapı yok)`);
  }
  const ctx = kodu(read("../lib/tree-context.ts"));
  const i = ctx.indexOf("export async function resolveFounder");
  const govde = ctx.slice(i, ctx.indexOf("\n}\n", i) + 3);
  check(i > -1, "resolveFounder bulundu");
  check(/resolveActiveTree\(\)/.test(govde),
    "kurucu kapısı geri çağırma denetimlerini TAŞIYAN çözümlemeyi kullanıyor");
  check(/isFounder/.test(govde), "üstüne kurucu şartını ekliyor");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
