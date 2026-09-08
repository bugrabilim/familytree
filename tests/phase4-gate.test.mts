import { readFileSync } from "node:fs";
import { isPublicPath } from "../lib/public-routes.ts";
import { olculdu, olculemedi, phase4Readiness } from "../lib/phase4-readiness.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

/**
 * KAPI: Faz 4 hazırlık ucu (`/api/admin/phase4`).
 *
 * Bu uç, geri dönüşü olmayan tek işin (Faz 4) ÖNÜNDE duruyor. Sözleşmesi üç
 * cümle ve üçü de yalnız kod okunarak doğrulanabilir olmalı:
 *
 *  1. SALT OKUMA — ölçen bir araç ölçtüğü şeyi değiştiremez, hele ki
 *     kendisinin izin verdiği işi uygulayamaz.
 *  2. Yetki kapısı drift ucununkiyle AYNI — hazırlık raporu, kayma raporuyla
 *     aynı hassasiyette; yeni bir yetki kavramı icat etmek ikisini ayrıştırır.
 *  3. Olgular KAYNAKTAN ölçülür — aynayı aynayla karşılaştıran bir kapı her
 *     zaman yeşil yanar.
 */

const rota = read("../app/api/admin/phase4/route.ts");
const drift = read("../app/api/admin/drift/route.ts");
const saf = read("../lib/phase4-readiness.ts");
const authUsers = read("../lib/auth-users.ts");

/* ── 1. SALT OKUMA: yazan hiçbir yöntem yok ──────────────────────────────── */

check(/export async function GET\b/.test(rota), "GET var");
for (const yontem of ["POST", "PUT", "PATCH", "DELETE"]) {
  check(!new RegExp(`export (async )?function ${yontem}\\b`).test(rota), `${yontem} YOK (salt okuma sözleşmesi)`);
}
/*
 * Uç Faz 4'ü UYGULAMAZ. "Hazırsa uygula" biçiminde bir POST, kapıyı
 * koruduğu şeyin tetiğine bağlamak olurdu: ölçümdeki tek bir hata doğrudan
 * geri alınamaz bir işe dönüşürdü.
 */
for (const yazma of [
  "dbUpsertPeople(", "dbDeletePeople(", "dbReplacePeople(", "dbUpsertTree(",
  "dbSetTreeUpdatedAt(", "saveFamilyData(", "importAccountToAuth(",
  "updateAccountAuthPassword(", "deleteAccountAuthUser(", "createUser(",
]) {
  check(!rota.includes(yazma), `uç yazma çağırmıyor: ${yazma}`);
}
check(!/\bput\(/.test(rota), "uç doğrudan blob `put` çağırmıyor");
/* Faz 4'ün KENDİSİ bu PR'da uygulanmıyor: eski yol hâlâ yerinde. */
check(!/users\.json.*sil|deleteUserRow\(/.test(rota), "uç kimlik deposunu emekliye ayırmıyor");

/* ── 2. Yetki kapısı drift ucununkiyle aynı ──────────────────────────────── */

const govdesi = (kaynak: string, ad: string) => {
  const i = kaynak.indexOf(`async function ${ad}(`);
  return i < 0 ? "" : kaynak.slice(i, kaynak.indexOf("\n}", i));
};
{
  const a = govdesi(rota, "guard");
  const b = govdesi(drift, "guard");
  check(a.length > 0 && b.length > 0, "iki uçta da guard() bulundu");
  /*
   * Üç denetimin de AYNEN durduğu iddiası: oturum, founder, yönetici — artı
   * Supabase yapılandırması (yoksa ölçülecek bir şey yok).
   */
  for (const denetim of [
    "await auth()",
    "session.user.isFounder",
    "canManage(session.user.role)",
    "isSupabaseConfigured()",
  ]) {
    check(a.includes(denetim), `phase4 kapısında var: ${denetim}`);
    check(b.includes(denetim), `drift kapısında var (dayanak): ${denetim}`);
  }
  /*
   * Metin olarak da aynı olmalı. Kapılardan biri sessizce gevşerse, ötekiyle
   * karşılaştırma bunu yakalar — "aynı kalıbı izle" kuralının makinede
   * duran hâli.
   */
  const sadelestir = (s: string) => s.replace(/\s+/g, " ").trim();
  check(sadelestir(a) === sadelestir(b), "iki guard gövdesi birebir aynı");
}
{
  // GET gerçekten kapıdan geçiyor mu?
  const get = rota.slice(rota.indexOf("export async function GET"));
  check(/const g = await guard\(\);/.test(get) && /if \("error" in g\) return g\.error;/.test(get),
    "GET kapıdan geçiyor");
  check(get.indexOf("await guard()") < get.indexOf("listTrees("), "kapı ölçümden ÖNCE");
}

/* ── 3. Olgular KAYNAKTAN ölçülüyor ──────────────────────────────────────── */

/*
 * `getFamilyData` Faz 2d'den beri ÖNCE Postgres'e bakıyor. Onunla ölçülen
 * bir "ayna eksik mi" sorusu Postgres'i Postgres'le karşılaştırır ve her
 * ağaç için "eksik yok" der — bir kapının verebileceği en kötü yanıt.
 * Ayrıntı: `tests/blob-source.test.mts`.
 */
check(rota.includes("readFamilyFromBlob("), "ölçüm salt-Blob okuyucusunu kullanıyor");
check(!/\bgetFamilyData\s*\(/.test(rota), "ölçüm getFamilyData KULLANMIYOR");
check(rota.includes("dbCountPeople(") || rota.includes("dbGetPeopleRows("), "ayna tarafı Postgres'ten ölçülüyor");
check(rota.includes("dbGetTreeRow("), "ağaç satırı ve damgası Postgres'ten okunuyor");
check(rota.includes("treeDrift("), "kayma denetimi mevcut çekirdekten geliyor (kopya mantık yok)");

/*
 * BAYRAKLAR KAPIYA GERÇEKTEN GİRİYOR.
 *
 * `bcryptFallbackEnabled` kararı ENGEL üretiyor (`yedek-acik`), ama yalnız
 * rota onu olgulara koyarsa. Alan `Olgular`da zorunlu olduğu hâlde bu
 * yakalanmaz: testler tsconfig dışında (`exclude: ["tests"]`) ve
 * `--experimental-strip-types` altında eksik alan sessizce `undefined`
 * oluyor — yani "yedek kapalı" diye okunuyor. Kapının en tehlikeli hâli:
 * hiçbir şey söylemeden hep yeşil.
 */
check(rota.includes("isBcryptFallbackEnabled()"), "yedek bayrağı olgulara ölçülerek giriyor");
check(rota.includes("isSupabaseLoginEnabled()"), "Supabase giriş bayrağı olgulara giriyor");
{
  const bas = rota.indexOf("const olgular = {");
  const blok = rota.slice(bas, rota.indexOf("phase4Readiness(", bas));
  check(/bcryptFallbackEnabled:\s*isBcryptFallbackEnabled\(\)/.test(blok),
    "alan türetilmiyor, bayrak modülünden okunuyor (kural tek yerde)");
}
check(/listTrees\(g\.accountId/.test(rota), "ağaç kapsamı giriş yapan hesabın ağaçları");
check(!/searchParams\.get\("treeId"\)/.test(rota), "ağaç kimliği dışarıdan alınmıyor");

/* ── 4. Her ölçüm kendi try/catch'inde ───────────────────────────────────── */

/*
 * Tek bir ölçümün düşmesi bütün ucu 500'lememeli; düşen olgu `olculemedi`
 * işaretlenip kapıya öyle verilmeli. Aksi hâlde altyapıdaki geçici bir
 * arıza, kapıyı hiç cevap veremez hâle getirir ve insanlar kapıyı atlar.
 */
check((rota.match(/catch \(e\)/g) ?? []).length >= 6, "ölçümler ayrı ayrı sarılmış");
check((rota.match(/olculemedi</g) ?? []).length >= 6, "düşen ölçümler 'ölçülemedi' olarak işaretleniyor");
check(rota.includes("neden(e)"), "düşen ölçümün NEDENİ taşınıyor");
check(!/return NextResponse\.json\(\s*\{ error/.test(rota.slice(rota.indexOf("export async function GET"))),
  "GET ölçüm hatasında hata gövdesiyle çıkmıyor (kapı yine de cevap veriyor)");

/* ── 5. Yeni oturumsuz uç AÇILMADI ───────────────────────────────────────── */

check(!isPublicPath("/api/admin/phase4"), "hazırlık ucu oturumsuz açık DEĞİL");
{
  const pr = read("../lib/public-routes.ts");
  check(!/phase4|faz4/i.test(pr), "lib/public-routes.ts'e yeni giriş eklenmemiş");
}

/* ── 6. Saf katman: "ölçülemedi → hazır değil" kolu duruyor ──────────────── */

/*
 * Kaynak düzeyinde de, davranış düzeyinde de. Yalnız davranışa bakmak,
 * kolun ileride sessizce başka bir yere taşınmasını görmezdi; yalnız
 * kaynağa bakmak, kolun çalıştığını göstermezdi.
 */
check(/olculemedi/.test(saf), "saf katmanda 'olculemedi' kodu var");
check(/olculdu: false/.test(saf), "ölçüm tipi 'ölçülemedi' dalını taşıyor");
check(!/deger\s*\?\?/.test(saf), "ölçülemeyen değer varsayılana düşürülmüyor (??' ile sessiz temiz)");
{
  const k = phase4Readiness({
    trees: olculdu([{
      treeId: "t", name: "T",
      blobPeople: olculemedi("Blob okunamadı"),
      dbPeople: olculdu(1), inDb: olculdu(true), driftClean: olculdu(true), stamp: olculdu("x"),
    }]),
    accounts: olculdu([{
      accountId: "a", label: "a", isDemo: false, hasPasswordHash: true,
      authUser: olculdu(true), lastSignInAt: olculdu("2026-01-01T00:00:00Z"),
    }]),
    supabaseLoginEnabled: true,
    bcryptFallbackEnabled: false,
  });
  check(k.hazir === false, "tek bir ölçülemeyen olgu bile kapıyı kapatıyor");
  check(k.engeller.some((e) => e.kod === "olculemedi" && e.agirlik === "engel"),
    "'ölçülemedi' engel ağırlığında dönüyor");
}
{
  // Ve boş envanter "temiz" sayılmıyor (ikinci varlık sebebi).
  const k = phase4Readiness({ trees: olculdu([]), accounts: olculdu([]), supabaseLoginEnabled: true, bcryptFallbackEnabled: false });
  check(k.hazir === false, "boş envanterde kapı kapalı");
}

/* ── 7. Auth envanteri: boş liste ile düşen ölçüm ayrı ───────────────────── */

/*
 * `listAuthUsers` hata FIRLATIR, boş liste dönmez. Boş liste dönseydi
 * "Auth'ta kimse yok" diye okunur ve kapı bunu ölçülmüş bir olgu sanardı —
 * "şüphede daima hazır değil" kuralının tam tersi.
 */
{
  const i = authUsers.indexOf("export async function listAuthUsers");
  const govde = authUsers.slice(i);
  check(i > 0, "listAuthUsers dışa aktarılmış");
  check(/throw new Error/.test(govde), "ölçüm düştüğünde hata fırlatıyor");
  check(!/return \[\];/.test(govde), "düşen ölçüm boş liste ile karıştırılmıyor");
  check(/lastSignInAt/.test(govde), "giriş kanıtı (last_sign_in_at) getiriliyor");
  for (const yazma of ["createUser(", "updateUserById(", "deleteUser("]) {
    check(!govde.includes(yazma), `listAuthUsers salt okuma: ${yazma} yok`);
  }
}

/* ── 8. Rapor başkasının aile adını sızdırmıyor ──────────────────────────── */

/*
 * Hesap kapsamı zorunlu olarak GENEL (bir hesabın kilitlenmesi kapıya
 * görünmeli), ama bedeli ödenmeden alınıyor: başkasının hesabı rapora yalnız
 * kimliğiyle giriyor.
 */
check(/u\.id === g\.accountId/.test(rota), "aile adı yalnız çağıranın kendi hesabı için yazılıyor");
check(/`hesap \$\{u\.id\}`/.test(rota), "diğer hesaplar kimlikle maskeleniyor");
check(/isSoftDeleted\(u\)/.test(rota), "silinmiş hesaplar kapsam dışı");

/* --- Ağaç kapsamı GENEL --------------------------------------------------
 *
 * Kapı üretimde bir kez "hazır" dedi ve raporunda tek ağaç vardı; envanterde
 * üç ağaç daha duruyordu. Yani kapı, korumakla görevli olduğu yerde kördü.
 * Kapsamın geri daralması sessiz bir gerileme olurdu — yeşil yine yeşil
 * görünür, yalnız daha az şeye bakar. Bu yüzden kilitleniyor.
 */
{
  // Ağaç bloğunu gövdeden ayır: dosyanın başka yerindeki `listTrees` geçişi
  // iddiayı yanıltmasın (bu tuzağa bu depoda daha önce düşüldü).
  const bas = rota.indexOf("let trees: Olcum<AgacOlgusu[]>");
  const son = rota.indexOf("/* --- Auth envanteri");
  check(bas > 0 && son > bas, "ağaç ölçüm bloğu bulunabiliyor");
  const blok = rota.slice(bas, son);

  check(
    blok.includes("getUsersData"),
    "ağaç kapsamı bütün hesapları geziyor (getUsersData)"
  );
  check(
    (blok.match(/listTrees\(/g) ?? []).length >= 2,
    "her hesabın ağaçları `listTrees` ile sayılıyor (çağıranınki de, başkasınınki de)"
  );
  /*
   * MASKELEME KARŞILAŞTIRMAYA GİREMEZ — bu iddia bir hatanın bedeliyle
   * yazıldı. #335'te başkasının ağacına maskeli bir yer tutucu ad
   * (`ağaç <id>`) veriliyor ve o ad doğrudan `treeDrift`e gidiyordu;
   * `treeDrift` adı Postgres'teki adla karşılaştırdığı için çağıranın
   * kendisine ait OLMAYAN her ağaç sahte bir "kayma var" üretiyordu.
   * Üretimde iki ağaç bu yüzden kirli göründü ve biri o yüzden silindi.
   *
   * Maskeleme bir RAPORLAMA kuralı; ölçümün girdisi olamaz. Yer tutucu
   * yalnız ETİKET argümanında geçebilir.
   */
  check(
    !/agacOlcusu\(\s*\{[^}]*name:\s*`ağaç/.test(blok),
    "maskeli yer tutucu karşılaştırma adı olarak GEÇMİYOR"
  );
  check(
    /agacOlcusu\(t,\s*`ağaç \$\{t\.treeId\}`\)/.test(blok),
    "maskeleme yalnız etiket argümanında"
  );
  check(
    !blok.includes("const liste = await listTrees(g.accountId, g.homeName);\n    const out"),
    "kapsam yalnız çağıranın ağaçlarıyla sınırlı DEĞİL"
  );
  // Okunamayan kayıt sessizce atlanmamalı: tek bir catch bütün olguyu
  // `olculemedi` yapmalı, yoksa kör nokta biçim değiştirip geri gelir.
  check(
    /catch \(e\) \{\s*trees = olculemedi<AgacOlgusu\[\]>\(neden\(e\)\);/.test(blok),
    "ağaç envanteri okunamazsa olgu `olculemedi` oluyor"
  );
  // Başkasının ağaç ADI rapora girmemeli — ama yalnız raporda maskelenmeli.
  check(
    /`ağaç \$\{t\.treeId\}`/.test(blok),
    "başkasının ağacı raporda yalnız kimliğiyle görünüyor"
  );
  // Silinmiş hesaplar kapsam dışı — hesap listesindeki kuralla aynı hizada.
  check(blok.includes("isSoftDeleted"), "yumuşak silinmiş hesap kapsam dışı");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
