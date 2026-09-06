import { readFileSync } from "node:fs";
import { isPublicPath } from "../lib/public-routes.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

/**
 * KAPI: anonim yazma ucu.
 *
 * Bu depodaki TEK anonim yazma yüzeyi. Oturum yok, kimlik yok — dolayısıyla
 * "kim yaptı" diye sorulamaz ve bütün savunma kodun kendisinde. Bu test o
 * savunmanın yerinde durduğunu kilitliyor.
 */

const anon = readFileSync(new URL("../app/api/rsvp/[treeId]/route.ts", import.meta.url), "utf8");
const aile = readFileSync(new URL("../app/api/family/gatherings/route.ts", import.meta.url), "utf8");
const store = readFileSync(new URL("../lib/gathering-store.ts", import.meta.url), "utf8");

/* --- Anonim uç: oturum İSTEMEZ, ama korumasız da değil ------------------ */
check(!anon.includes("resolveActiveTree"), "anonim uç oturum çözmüyor (bilerek)");
check(anon.includes("rateLimitShared"), "anonim uçta paylaşımlı oran sınırı var");
{
  // Hem okuma hem YAZMA sınırlı olmalı.
  const iGet = anon.indexOf("export async function GET");
  const iPost = anon.indexOf("export async function POST");
  check(anon.slice(iGet, iPost).includes("rateLimitShared"), "GET sınırlı");
  check(anon.slice(iPost).includes("rateLimitShared"), "POST sınırlı");
}
{
  /*
   * Yazma sınırı okumadan DAHA SIKI olmalı. Bir davetli bir kez yazar,
   * belki bir kez fikrini değiştirir; dakikada onlarca yazma insan
   * davranışı değil.
   */
  const kapasite = (bolum: string) => {
    const m = /capacity:\s*(\d+)/.exec(bolum);
    return m ? Number(m[1]) : -1;
  };
  const iPost = anon.indexOf("export async function POST");
  const getKap = kapasite(anon.slice(anon.indexOf("export async function GET"), iPost));
  const postKap = kapasite(anon.slice(iPost));
  check(postKap > 0 && getKap > 0, "iki kapasite de okunabildi");
  check(postKap < getKap, `yazma sınırı okumadan sıkı (${postKap} < ${getKap})`);
}

/* --- Jeton: tahmin edilemez olmalı -------------------------------------- */
{
  /*
   * Kimlik doğrulaması olmadığı için jetonun kendisi tek kapı. Kısa ya da
   * sıralı bir değer kaba kuvvetle bulunabilirdi.
   */
  check(/randomBytes\((\d+)\)/.test(store), "jeton rastgele üretiliyor");
  const m = /g\.token = randomBytes\((\d+)\)/.exec(store);
  check(!!m && Number(m[1]) >= 16, `jeton en az 16 bayt (${m?.[1] ?? "?"})`);
}
{
  /*
   * BOŞ jeton hiçbir şeyle eşleşmemeli. Eski/bozuk bir kayıtta `token` boş
   * kalırsa, boş jetonla gelen istek onunla eşleşir ve kapı kendiliğinden
   * açılırdı.
   */
  check(/g\.token && g\.token === t/.test(store) || /x\.token && x\.token === t/.test(store),
    "boş jeton eşleşmiyor");
  check(/if \(!t\) return/.test(store), "boş jeton erkenden reddediliyor");
}

/* --- İki ayrı kapı: jeton + rsvpOpen ------------------------------------ */
/*
 * Geçerli bir jeton, KAPALI bir etkinliğe yazma hakkı vermiyor. Denetim
 * `normalizeRsvp` içinde, yani yazma mantığının yanında ve birim testli —
 * rotaya "önce kontrol et" diye güvenmiyoruz.
 */
check(store.includes("normalizeRsvp"), "yazma normalleştirmeden geçiyor");
{
  const gathering = readFileSync(new URL("../lib/gathering.ts", import.meta.url), "utf8");
  check(/if \(!gathering\.rsvpOpen\) return \{ error: "kapali" \}/.test(gathering),
    "kapalı etkinlik denetimi yazma mantığının içinde");
}

/* --- Anonim yanıt: jeton ve katılımcı listesi ÇIKMAZ -------------------- */
check(anon.includes("publicGathering"), "anonim yanıt genel görünümden geçiyor");
check(!/gathering: g\b/.test(anon), "ham etkinlik nesnesi dönmüyor");
check(!/rsvps/.test(anon), "anonim uç katılımcı listesine hiç dokunmuyor");

/* --- Aile ucu ayrı ve korumalı ------------------------------------------ */
check(aile.includes("resolveActiveTree"), "aile ucu oturum istiyor");
check(aile.includes("canEdit"), "aile ucu düzenleyici yetkisi istiyor");
/*
 * SEVİYELER (madde 35). Kapı eskiden ikiliydi (`guard(true/false)`) ve bu
 * test üç yazma yönteminin de `guard(true)` çağırdığına bakıyordu. Katkı
 * verici kademesi gelince ikili bayrak üçe çıktı; iddia da o ayrımı taşıyor,
 * yoksa "hepsi aynı seviye" beklentisi sessizce yanlış hâle gelirdi.
 *
 * Yeni etkinlik EKLEMEK katkı vericiye açık; var olan etkinliği DEĞİŞTİRMEK
 * ve SİLMEK düzenleyici yetkisi istiyor — katılımcı listesi ve davetler
 * onun içinde.
 */
{
  const seviye: Record<string, string> = { POST: "ekle", PUT: "duzenle", DELETE: "duzenle" };
  for (const [yontem, s] of Object.entries(seviye)) {
    const i = aile.indexOf(`export async function ${yontem}`);
    const govde = i >= 0 ? aile.slice(i, aile.indexOf("\n}", i)) : "";
    check(i >= 0 && govde.includes(`guard("${s}")`), `${yontem} → guard("${s}")`);
  }
  /* "oku" hiçbir yazma yönteminde geçmemeli. */
  for (const yontem of ["POST", "PUT", "DELETE"]) {
    const i = aile.indexOf(`export async function ${yontem}`);
    const govde = i >= 0 ? aile.slice(i, aile.indexOf("\n}", i)) : "";
    check(!govde.includes('guard("oku")'), `${yontem} okuma seviyesinde DEĞİL`);
  }
}

/* --- Yol izinleri -------------------------------------------------------- */
check(isPublicPath("/api/rsvp/agac-1"), "anonim uç oturumsuz açık");
check(!isPublicPath("/api/rsvpx"), "önek benzeri yol açık değil");
check(!isPublicPath("/api/family/gatherings"), "aile ucu KAPALI kalıyor");

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
