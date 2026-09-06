import { readFileSync, readdirSync } from "node:fs";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
/** Yorumları ayıkla: kuralı ANLATAN metin, kuralın kanıtı değildir. */
const kodu = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * KAPI: katkı verici rolü (madde 35).
 *
 * Sıralı bir yetki hiyerarşisine araya kademe sokmanın tehlikesi şu: kademe
 * bir kez eklenince, `canEdit` ile korunan HER uç yeniden değerlendirilmek
 * zorunda ve unutulan bir uç sessizce yanlış tarafta kalıyor. Üstelik yanlış
 * taraf görünmüyor — kimse "katkı verici bunu da yapabiliyormuş" diye
 * fark etmiyor, ta ki biri ağacı silene kadar.
 *
 * Bu dosya iki şeyi kilitliyor:
 *
 *  1. Katkı vericiye AÇIK uçların TAM listesi. Listeye girmeyen her uç
 *     `canEdit`te kalmak zorunda; yeni bir uç açılırsa bu test kırmızıya
 *     döner ve açılış bir KARAR olur, kazara olmaz.
 *  2. Kişi düzenlemesinin İKİ AŞAMALI kapısı — rol + sahiplik.
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
const ACIK: Record<string, string> = {
  "family/person/route.ts":
    "Yeni kişi eklemek rolün tek doğrudan yazma işi; bu kapalıysa rol zaten anlamsız.",
  "family/person/[id]/route.ts":
    "PUT ikinci aşamada sahiplik istiyor (yalnız kendi eklediği); DELETE hâlâ canEdit.",
  "upload/route.ts":
    "Yüklenen dosya hiçbir kaydı değiştirmiyor, yalnız URL üretiyor. Kapalı olsaydı eklediği kişiye fotoğraf koyamazdı.",
  "family/recipes/route.ts": "POST yeni tarif ekler; PUT/DELETE düzenleme seviyesinde kaldı.",
  "family/gatherings/route.ts": "POST yeni etkinlik ekler; PUT/DELETE düzenleme seviyesinde kaldı.",
  "family/letters/route.ts": "POST yeni mektup ekler; PUT/DELETE düzenleme seviyesinde kaldı.",
  "family/proposals/route.ts":
    "Rolün varlık sebebi: değişiklik ÖNERİSİ açmak. GET/POST katkı verici seviyesinde; KARAR (PATCH) canEdit istiyor — aksi hâlde katkı verici kendi önerisini onaylayıp yazma kapısını dolanırdı.",
};

/* --- 1. Listeye girmeyen hiçbir uç katkı vericiye açık olmasın ----------- */
for (const r of rotalar()) {
  const src = kodu(read(`../app/api/${r}`));
  const acik = /canContribute\(/.test(src);
  if (acik)
    check(r in ACIK, `${r} → katkı vericiye açılmış ama listede yok (gerekçesiz genişletme)`);
  else
    check(!(r in ACIK), `${r} → listede ama artık canContribute kullanmıyor (liste ölü)`);
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
  check(!/canContribute\(/.test(src), `${r} → katkı vericiye KAPALI kalmalı`);
  check(/canEdit\(/.test(src), `${r} → hâlâ bir canEdit kapısı var`);
}
/* Liste ölü kalmasın: adı geçen her rota gerçekten var olmalı. */
{
  const hepsi = rotalar();
  for (const r of ASLA) check(hepsi.includes(r), `"${r}" hâlâ var olan bir rota`);
}

/* --- 3. Kişi düzenlemesi: İKİ AŞAMALI kapı ------------------------------- */
{
  const src = kodu(read("../app/api/family/person/[id]/route.ts"));

  check(/if \(!canContribute\(ctx\.role\)\) return forbidden\(\);/.test(src),
    "birinci aşama: rol denetimi");
  /*
   * İkinci aşama olmadan birinci aşama TEK BAŞINA felaket: katkı verici
   * herkesin kaydını düzenlerdi. Karşılaştırmanın kendisi aranıyor.
   */
  /*
   * Kural TEK YERDE (`canEditPerson`): arayüz de aynı işlevi çağırıyor.
   * İkiye bölünseydi ayrışırlardı ve ayrışmanın yönü kötü olurdu — arayüz
   * "kaydet" gösterir, sunucu 403 döner, kullanıcı ne olduğunu anlamaz.
   */
  check(/canEditPerson\(ctx\.role, ctx\.authorId, data\.people\[index\]\)/.test(src),
    "ikinci aşama: editor değilse SAHİPLİK isteniyor");
  {
    const iRol = src.indexOf("if (!canContribute(ctx.role)) return forbidden();");
    const iSahip = src.indexOf("canEditPerson(ctx.role");
    check(iRol > -1 && iSahip > iRol, "sahiplik denetimi rol denetiminden sonra (kayıt elde olunca)");
  }

  /*
   * SİLME açılmamalı. Kendi eklediği kayıt için bile: ekledikten sonra
   * başkaları onun üstüne bir şey kurmuş olabilir ve silme, düzenlemenin
   * aksine başkasının emeğini de götürür.
   */
  const iDelete = src.indexOf("export async function DELETE");
  const silme = src.slice(iDelete);
  check(iDelete > -1 && /if \(!canEdit\(ctx\.role\)\) return forbidden\(\);/.test(silme),
    "DELETE yalnız canEdit; sahiplik istisnası YOK");
  check(!/canContribute/.test(silme), "DELETE dalında canContribute geçmiyor");
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
  check(/"contributor"/.test(access), "davet rolü olarak kabul ediliyor");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
