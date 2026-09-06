import { readFileSync } from "node:fs";
import { GRACE_DAYS } from "../lib/retention.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

/**
 * KAPI: SİLME UÇLARININ KORUMALARI.
 *
 * Hesap silme, uygulamadaki en yıkıcı işlem: bir ailenin bütün kaydı.
 * `resolveActiveTree` ve rol kapıları bu depoda zaten test ediliyor, ama bu
 * ucun kendine özgü ve KOLAYCA UNUTULABİLİR dört koruması var:
 *
 *   1. şifre teyidi — çerez tek başına yetmez (çalınmış oturum),
 *   2. aile adını yazarak onay — dalgınlık,
 *   3. demo hesabı dokunulmaz — herkese açık ortak oyun alanı,
 *   4. oran sınırı — bu uç aynı zamanda bir şifre deneme yüzeyi.
 *
 * Hepsi tek satırlık koşullar; biri silinince hiçbir tip hatası vermez, hiçbir
 * akış bozulmaz. Kilit bu yüzden kaynak düzeyinde: rotalar `@/` çalışma
 * zamanı içe aktarımı taşıdığı için birim testiyle koşulamıyor.
 *
 * Ayrıca kilitlenen şey SİLMENİN İKİ AŞAMALI olduğu: uçlar YUMUŞAK siler,
 * kalıcı silmeyi yalnız zamanlanmış iş yapar.
 */

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
/** Yorumları ayıkla: korumayı ANLATAN metin, korumanın kendisi değildir. */
const kodu = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ══ 1. HESAP SİLME UCU ═════════════════════════════════════════════════ */
{
  const src = kodu(read("../app/api/account/delete/route.ts"));

  check(/export async function POST\(/.test(src), "hesap silme POST ile");

  /* Oturum + yalnız hesap sahibi. */
  check(/resolveActiveTree\(\)/.test(src), "oturum çözülüyor");
  check(/if \(!ctx\.ok\)/.test(src), "oturumsuz istek reddediliyor");
  check(/!ctx\.isFounder/.test(src), "YALNIZ hesap sahibi (isFounder)");
  check(/status: 403/.test(src), "sahibi olmayana 403");

  /* ŞİFRE — çalınmış çerez tek tıkla hesap silememeli. */
  check(/verifyFounderPassword\(/.test(src), "şifre doğrulanıyor");
  check(/body\.password/.test(src), "şifre gövdeden okunuyor");
  check(
    /if \(!password \|\| !\(await verifyFounderPassword\(/.test(src),
    "şifre YOKSA da reddediliyor (boş şifre kabul edilmiyor)"
  );
  /*
   * Üye şifresi kabul edilmemeli: `verifyLogin` davetli üyelerin şifresini de
   * doğruluyor, o yüzden bu uç ONU çağırmamalı — bir `viewer`, ağacın
   * tamamını silme kararını veremez.
   */
  check(!/verifyLogin\(/.test(src), "üye şifresini de kabul eden verifyLogin KULLANILMIYOR");

  /* ONAY METNİ — dalgınlığa karşı ayrı bir soru. */
  check(
    /confirmMatches\(body\.confirm, user\.familyName\)/.test(src),
    "onay metni hesabın aile adıyla karşılaştırılıyor"
  );
  /*
   * Sonuç KOŞULA bağlı olmalı. Çağrılıp yok sayılan bir denetim, olmayan bir
   * denetimdir — ve kaynak taramasında ikisi aynı görünür.
   */
  check(/if \(!confirmMatches\(/.test(src), "onay eşleşmezse istek reddediliyor");

  /* DEMO — herkese açık oyun alanı silinemez. */
  check(/DEMO_USER_ID/.test(src), "demo hesabı için kapı var");
  check(/ctx\.accountId === DEMO_USER_ID/.test(src), "kapı OTURUMDAKİ hesabı sınıyor");

  /* ORAN SINIRI — ve şifre denemesinden ÖNCE. */
  check(/rateLimitShared\(/.test(src), "oran sınırlı");
  check(/status: 429/.test(src), "sınır aşımında 429");
  const iSinir = src.indexOf("rateLimitShared(");
  const iSifre = src.indexOf("verifyFounderPassword(");
  check(
    iSinir > 0 && iSifre > iSinir,
    "oran sınırı şifre denemesinden ÖNCE (yoksa uç kaba kuvvet aracı olur)"
  );

  /* İKİ AŞAMALI: uç YUMUŞAK siler. */
  check(/softDeleteAccount\(/.test(src), "uç yumuşak silme çağırıyor");
  check(
    !/purgeAccount\(|sweepExpired\(/.test(src),
    "uç KALICI silme çağırmıyor (o yalnız zamanlanmış işin işi)"
  );
  check(/deletedAt/.test(src) && /purgeAt/.test(src), "yanıt bekleme süresini bildiriyor");

  /* Yarım kalan gizleme SESSİZ geçmesin. */
  check(/status: 207/.test(src), "damgalanamayan yol kalırsa 207 dönüyor");
  check(/failed: r\.failed/.test(src), "207 yanıtı hangi yolların kaldığını söylüyor");
}

/* ══ 2. HESAP GERİ ALMA UCU ═════════════════════════════════════════════ */
{
  const src = kodu(read("../app/api/account/restore/route.ts"));

  /*
   * Bu uç OTURUMSUZ olmak zorunda: silinmekte olan hesapla giriş yapılamıyor
   * (`lib/credentials.ts`), dolayısıyla geri almanın da oturumu olamaz.
   * Kimlik doğrudan şifreyle kanıtlanıyor — yani bu bir şifre deneme yüzeyi
   * ve savunması SAYIDA olmak zorunda.
   */
  check(/verifyFounderPassword\(/.test(src), "geri alma şifre istiyor");
  check(/isSoftDeleted\(user\)/.test(src), "yalnız SİLİNMEKTE olan hesap geri alınıyor");
  const kovalar = [...src.matchAll(/rateLimitShared\(/g)].length;
  check(kovalar >= 2, `iki kovalı oran sınırı (IP + ağaç adı) — bulunan: ${kovalar}`);
  check(/status: 429/.test(src), "sınır aşımında 429");
  /*
   * Yanıtlar ayrım yapmamalı: "böyle hesap yok" ile "şifre yanlış" ayrılsaydı
   * uç, hangi ailelerin kayıtlı ve hangilerinin silinmekte olduğunu sorma
   * aracına dönerdi.
   */
  const retSayisi = [...src.matchAll(/return RET\(\)/g)].length;
  check(retSayisi >= 4, `bulunamadı/silinmemiş/şifre hatalı tek mesaja düşüyor (${retSayisi})`);
}

/* ══ 3. AĞAÇ SİLME VE GERİ ALMA ════════════════════════════════════════ */
{
  const trees = kodu(read("../app/api/trees/route.ts"));
  check(/softDeleteTree\(/.test(trees), "ağaç silme YUMUŞAK");
  check(!/purgeTree\(/.test(trees), "ağaç ucu kalıcı silme çağırmıyor");
  check(/deletedAt/.test(trees) && /purgeAt/.test(trees), "yanıt bekleme süresini bildiriyor");
  check(/listDeletedTrees\(/.test(trees), "silinmiş ağaçlar ayrı alanda listeleniyor");

  const restore = kodu(read("../app/api/trees/restore/route.ts"));
  check(/auth\(\)/.test(restore), "geri alma oturum istiyor");
  check(/isFounder/.test(restore), "geri almayı yalnız ağaç sahibi yapabilir");
  check(/restoreTree\(/.test(restore), "geri alma kütüphaneye devrediyor");

  /* ANA AĞAÇ: kural kütüphanede, çünkü hesap akışı da aynı kuralı kullanıyor. */
  const lib = kodu(read("../lib/trees.ts"));
  check(
    /if \(treeId === accountId\) return \{ ok: false, reason: "home" \}/.test(lib),
    "ana ağaç yumuşak silmede de reddediliyor"
  );
  check(
    /export async function purgeTree\([\s\S]{0,220}?if \(treeId === accountId\)/.test(lib),
    "ana ağaç KALICI silmede de bu yoldan gitmiyor (hesap akışının işi)"
  );
}

/* ══ 4. KALICI SİLME KİMİN İŞİ ═════════════════════════════════════════ */
{
  /*
   * Kalıcı silme kullanıcıya AÇILMIYOR. Tek tetikleyici, bekleme süresi
   * dolduğunda koşan zamanlanmış iş. Bir gün bir uca "hemen sil" eklenirse
   * bekleme süresinin tamamı anlamsızlaşır — kapı onu yakalar.
   */
  const izinli = new Set(["cron/backup"]);
  const { readdirSync, statSync } = await import("node:fs");
  const KOK = new URL("../app/api", import.meta.url).pathname;
  const rotalar = (dir: string, base = ""): string[] => {
    const out: string[] = [];
    for (const ad of readdirSync(dir)) {
      const tam = `${dir}/${ad}`;
      if (statSync(tam).isDirectory()) out.push(...rotalar(tam, base ? `${base}/${ad}` : ad));
      else if (ad === "route.ts") out.push(base);
    }
    return out;
  };
  for (const r of rotalar(KOK)) {
    const src = kodu(readFileSync(`${KOK}/${r}/route.ts`, "utf8"));
    const kalici = /purgeAccount\(|purgeTreeStorage\(|sweepExpired\(/.test(src);
    if (kalici) check(izinli.has(r), `${r}: kalıcı silme çağırıyor ama izinli değil`);
  }

  const backup = kodu(read("../app/api/cron/backup/route.ts"));
  check(/sweepExpired\(/.test(backup), "temizlik günlük işe bağlı");
  check(/CRON_SECRET/.test(backup), "zamanlanmış iş sırla korunuyor");
  /*
   * SIRA: temizlik yedekten SONRA. Ters sırada, silinen ağacın son yedeği hiç
   * alınmamış olurdu ve kalıcı silme geri alınamaz.
   */
  const iYedek = backup.indexOf("planRetention(");
  const iTemizlik = backup.indexOf("sweepExpired(");
  check(iYedek > 0 && iTemizlik > iYedek, "temizlik yedekleme adımından SONRA koşuyor");
}

/* ══ 5. SÜRE TEK YERDEN ════════════════════════════════════════════════ */
{
  /*
   * `GRACE_DAYS` tek kaynak olmalı. Kopyalanmış bir "30" ötekiyle ayrışırsa
   * ortaya en kötü hâl çıkar: bir yer ağacı gizler, öteki hâlâ açar — ya da
   * temizlik süresi dolmamış bir ağacı siler.
   */
  check(GRACE_DAYS >= 7, `bekleme süresi anlamlı bir aralıkta (${GRACE_DAYS} gün)`);
  for (const dosya of [
    "../lib/trees.ts",
    "../lib/account-lifecycle.ts",
    "../app/api/account/delete/route.ts",
  ]) {
    const src = kodu(read(dosya));
    check(
      !new RegExp(`\\b${GRACE_DAYS}\\b\\s*\\*?\\s*(86_?400_?000|24)`).test(src),
      `${dosya}: gün sayısı elle hesaplanmıyor (GRACE_DAYS kullanılıyor)`
    );
  }
  const retention = kodu(read("../lib/retention.ts"));
  check(/export const GRACE_DAYS = \d+;/.test(retention), "süre tek bir sabitte");
}

/* --- Geri getirme: SÜRE de ayrım yapmamalı --------------------------------- */
/*
 * Ucun yanıt METNİ üç durumda da aynı ("hesap yok", "zaten canlı", "şifre
 * yanlış"). Ama zamanlama aynı değildi: hesap bulunamadığında anında
 * dönülüyor, bulunduğunda bcrypt karşılaştırması çalışıyordu. Ölçüldü:
 * aradaki fark ~270 ms — yani metin ayrımını kapatan savunma, süre
 * üstünden tam da gizlemeye çalıştığı şeyi söylüyordu ("bu aile adında
 * silinmekte olan bir hesap var").
 *
 * Sahte karşılaştırma o farkı ~38 ms'ye indiriyor (kalanı ölçüm gürültüsü).
 */
{
  const restore = kodu(read("../app/api/account/restore/route.ts"));
  check(/const SAHTE_OZET = "\$2[aby]\$/.test(restore), "sahte bcrypt özeti tanımlı");
  check(/await compare\(/.test(restore), "sahte yolda gerçek bir karşılaştırma koşuyor");
  {
    /* Bedel, hesabın BULUNAMADIĞI dalın içinde ödenmeli. */
    const i = restore.indexOf("if (!user || !isSoftDeleted(user))");
    const j = restore.indexOf("return RET();", i);
    check(i > -1 && j > i && /bedeliOde\(/.test(restore.slice(i, j)),
      "hesap bulunamadığında da bedel ödeniyor");
  }
  /* Sabit bir `setTimeout` gecikmesi YETMEZ: bcrypt maliyet faktörü
   * değişirse taklit geride kalır, fark yeniden açılır. */
  check(!/setTimeout/.test(restore), "sabit gecikmeyle taklit edilmiyor, gerçek maliyet ödeniyor");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
