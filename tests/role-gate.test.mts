import { readFileSync, readdirSync } from "node:fs";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
/** Yorumları ayıkla: kuralı ANLATAN metin, kuralın kanıtı değildir. */
const kodu = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * KAPI: rol kademeleri (madde 35, ikinci tur).
 *
 * İki kademe var: `yonetici` doğrudan yazar, `uye` yalnız ÖNERİR. Tehlike
 * şu: `canEdit` ile korunan bir ucun yanlışlıkla `canPropose`a çekilmesi.
 * `canPropose` ağacın HER üyesine açık, yani o kayma "yalnız yönetici"
 * dediğimiz bir işi herkese açmak demek — ve görünmez, çünkü ekranda hiçbir
 * şey değişmez, yalnız sunucu daha fazlasını kabul eder.
 *
 * Bu dosya üç şeyi kilitliyor:
 *
 *  1. `canPropose` ile açılan uçların TAM listesi ve gerekçeleri.
 *  2. Tehlikeli uçların `canEdit`te kalması.
 *  3. HİÇ kapısı olmayan rotaların gerekçeli muafiyet listesi — bu boşluktan
 *     bir kez gerçek bir açık geçti (`ai/suggest` herkese açıktı).
 */

const API = new URL("../app/api/", import.meta.url).pathname;

/** `app/api` altındaki bütün `route.ts` yolları. */
function rotalar(dizin = API, onek = ""): string[] {
  const out: string[] = [];
  for (const g of readdirSync(dizin, { withFileTypes: true })) {
    if (g.isDirectory()) out.push(...rotalar(`${dizin}${g.name}/`, `${onek}${g.name}/`));
    else if (g.name === "route.ts") out.push(`${onek}route.ts`);
  }
  return out;
}

/**
 * Katkı vericiye açılan uçlar ve GEREKÇELERİ.
 *
 * Gerekçe zorunlu: bir ucu bu listeye eklemek yetki genişletmek demek ve
 * "neden" yazılmadan yapılan genişletme, altı ay sonra kimsenin savunamadığı
 * bir açıklık olur.
 */
/**
 * `canPropose` (yani ÜYEYE de) açık uçlar ve GEREKÇELERİ.
 *
 * Gerekçe zorunlu: bir ucu bu listeye eklemek, onu ağacın her üyesine açmak
 * demek ve "neden" yazılmadan yapılan genişletme, altı ay sonra kimsenin
 * savunamadığı bir açıklık olur.
 */
const ACIK: Record<string, string> = {
  "family/proposals/route.ts":
    "Öneri açmak ve kendi önerilerini görmek — rolün varlık sebebi. KARAR (PATCH) canEdit istiyor; aksi hâlde üye kendi önerisini onaylayıp yazma kapısını dolanırdı.",
  "upload/route.ts":
    "Üye, önereceği kişiye fotoğraf ekleyebilmeli. Yükleme hiçbir kaydı DEĞİŞTİRMİYOR, yalnız URL üretiyor; bir kayda bağlanması ayrı istek ve orada kendi kapısı var.",
  "family/recipes/route.ts":
    "BİLİNÇLİ BOŞLUK: öneri motoru bugün yalnız KİŞİ kayıtlarını taşıyor. Kapatsaydık üye tarif ekleyemez hâle gelir ve yerine koyacak bir yol olmazdı — daraltma bir yeteneği yok ederdi. PUT/DELETE düzenleme seviyesinde kaldı.",
  "family/gatherings/route.ts":
    "BİLİNÇLİ BOŞLUK, tariflerle aynı gerekçe: öneri motoru etkinlikleri henüz taşımıyor. PUT/DELETE düzenleme seviyesinde kaldı.",
  "family/letters/route.ts":
    "BİLİNÇLİ BOŞLUK, tariflerle aynı gerekçe: öneri motoru mektupları henüz taşımıyor. PUT/DELETE düzenleme seviyesinde kaldı.",
};


/* --- 1. Listeye girmeyen hiçbir uç katkı vericiye açık olmasın ----------- */
for (const r of rotalar()) {
  const src = kodu(read(`../app/api/${r}`));
  const acik = /canPropose\(/.test(src);
  if (acik)
    check(r in ACIK, `${r} → üyeye açılmış ama listede yok (gerekçesiz genişletme)`);
  else
    check(!(r in ACIK), `${r} → listede ama artık canPropose kullanmıyor (liste ölü)`);
}

/* --- 1b. KAPISIZ rotalar ------------------------------------------------- */
/*
 * Yukarıdaki döngünün KÖR NOKTASI vardı ve gerçek bir açık oradan geçti.
 * Yalnız `canContribute` GEÇEN rotalara bakıyordu; hiçbir rol kapısı
 * OLMAYAN bir rota ona tamamen görünmezdi. `ai/suggest` tam olarak öyleydi:
 * oturumu olan herkese açıktı ve her çağrı ağaç sahibinin YZ kotasını
 * harcıyordu.
 *
 * İddia başlığı "listeye girmeyen hiçbir uç açık olmasın" diyordu ama
 * kanıtladığı şey "canContribute yazan her uç listede"ydi — vaat ettiğinden
 * azını kanıtlayan bir iddia.
 */
{
  /* Rol kapısı gerekmeyen uçlar ve GEREKÇELERİ. */
  const KAPISIZ: Record<string, string> = {
    "auth/[...nextauth]/route.ts": "Kimlik doğrulamanın kendisi; rolden önce geliyor.",
    "register/route.ts": "Hesap açma — henüz rol yok.",
    "mobile/login/route.ts": "Giriş; rolü bu uç ÜRETİYOR.",
    "mobile/register/route.ts": "Kayıt; rolü bu uç üretiyor.",
    "reset-password/route.ts": "Şifre sıfırlama; oturumsuz, kendi jetonu var.",
    "reset-password/email/route.ts": "Şifre sıfırlama e-postası; oturumsuz.",
    "reset-password/token/route.ts": "Jeton doğrulama; oturumsuz.",
    "health/route.ts": "Sağlık ucu; veri döndürmüyor.",
    "cron/reminders/route.ts": "Zamanlanmış iş; CRON_SECRET ile korunuyor.",
    "cron/backup/route.ts": "Zamanlanmış iş; CRON_SECRET ile korunuyor.",
    "hikaye/[treeId]/route.ts": "Girişsiz hikâye yanıtı; jetonla korunuyor.",
    "rsvp/[treeId]/route.ts": "Girişsiz katılım yanıtı; jetonla korunuyor.",
    "contact/answer/route.ts": "Girişsiz iletişim onayı; jetonla korunuyor.",
    "contact/unsubscribe/route.ts": "Girişsiz çıkış; jetonla korunuyor.",
    "v1/public/tree/route.ts": "Herkese açık salt-okunur API; kendi jetonu var.",
    "account/email/route.ts": "Hesap sahibinin kendi adresi; isFounder istiyor.",
    "account/email/verify/route.ts": "Adres doğrulama; jetonla.",
    "account/notify/route.ts": "Hesap sahibinin kendi tercihi; isFounder istiyor.",
    "account/restore/route.ts":
      "Silinmekte olan hesabı geri alma; oturum ve rol YOK, kimlik şifreyle kanıtlanıyor.",
    "admin/drift/route.ts": "Kendi ağaçlarının denetimi; isFounder + canManage.",
    "admin/migrate/route.ts": "Kendi ağaçlarının göçü; isFounder + canManage.",
    "trees/route.ts": "Kendi ağaç listesi; kapsam hesabın kendisi.",
    "trees/switch/route.ts": "Aktif ağaç seçimi; kapsam hesabın kendisi.",
    "tree/join/route.ts": "Davetle katılma; rolü davet belirliyor.",
    "family/route.ts": "Ağacı OKUMA; okumak için rol kapısı yok.",
    "family/activity/route.ts": "Etkinlik akışını okuma.",
    "family/export/route.ts": "Kendi ağacını dışa aktarma.",
    "family/report-card/route.ts": "Okuma; karne hesabı.",
    "family/proposals/route.ts": "Kendi kapıları var (canContribute/canEdit).",
    "records/search/route.ts": "Dış kayıt arama; yazma yok.",
    "family/person/[id]/contact/route.ts": "Kendi guard'ı canEdit çağırıyor.",
  };

  for (const r of rotalar()) {
    const src = kodu(read(`../app/api/${r}`));
    const kapili = /canEdit\(|canPropose\(|canManage\(|isFounder|CRON_SECRET|verifyWebhook\(|isAdminAccount\(/.test(src);
    if (kapili) continue;
    check(r in KAPISIZ, `${r} → hiçbir rol kapısı yok ve muafiyet listesinde de değil`);
  }
  /* Muafiyet listesi ÖLÜ kalmasın. */
  const hepsi = rotalar();
  for (const r of Object.keys(KAPISIZ)) {
    check(hepsi.includes(r), `"${r}" hâlâ var olan bir rota`);
    check(KAPISIZ[r].trim().length > 15, `"${r}" için gerekçe yazılmış`);
  }
}
for (const [r, neden] of Object.entries(ACIK))
  check(neden.trim().length > 25, `"${r}" için gerekçe yazılmış`);

/* --- 2. Tehlikeli uçlar KESİNLİKLE kapalı -------------------------------- */
/*
 * Aşağıdakiler yanlışlıkla açılırsa bedeli geri alınamaz: ağacı temizlemek,
 * toplu silmek, başka bir ağacı birleştirmek, geçmişten geri yüklemek.
 * Ayrıca YZ uçları — `ai/act` doğrudan ağaca yazıyor, yani orada açılan bir
 * kapı öbür kapıların hepsini dolanmanın yolu olurdu.
 */
const ASLA = [
  "family/clear/route.ts",
  "family/bulk-delete/route.ts",
  "family/merge/route.ts",
  "family/merge-all/route.ts",
  "family/import/route.ts",
  "family/history/route.ts",
  "family/history/restore/route.ts",
  "family/reorder/route.ts",
  "family/cover/route.ts",
  "family/demo/route.ts",
  "family/starter/route.ts",
  "family/person/[id]/contact/route.ts",
  "family/stories/route.ts",
  "family/obituaries/route.ts",
  "family/bonds/route.ts",
  "tree/graft/route.ts",
  "tree/merge-tree/route.ts",
  "ai/act/route.ts",
  "ai/chat/route.ts",
  "ai/extract/route.ts",
  "ai/voice/route.ts",
];
for (const r of ASLA) {
  const src = kodu(read(`../app/api/${r}`));
  check(!/canPropose\(/.test(src), `${r} → üyeye KAPALI kalmalı`);
  check(/canEdit\(/.test(src), `${r} → hâlâ bir canEdit kapısı var`);
}
/* Liste ölü kalmasın: adı geçen her rota gerçekten var olmalı. */
{
  const hepsi = rotalar();
  for (const r of ASLA) check(hepsi.includes(r), `"${r}" hâlâ var olan bir rota`);
}

/* --- 3. Kişi düzenlemesi: TEK kapı, yalnız yönetici ---------------------- */
/*
 * Burada İKİ AŞAMALI bir kapı vardı: önce rol, sonra SAHİPLİK (katkı verici
 * kendi eklediğini düzeltebiliyordu). Yeni modelde üyenin EKLEMESİ de onaydan
 * geçtiği için "kendi eklediği" diye doğrudan yazılmış bir kayıt zaten
 * oluşmuyor; istisna, artık var olmayan bir duruma bakan ölü bir kural
 * olurdu ve imzadan da kaldırıldı.
 */
{
  const src = kodu(read("../app/api/family/person/[id]/route.ts"));

  check(/if \(!canEditPerson\(ctx\.role\)\) return forbidden\(\);/.test(src),
    "PUT yalnız yönetici (ortak kural üzerinden)");
  /*
   * Sahiplik denetimi KALMAMALI. Kalsaydı üye, öneriden geçmeden yazabildiği
   * bir kayıt varmış gibi davranan ölü bir dal taşırdık ve o dal bir gün
   * yeniden canlanabilirdi.
   */
  check(!/addedBy !== ctx\.authorId/.test(src), "sahiplik istisnası kalmadı");
  check(!/canPropose/.test(src), "PUT/DELETE üyeye kapalı");

  const iDelete = src.indexOf("export async function DELETE");
  const silme = src.slice(iDelete);
  check(iDelete > -1 && /if \(!canEdit\(ctx\.role\)\) return forbidden\(\);/.test(silme),
    "DELETE yalnız yönetici");
}

/* --- 4. `addedBy` sunucu alanı ------------------------------------------- */
/*
 * İstemciden yazılabilseydi katkı verici, başkasının kaydına kendi kimliğini
 * geçirip onu düzenlenebilir hâle getirirdi — yani sahiplik denetimi
 * kendi kendini iptal ederdi.
 */
{
  const alanlar = kodu(read("../lib/person-fields.ts"));
  check(/addedBy:/.test(alanlar.slice(alanlar.indexOf("EXCLUDED_FIELDS"))),
    "addedBy kayıt defterinin DIŞINDA (gövdeden kabul edilmiyor)");
  const post = kodu(read("../app/api/family/person/route.ts"));
  check(/addedBy: ctx\.authorId/.test(post), "ekleyen SUNUCUDA yazılıyor");
  check(!/addedBy.*body/.test(post), "gövdeden okunan bir addedBy yok");
}

/* --- 5. Rolün kendisi davet edilebilir ----------------------------------- */
{
  const access = kodu(read("../app/api/tree/access/route.ts"));
  /*
   * DAVET ROLÜ TEK: `uye`. Yönetici ağacı KURAN hesap, davetle verilen bir
   * kademe değil — buraya `yonetici` eklemek, bir bağlantıyla ağacın
   * kontrolünü devretmek olurdu.
   */
  check(/const ROLES: TreeRole\[\] = \["uye"\];/.test(access), "davet yalnız üye rolünü kabul ediyor");
  check(!/"yonetici"/.test(access), "davetle yöneticilik verilemiyor");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
