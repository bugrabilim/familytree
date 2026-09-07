import { readFileSync } from "node:fs";
import { isPublicPath } from "../lib/public-routes.ts";
import { hasTreeAccess } from "../lib/tree-access.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
/** Yorumları ayıkla: kuralı ANLATAN metin, kuralın kanıtı değildir. */
const kodu = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * KAPI: `accountId === treeId` DEĞİŞMEZİ — oturum tarafı.
 *
 * ## Bu dosya neden var
 *
 * `docs/YAPIM-SIRASI.md`teki madde 39 ("Storyworth için ayrı giriş kapısı")
 * bu değişmezi kırmayı İLK KEZ teklif eden işti. Gerekçesi "ağaçsız hesap"
 * ihtiyacıydı ve o gerekçe ölçülerek çürütüldü:
 *
 *  1. "Ağaçsız hesap" ZATEN var, adı ÜYE. `lib/tree-context.ts`in davetli üye
 *     dalı üyeye ağaç kaydı hiç sormuyor; girdiği ağacı ve kayıttan okunan
 *     rolünü veriyor.
 *  2. GİRİŞSİZ YAZMA yüzeyi de zaten var — `lib/public-routes.ts`te yedi
 *     tane, madde 39'un beslediği `/hikaye` dâhil. Bağlantıyı alan akrabanın
 *     hesabı yok ve olması da beklenmiyor.
 *  3. Değişmezi kırmanın kullanıcıya görünen farkı SIFIR. Bedeli ise
 *     `lib/tree-access.ts`teki tek satırı iki ayrı ad uzayı arasındaki bir
 *     eşitliğe çevirmek: o satır, eşitlik sağlandığında KAYDA HİÇ BAKMADAN
 *     kurucu yetkisi veriyor.
 *
 * Madde 39 sonunda değişmeze hiç dokunmadan yapıldı (haftalık soru serisi:
 * `lib/story-series.ts`, `lib/story-store.ts`, `app/api/cron/reminders`).
 * Ama teklif bir kez yapıldı, yani yeniden yapılabilir.
 *
 * ## Bu kapı neyi engelliyor, neyi engellemiyor
 *
 * Değişmezin bir gün gerçekten kırılması GEREKEBİLİR. Bu dosya onu
 * yasaklamıyor — KAZARA kırılmasını yasaklıyor. Kıran kişi bu dosyayı da
 * değiştirmek zorunda kalıyor ve bu dosyayı değiştirmek, yukarıdaki üç
 * maddeyi okumak demek. Kararın bilerek alınmasını sağlayan tek mekanizma bu.
 *
 * `tests/home-tree-gate.test.mts` aynı değişmezi Postgres tarafında koruyor
 * (hesabı yaratan yol ev ağacını da yaratmalı); burası onun OTURUM tarafındaki
 * eşi.
 */

const ctx = kodu(read("../lib/tree-context.ts"));
const access = kodu(read("../lib/tree-access.ts"));

/* ══ 1. `TreeContext.treeId` isteğe bağlı/null OLAMAZ ═════════════════════ */
/*
 * Değişmezi kırmanın en sessiz yolu tip düzeyinde: `treeId?: string` ya da
 * `treeId: string | null` yazmak. O anda hiçbir şey bozulmuyor, ama her
 * çağıran (`lib/tree-access.ts`, her API rotası) artık "ağacı olmayan bir
 * bağlam" ihtimaliyle yaşamak zorunda — ve o ihtimali unutan ilk çağıran,
 * `undefined` bir `treeId` ile depo yolu kuruyor.
 */
{
  const i = ctx.indexOf("export type TreeContext");
  check(i > -1, "TreeContext tipi bulundu");
  const tip = ctx.slice(i, ctx.indexOf("\n */", i) > -1 ? ctx.indexOf(";\n", i) + 1 : ctx.length);
  check(/\btreeId: string;/.test(tip), "treeId düz `string`");
  check(!/\btreeId\?:/.test(ctx), "treeId isteğe bağlı DEĞİL");
  check(!/\btreeId: string \| null/.test(ctx) && !/\btreeId: string \| undefined/.test(ctx),
    "treeId null/undefined kabul etmiyor");
  check(/\baccountId: string;/.test(tip), "accountId de düz `string`");
}

/* ══ 2. `resolveActiveTree` AĞAÇSIZ bir durum döndürmüyor ════════════════ */
/*
 * Tip doğru olsa bile gövde delik olabilirdi: `ok: true` dönen ama `treeId`
 * taşımayan tek bir dal, TypeScript'i değil ama değişmezi kırardı — ve o dal
 * eklendiğinde derleyici uyarır, uyarıyı susturmak da `treeId: ""` yazmak
 * kadar kolay. Bu yüzden dallar SAYILIYOR: her başarılı dönüş ağaç taşımak
 * zorunda.
 */
{
  const i = ctx.indexOf("export async function resolveActiveTree");
  check(i > -1, "resolveActiveTree bulundu");
  const govde = ctx.slice(i);
  const basarili = [...govde.matchAll(/\{\s*ok: true,[^}]*\}/g)].map((m) => m[0]);
  check(basarili.length >= 3, `başarılı dönüş dalları bulundu (${basarili.length})`);
  const agacsiz = basarili.filter((d) => !/treeId:/.test(d));
  check(agacsiz.length === 0, `her başarılı dönüş treeId taşıyor (${agacsiz.length} taşımıyor)`);
  /* Ve boş kimlik de ağaçsızlıktır: `treeId: ""` bir kaçış yolu olmamalı. */
  check(!/treeId: ""/.test(govde), "boş treeId ile dönen dal yok");

  /*
   * ÜYE DALI — "ağaçsız hesap" ihtiyacının zaten karşılandığı yer.
   *
   * Üyeye ağaç KAYDI (`accessibleTreeIds`) hiç sorulmuyor: girdiği ağacı ve
   * kayıttan okunan rolünü alıyor. Madde 39'un istediği "ağacı olmayan
   * kullanıcı" tam olarak bu ve değişmezi kırmadan çalışıyor.
   */
  const uye = govde.slice(govde.indexOf("if (!isFounder) {"));
  check(/treeId: accountId,/.test(uye), "üye de ağacını `accountId`den alıyor");
  check(/getTreeAccess\(accountId\)/.test(uye), "üyenin rolü her istekte KAYITTAN okunuyor");
}

/* ══ 3. Ana ağaç dalı `ownedIds` denetimini KORUYOR ══════════════════════ */
/*
 * `hasTreeAccess` iki koldan geçiyor: ana ağaç (`treeId === accountId`) ve
 * SAHİPLİK LİSTESİ. İlk kol kayda hiç bakmıyor ve bakmaması doğru — değişmez
 * onu güvenli kılıyor. Ama değişmez kırılırsa (accountId ile treeId ayrı ad
 * uzayları olursa) o kol, bir hesabın kimliğiyle çakışan HERHANGİ bir ağaca
 * kurucu yetkisi veren bir kapıya dönüşür.
 *
 * İkinci kol kalkarsa daha da beter: sahiplik denetimi tamamen kaybolur ve
 * çerezdeki her `treeId` kabul edilir.
 */
{
  check(
    /return treeId === accountId \|\| ownedIds\.includes\(treeId\);/.test(access),
    "sahiplik denetimi iki kollu ve `ownedIds` kolu duruyor"
  );
  check(/export function hasTreeAccess\(accountId: string, treeId: string, ownedIds: string\[\]\)/.test(access),
    "imza değişmedi (üç zorunlu bağımsız değişken)");

  /* Davranış — saf olduğu için doğrudan çağrılabiliyor. */
  check(hasTreeAccess("a1", "a1", []), "ana ağaç kayıt olmadan erişilebilir");
  check(!hasTreeAccess("a1", "t2", []), "sahip olunmayan ağaç REDDEDİLİYOR");
  check(hasTreeAccess("a1", "t2", ["t2"]), "sahip olunan ek ağaç erişilebilir");
  check(!hasTreeAccess("a1", "t2", ["t3"]), "başkasının ağacı listede yokken reddediliyor");
}

/* ══ 4. Çerezdeki ağaç DENETİMSİZ kabul edilmiyor ════════════════════════ */
/*
 * Aktif ağaç seçimi çerezden/başlıktan geliyor, yani KULLANICININ elinden.
 * `hasTreeAccess` çağrısı kalkarsa bu, "hangi ağacı istersen onu ver"
 * demek olur.
 */
{
  check(/if \(hasTreeAccess\(accountId, cookieVal, owned\)\) \{/.test(ctx),
    "çerezdeki ağaç sahiplik denetiminden geçiyor");
  const i = ctx.indexOf("if (hasTreeAccess(");
  const iDonus = ctx.indexOf("treeId: cookieVal", i);
  check(i > -1 && iDonus > i, "çerezli ağaç YALNIZ denetimden sonra dönüyor");
  /* Denetim düşerse ana ağaca düşülüyor — DARALTMA, genişletme değil. */
  check(/return \{ ok: true, accountId, treeId: accountId, role: homeRole/.test(ctx),
    "denetim geçmezse ana ağaca düşülüyor");
}

/* ══ 5. Madde 39'un gerekçesi zaten karşılanmıştı ════════════════════════ */
/*
 * "Girişsiz kapı" için yeni bir ad uzayı gerekmiyordu: yedi tane zaten
 * açıktı. Bu satırlar teşhisin kanıtı ve aynı zamanda bir koruma — biri
 * `/hikaye`yi oturum duvarının arkasına alırsa haftalık seri sessizce ölür.
 */
for (const yol of [
  "/hikaye/abc",
  "/api/hikaye/abc",
  "/contact/abc",
  "/join",
  "/g/abc",
  "/rsvp",
  "/embed/abc",
  "/api/v1/public/abc",
])
  check(isPublicPath(yol), `${yol} oturumsuz açık (ayrı ad uzayı gerekmedi)`);

/* ══ 6. Postgres tarafındaki eşi hâlâ yerinde ════════════════════════════ */
/*
 * Bu kapı tek başına yetmez: oturum `treeId`si ile Postgres'teki ağaç satırı
 * AYNI kimlikte olmak zorunda. `tests/home-tree-gate.test.mts` onu koruyor;
 * o dosya sessizce gevşerse buradaki koruma da yarım kalır.
 */
{
  const ev = read("./home-tree-gate.test.mts");
  check(ev.includes("ağacın kimliği hesabın kimliği"),
    "ev ağacı kapısı `treeId === accountId` eşleşmesini hâlâ kilitliyor");
  const users = kodu(read("../lib/users.ts"));
  check(/treeId: user\.id/.test(users), "hesap açılırken ağacın kimliği hesabın kimliği");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
