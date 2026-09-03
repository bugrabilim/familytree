import { readFileSync } from "node:fs";
import { isPublicPath } from "../lib/public-routes.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

/**
 * KAPI: genel okuma API'si üç katmanı da uyguluyor mu, DOĞRU SIRADA mı?
 *
 * Katmanlar farklı işler ve biri ötekinin yerine geçmiyor:
 *   1. `applyPublicVisibility` — sahibin gizlemeyi seçtiği kişiler
 *   2. `viewAll`               — yaşayan/gizli kayıt maskesi
 *   3. `toPublicTree`          — SÖZLEŞME (yalnız v1 alanları)
 *
 * Üçüncüsü olmasaydı `Person`e ileride eklenecek her alan, kimse karar
 * vermeden genel API'ye sızardı. Bu, gizlilikten ayrı bir mesele: maskeden
 * geçmiş bir alan bile "yayımlanmasına karar verilmiş" demek değil.
 */

const src = readFileSync(new URL("../app/api/v1/public/tree/route.ts", import.meta.url), "utf8");

/*
 * ÇAĞRIYI ara, adı geçmesini değil: içe aktarma satırı da adı taşıyor ve
 * yansıtma tümden kaldırılsa bile denetim geçerdi (mutasyon denemesinde
 * tam olarak bu oldu — yalnız yarısı yakalandı).
 */
check(/applyPublicVisibility\(/.test(src), "kişi bazlı kısıt uygulanıyor");
check(/viewAll\(/.test(src), "gizlilik maskesi uygulanıyor");
check(/toPublicTree\(/.test(src), "sözleşme yansıtması uygulanıyor");

/* --- Sıra: kısıt, maskenin İÇİNDE (yani ondan önce) --------------------- */
{
  const i = src.indexOf("const safePeople");
  const ifade = src.slice(i, src.indexOf(";", src.indexOf("viewAll", i)));
  const iv = ifade.indexOf("viewAll");
  const ia = ifade.indexOf("applyPublicVisibility");
  check(iv >= 0 && ia > iv, "kısıt `viewAll`ın argümanında — maskeden ÖNCE");
}

/* --- Ham `people` doğrudan yansıtılmıyor -------------------------------- */
check(!/toPublicTree\(\s*people\b/.test(src), "ham liste sözleşmeye verilmiyor");
check(/toPublicTree\(\s*secilmis/.test(src), "maskelenmiş liste veriliyor");

/* --- Oran sınırı ve sırası ---------------------------------------------- */
check(src.includes("rateLimitShared"), "paylaşımlı oran sınırı kullanılıyor");
{
  /*
   * Sınır jeton DOĞRULAMADAN ÖNCE olmalı: doğrulama Blob'a gidiyor ve
   * geçersiz jetonla dövmek de bir maliyet. Sonraya koymak, kimliksiz bir
   * ucu bedava bir Blob okuma makinesine çevirirdi.
   */
  // ÇAĞRILARI karşılaştır, herhangi bir geçişi değil: içe aktarma satırları
  // dosyanın başında ve sırayı yanıltır (ilk yazışta tam olarak bu oldu).
  check(src.indexOf("await rateLimitShared(") < src.indexOf("await findValidShare("),
    "sınır, jeton doğrulamasından ÖNCE");
}

/* --- CORS: çerezle çağrılamamalı ---------------------------------------- */
check(/Access-Control-Allow-Origin.*\*/.test(src), "genel okuma için CORS açık");
/*
 * `Allow-Credentials` VERİLMEMELİ. Verilseydi bir sitenin ziyaretçisinin
 * oturum çerezi üzerinden çağrılabilirdi; oysa bu uç jetonla çalışıyor ve
 * kimlik taşımıyor.
 */
check(!/Allow-Credentials/i.test(src), "kimlik bilgisi (çerez) kabul edilmiyor");
check(/export async function OPTIONS/.test(src), "ön-uçuş (OPTIONS) yanıtlanıyor");

/* --- Tek kişilik jeton tüm ağacı açmamalı ------------------------------- */
check(/share\.personId/.test(src), "tek kişilik jeton ayrıca ele alınıyor");

/* --- Yalnız okuma -------------------------------------------------------- */
for (const yazma of ["saveFamilyData", "export async function POST", "export async function PUT", "export async function DELETE"]) {
  check(!src.includes(yazma), `uç \`${yazma}\` içermiyor (salt okunur)`);
}

/* --- Yol oturumsuz açık olmalı, ama yalnız bu önek ---------------------- */
check(isPublicPath("/api/v1/public/tree"), "genel API yolu oturumsuz açık");
check(!isPublicPath("/api/v1/tree"), "sürüm kökü açık değil");
check(!isPublicPath("/api/v1/publicx"), "önek benzeri yol açık değil");
check(!isPublicPath("/api/family"), "özel API kapalı kalıyor");

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
