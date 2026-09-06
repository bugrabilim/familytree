import { readdirSync, readFileSync, statSync } from "node:fs";
import {
  ACCOUNT_BLOB_PREFIXES,
  TREE_BLOB_PREFIXES,
  treeBlobPaths,
} from "../lib/tree-storage.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

/**
 * KAPI: AĞACA AİT HER DEPO ENVANTERDE.
 *
 * ## Neden bu kapı var
 *
 * `deleteTree` uzun süre yalnız iki dosyayı siliyordu: `family-data-…` ve
 * `tree-access-…`. Oysa ağaç kimliğiyle anahtarlanan sekiz depo daha vardı —
 * tarifler, mektuplar, vefat ilanları, buluşmalar, bağlar, hikâyeler,
 * öneriler ve değişiklik geçmişi. Yani silinen bir ağacın ardından ailenin
 * KENDİ YAZDIĞI içerik depoda kalıyordu; üstelik aynı `treeId` yeniden
 * kullanılsa yabancı içerik yeni ağacın içinde belirirdi.
 *
 * Envanter elle yazılmış bir liste (`lib/tree-storage.ts`) ve elle yazılmış
 * listelerin tek gerçek riski EKSİK KALMAK. Yeni bir depo eklendiğinde onu
 * kimse listeye yazmayabilir ve bu, hiçbir testi kırmadan geçer: silme yine
 * "başarılı" döner, yalnız bir dosya arkada kalır.
 *
 * Bu yüzden kapı kaynağı tarıyor: `lib/` ve `app/api/` altında geçen her
 * `` `<önek>-${…}.json` `` biçimli yol, envanterde karşılığını bulmak zorunda.
 * `tests/store-read-gate.test.mts` aynı fikri okuma tarafı için uyguluyor.
 */

const LIB = new URL("../lib/", import.meta.url).pathname;
const API = new URL("../app/api/", import.meta.url).pathname;

/** Yorumları ayıkla: yorumdaki örnek yol, kodda kullanılan yol değildir. */
const kodu = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function dosyalar(dir: string, uzanti: string): string[] {
  const out: string[] = [];
  for (const ad of readdirSync(dir)) {
    const tam = `${dir}${ad}`;
    if (statSync(tam).isDirectory()) out.push(...dosyalar(`${tam}/`, uzanti));
    else if (ad.endsWith(uzanti)) out.push(tam);
  }
  return out;
}

/** `` `recipes-${treeId}.json` `` → "recipes". */
const YOL = /`([a-z0-9-]+)-\$\{([A-Za-z0-9_.]+)\}\.json`/g;

const ENVANTER = new Set<string>([...TREE_BLOB_PREFIXES, ...ACCOUNT_BLOB_PREFIXES]);

/*
 * `lib/tree-storage.ts` envanterin KENDİSİ; kendini kanıtlayamaz.
 * `lib/backup.ts` yedek yollarını üretiyor (`backups/<gün>/…`) — ağaç
 * kimliğiyle anahtarlı bir depo değil.
 */
const HARIC = new Set(["tree-storage.ts"]);

let bulunan = 0;
const gorulen = new Set<string>();

for (const yol of [...dosyalar(LIB, ".ts"), ...dosyalar(API, ".ts")]) {
  const ad = yol.slice(yol.lastIndexOf("/") + 1);
  if (HARIC.has(ad)) continue;
  const src = kodu(readFileSync(yol, "utf8"));
  for (const m of src.matchAll(YOL)) {
    const [tam, onek, degisken] = m;
    bulunan++;
    gorulen.add(onek);
    check(
      ENVANTER.has(onek),
      `${ad}: ${tam} envanterde yok — "${onek}" ${
        degisken.toLowerCase().includes("account") ? "ACCOUNT_BLOB_PREFIXES" : "TREE_BLOB_PREFIXES"
      } listesine eklenmeli (yoksa silmede arkada kalır)`
    );
  }
}

/*
 * TABAN. Desen ya da yürüyücü bozulursa bütün iddialar "tarayacak bir şey
 * yok" diye kendiliğinden yeşile döner — asıl tehlike o. Bugün 12 yol var;
 * taban biraz altında ki her yeni depoda burayı güncellemek gerekmesin ama
 * taramanın çökmesi görünür olsun.
 */
check(bulunan >= 10, `taranan yol sayısı yeterli (${bulunan})`);

/* --- Yan depoların HEPSİ ağaç envanterinde ------------------------------- */
/*
 * `lib/*-store.ts` dosyalarının tamamı ağaç kimliğiyle anahtarlı. Yukarıdaki
 * döngü yalnız "envanterde mi" diye bakıyor; burası ayrıca doğru LİSTEDE
 * olduklarını söylüyor — hesap envanterine düşen bir yan depo, ağaç
 * silindiğinde silinmezdi.
 */
const agacEnvanteri = new Set<string>(TREE_BLOB_PREFIXES);
for (const ad of readdirSync(LIB).filter((f) => f.endsWith("-store.ts"))) {
  const src = kodu(readFileSync(`${LIB}${ad}`, "utf8"));
  const onekler = [...src.matchAll(YOL)].map((m) => m[1]);
  check(onekler.length > 0, `${ad}: blob yolu bulundu`);
  for (const o of onekler) check(agacEnvanteri.has(o), `${ad}: "${o}" AĞAÇ envanterinde`);
}

/* --- Envanter ÖLÜ girdi taşımasın --------------------------------------- */
/*
 * Ters yön: listede olup kodda karşılığı olmayan bir önek, listeyi yalancı
 * yapar (silinen bir depo hâlâ varmış gibi görünür). Yeni bir depo eklenirken
 * "zaten listede" diye atlanmasına da yol açardı.
 */
for (const o of TREE_BLOB_PREFIXES)
  check(gorulen.has(o), `envanterdeki "${o}" öneki kodda gerçekten kullanılıyor`);
for (const o of ACCOUNT_BLOB_PREFIXES)
  check(gorulen.has(o), `hesap envanterindeki "${o}" öneki kodda gerçekten kullanılıyor`);

/* --- Silme yolu envanteri KULLANIYOR mu ---------------------------------- */
/*
 * Envanter doğru olsa bile silme onu çağırmıyorsa hiçbir işe yaramaz.
 * Eski hâlde silme, yolları kendi içinde ELLE yazıyordu; kapı o hâle
 * dönülmesini engelliyor.
 */
const trees = kodu(readFileSync(`${LIB}trees.ts`, "utf8"));
check(/treeBlobPaths\(/.test(trees), "lib/trees.ts silmede envanteri çağırıyor");
check(
  !/del\(`[a-z-]+-\$\{treeId\}\.json`\)/.test(trees),
  "lib/trees.ts artık elle yazılmış yol silmiyor (envanter atlanamaz)"
);
const lifecycle = kodu(readFileSync(`${LIB}account-lifecycle.ts`, "utf8"));
check(/accountBlobPaths\(/.test(lifecycle), "hesap silme, hesap envanterini çağırıyor");
check(/purgeTreeStorage\(/.test(lifecycle), "hesap silme, ağaçların envanterini de siliyor");

/* --- Envanterin biçimi --------------------------------------------------- */
const ornek = treeBlobPaths("ORNEK");
check(ornek.every((p) => p.endsWith("-ORNEK.json")), "üretilen yollar beklenen biçimde");
check(new Set(ornek).size === ornek.length, "envanterde yinelenen önek yok");

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
