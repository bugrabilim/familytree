import { readdirSync, readFileSync, statSync } from "node:fs";
import { versionMismatch } from "../lib/version-lock.ts";
import { DEMO_USER_ID, isDemoTree } from "../lib/demo-id.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
/** Yorumları ayıkla: korumayı ANLATAN metin, korumanın kendisi değildir. */
const kodu = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * KAPI: iyimser kilit demo ağacında KAPALI, başka her ağaçta AÇIK.
 *
 * ## Neden bir muafiyet var
 *
 * Demo herkese açık ortak bir oyun alanı ve her girişte sıfırlanıyor
 * (`prepareDemoAccount`). Sıfırlama ağaca YENİ BİR DAMGA yazıyor; o sırada
 * içeride olan ziyaretçinin elindeki damga bayatlıyor ve bir sonraki
 * düzenlemesi 409 yiyor. Yani ikinci ziyaretçinin GİRİŞİ birincinin
 * çalışmasını kilitliyordu — ürünün şartının tam tersi: "biri demo hesabında
 * ağacı silerken, başka biri işlem yapmaya devam edebilmeli."
 *
 * ## Neden bu kapı
 *
 * Bir muafiyetin iki ölüm biçimi var ve ikisi de sessiz:
 *
 *  1. **Daralma.** Yeni bir yazan rota eklenir, `treeId`yi yanlış/eksik
 *     geçer, demo yine kilitlenir. Buna karşı `treeId` ZORUNLU parametre —
 *     ve aşağıda her çağrı yerinin gerçekten BAĞLAMDAN gelen bir kimlik
 *     geçtiği taranıyor (sabit dizge sayılmıyor).
 *  2. **Yayılma.** Biri "tutarlılık olsun" diye muafiyeti bütün ağaçlara
 *     genişletir. O gün gerçek ailelerde iki üye birbirinin düzenlemesini
 *     sessizce ezmeye başlar — #313–#317'nin kapattığı hatanın ta kendisi.
 *     Buna karşı aşağıda muafiyetin YALNIZ demo kimliğine bağlı olduğu hem
 *     davranışla (yakın-kimlik taraması) hem kaynakla kilitleniyor.
 */

/* ══ 1. DAVRANIŞ — saf birim testi ══════════════════════════════════════ */
/*
 * Kilidin gövdesi bilerek bağımsız bir dosyada (`lib/version-lock.ts`), tam
 * da burada ÇAĞRILABİLSİN diye: kaynak taraması bir kararın doğruluğunu
 * kanıtlayamaz, yalnız kodun görüntüsünü kilitler.
 */
const istek = (base?: string) => ({
  headers: { get: (k: string) => (k === "x-base-version" && base !== undefined ? base : null) },
});

{
  /* Demo: bayat damga bile yazmayı ENGELLEMİYOR (son yazan kazanır). */
  check(versionMismatch(istek("T1"), "T2", DEMO_USER_ID) === false,
    "demo: uyuşmayan damga çakışma SAYILMIYOR");
  /* Gerçek ağaç: bayat damga hâlâ çakışma — koruma yerinde duruyor. */
  check(versionMismatch(istek("T1"), "T2", "kaya-ailesi") === true,
    "gerçek ağaç: uyuşmayan damga çakışma");
  /* Başlık yoksa iki tarafta da engel yok (mobil/betikler geriye dönük uyumlu). */
  check(versionMismatch(istek(), "T2", DEMO_USER_ID) === false, "demo: başlık yoksa engel yok");
  check(versionMismatch(istek(), "T2", "kaya-ailesi") === false, "gerçek ağaç: başlık yoksa engel yok");
  /* Damga uyuşuyorsa zaten çakışma yok — muafiyetin bunu değiştirmediği. */
  check(versionMismatch(istek("T2"), "T2", "kaya-ailesi") === false, "gerçek ağaç: aynı damga geçiyor");
  check(versionMismatch(istek("T2"), "T2", DEMO_USER_ID) === false, "demo: aynı damga geçiyor");
}

{
  /*
   * MUAFİYET YALNIZ DEMO KİMLİĞİNE. Yakın duran kimlikler bilerek seçildi:
   * `startsWith`/`includes` gibi gevşek bir eşleşmeye kayılırsa ya da kimlik
   * normalize edilirse (küçük harfe indirme, kırpma) bu satırlar kırmızıya
   * döner. Kilit, gerçek ağaçlarda ASLA gevşememeli.
   */
  for (const yakin of [
    "", " ", "demo", "demo-hesap-2", "demo-hesap ", " demo-hesap",
    "DEMO-HESAP", "Demo-Hesap", "x-demo-hesap", "hesap", "demohesap",
    "demo-hesap/2", "kurucu-1", "00000000-0000-0000-0000-000000000000",
  ])
    check(versionMismatch(istek("T1"), "T2", yakin) === true,
      `muafiyet "${yakin}" kimliğine SIZMIYOR`);

  /* Genel bir "hep muaf" kısa devresi yok: en az bir kimlik 409 üretiyor. */
  check(versionMismatch(istek("T1"), "T2", "kaya-ailesi") === true,
    "genel kısa devre YOK (kilit hâlâ çakışma üretebiliyor)");
}

{
  /* Ürünün asıl senaryosu: A içerideyken B giriyor ve ağaç sıfırlanıyor. */
  const aOkudu = "2026-09-07T10:00:00.000Z";      // A'nın elindeki sürüm
  const bSifirladi = "2026-09-07T10:00:03.000Z";  // B'nin girişi yeni damga yazdı
  check(versionMismatch(istek(aOkudu), bSifirladi, DEMO_USER_ID) === false,
    "demo: ikinci ziyaretçinin girişi birincinin çalışmasını KİLİTLEMİYOR");
  /* Aynı çarpışma gerçek bir ailede hâlâ durduruluyor. */
  check(versionMismatch(istek(aOkudu), bSifirladi, "kaya-ailesi") === true,
    "gerçek ağaç: aynı çarpışma hâlâ 409");
}

{
  /* Kimlik yardımcısı: tek karşılaştırma, sürpriz yok. */
  check(isDemoTree(DEMO_USER_ID), "isDemoTree demo kimliğini tanıyor");
  check(!isDemoTree("kaya-ailesi") && !isDemoTree("") && !isDemoTree(null) && !isDemoTree(undefined),
    "isDemoTree başka hiçbir şeye evet demiyor");
  check(DEMO_USER_ID === "demo-hesap", "demo kimliği değişmedi");
}

/* ══ 2. İMZA — `treeId` ZORUNLU ═════════════════════════════════════════ */
/*
 * Zorunluluk bu işin tek mekanik güvencesi: parametre isteğe bağlı olsaydı,
 * onu geçmeyi unutan yeni bir rota derleyiciden sessizce geçer ve demo o
 * rotada yine kilitlenirdi. Hata da ancak canlıda, ikinci ziyaretçi içeri
 * girince görülürdü.
 */
const kilitSrc = read("../lib/version-lock.ts");
{
  const i = kilitSrc.indexOf("export function versionMismatch(");
  check(i > -1, "versionMismatch bulundu");
  const j = kilitSrc.indexOf("): boolean", i);
  const imza = kilitSrc.slice(i + "export function versionMismatch(".length, j);

  /* Parametreleri derinlik farkındalıklı ayır: `req` tipi süslü parantezli. */
  const params: string[] = [];
  let derinlik = 0, son = 0;
  for (let k = 0; k < imza.length; k++) {
    const c = imza[k];
    if (c === "{" || c === "(" || c === "[") derinlik++;
    else if (c === "}" || c === ")" || c === "]") derinlik--;
    else if (c === "," && derinlik === 0) { params.push(imza.slice(son, k).trim()); son = k + 1; }
  }
  const kalan = imza.slice(son).trim();
  if (kalan) params.push(kalan);

  check(params.length === 3, `imza ÜÇ parametre alıyor (${params.length})`);
  check(/^current\s*:\s*string$/.test(params[1] ?? ""), "ikinci parametre `current: string`");
  check(/^treeId\s*:\s*string$/.test(params[2] ?? ""), "üçüncü parametre tam olarak `treeId: string`");
  /* İsteğe bağlı yapmanın üç yolu da kapalı: `?`, varsayılan değer, `| undefined`. */
  check(!/treeId\s*\?/.test(imza), "`treeId` isteğe bağlı DEĞİL (`?` yok)");
  check(!/treeId[^,]*=/.test(imza), "`treeId`nin varsayılan değeri YOK");
  check(!/treeId[^,]*undefined/.test(imza), "`treeId` `undefined` kabul etmiyor");
  /*
   * Çalışma zamanı arity'si: varsayılan değer eklenirse `length` düşer, yani
   * bu satır kaynak taramasından bağımsız ikinci bir kilit.
   */
  check(versionMismatch.length === 3, "çalışma zamanında da üç parametre bekliyor");
}

/* ══ 3. MUAFİYET YALNIZ DEMOYA BAĞLI — kaynak ═══════════════════════════ */
{
  const i = kilitSrc.indexOf("export function versionMismatch(");
  const govde = kilitSrc.slice(kilitSrc.indexOf("{", kilitSrc.indexOf("): boolean", i)), kilitSrc.indexOf("\n}", i));
  const g = kodu(govde);

  check(/if\s*\(isDemoTree\(treeId\)\)\s*return false;/.test(g),
    "muafiyet KİMLİĞE bağlı tek bir erken çıkış");
  check((g.match(/return false/g) ?? []).length === 1, "gövdede tek bir `return false` var");
  check(!/return true/.test(g), "koşulsuz `return true` yok");
  /* Kilidin kendisi duruyor: muafiyet, denetimi silmenin kılıfı değil. */
  check(/return\s+!!base\s+&&\s+base\s*!==\s*current;/.test(g), "gerçek ağaçlar için kilit yolu duruyor");
  check(g.includes('get("x-base-version")'), "sürüm hâlâ başlıktan okunuyor");

  /*
   * KİMLİK KOPYALANMADI. Dizge elle kopyalansaydı, kimlik bir gün
   * değiştiğinde kopya sessizce eskir ve muafiyet ARTIK HİÇBİR ağaca uymaz:
   * demo yine kilitlenir, üstelik kimse fark etmeden.
   */
  check(!/"demo-hesap"|'demo-hesap'/.test(kilitSrc), "demo kimliği bu dosyaya KOPYALANMAMIŞ");
  check(/import \{ isDemoTree \} from "\.\/demo-id\.ts";/.test(kilitSrc), "kimlik tek tanım noktasından geliyor");
  /* Başka bir ağaca muafiyet açan ikinci bir koşul yok. */
  check(!/treeId\s*===/.test(g), "`treeId` doğrudan bir dizgeyle karşılaştırılmıyor");
  check(!/startsWith|includes|toLowerCase|test\(/.test(g), "kimlik eşleşmesi gevşetilmemiş");
}

{
  /* Tek tanım noktası: `lib/demo-account.ts` kimliği yeniden DIŞA aktarıyor. */
  const hesap = read("../lib/demo-account.ts");
  check(!/export const DEMO_USER_ID/.test(hesap), "demo-account kimliği YENİDEN TANIMLAMIYOR");
  check(/export \{ DEMO_USER_ID \};/.test(hesap), "demo-account kimliği yeniden dışa aktarıyor");
  check(/from "\.\/demo-id\.ts"/.test(hesap), "kimlik `lib/demo-id.ts`ten geliyor");

  /*
   * Döngü gerçekten kesilmiş olmalı: kimlik dosyası hiçbir şey içe
   * aktarmıyor. `lib/demo-account.ts` → `@/lib/blob` bağı sürdüğü için
   * kimliği oradan okumak `blob → demo-account → blob` çemberini kapatırdı.
   */
  const kimlik = read("../lib/demo-id.ts");
  check(!/^\s*import /m.test(kimlik), "lib/demo-id.ts bağımlılıksız (içe aktarımı yok)");
  check(/export const DEMO_USER_ID = "demo-hesap";/.test(kimlik), "kimlik burada tanımlı");
  const iFn = kimlik.indexOf("export function isDemoTree");
  check(/return treeId === DEMO_USER_ID;/.test(kodu(kimlik.slice(iFn))),
    "isDemoTree TEK bir kimlik karşılaştırması");
}

{
  /* `lib/blob.ts` yalnız yeniden dışa aktarıyor — rota içe aktarımları sabit. */
  const blob = read("../lib/blob.ts");
  check(/export \{ versionMismatch \} from "@\/lib\/version-lock";/.test(blob),
    "blob.ts kilidi yeniden dışa aktarıyor");
  check(!/function versionMismatch/.test(blob), "blob.ts'te ikinci bir gövde YOK");
}

/* ══ 4. ÇAĞRI YERLERİ — hepsi bağlamdan bir kimlik geçiyor ══════════════ */
/*
 * Liste değil TARAMA: yarın eklenen rota listeye girmediği için sessizce
 * muafiyet dışında kalmasın.
 */
function rotalar(dir: string): string[] {
  const out: string[] = [];
  for (const ad of readdirSync(dir)) {
    const tam = `${dir}/${ad}`;
    if (statSync(tam).isDirectory()) out.push(...rotalar(tam));
    else if (ad === "route.ts") out.push(tam);
  }
  return out;
}

/** `versionMismatch(...)` çağrısının argümanlarını derinlik farkındalıklı ayır. */
function argumanlar(src: string, i: number): string[] {
  const acik = src.indexOf("(", i);
  let derinlik = 0, son = acik + 1;
  const out: string[] = [];
  for (let k = acik; k < src.length; k++) {
    const c = src[k];
    if (c === "(" || c === "[" || c === "{") derinlik++;
    else if (c === ")" || c === "]" || c === "}") {
      derinlik--;
      if (derinlik === 0) { out.push(src.slice(son, k).trim()); break; }
    } else if (c === "," && derinlik === 1) { out.push(src.slice(son, k).trim()); son = k + 1; }
  }
  return out;
}

const kok = new URL("../app/api", import.meta.url).pathname;
let cagri = 0;
for (const dosya of rotalar(kok)) {
  const src = readFileSync(dosya, "utf8");
  const ad = dosya.slice(kok.length + 1).replace(/\/route\.ts$/, "");
  let i = src.indexOf("versionMismatch(");
  while (i > -1) {
    cagri++;
    const args = argumanlar(src, i + "versionMismatch".length);
    check(args.length === 3, `${ad}: çağrı üç argüman veriyor (${args.length})`);
    const treeArg = args[2] ?? "";
    /*
     * Ölçüt "bir şey geçmiş" değil, BAĞLAMDAN gelen bir kimlik geçmiş
     * olması. Sabit dizge (`"demo-hesap"`) muafiyeti yanlış ağaca uygular ve
     * o rotada kilidi HERKES için kapatır — kabul edilemez.
     */
    check(!/["'`]/.test(treeArg), `${ad}: kimlik sabit dizge DEĞİL (${treeArg})`);
    check(/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*\.treeId$/.test(treeArg),
      `${ad}: kimlik bağlamdan geliyor (${treeArg})`);

    /*
     * 409 DALI DURUYOR. Muafiyet, kilidi "nasılsa hep geçiyor" diye söküp
     * atmanın kılıfı olmasın: gerçek ağaçlarda çakışma hâlâ kullanıcıya
     * dönmeli.
     */
    const sonrasi = src.slice(i, i + 420);
    const dal = /409/.test(sonrasi) || /conflict\(\)/.test(sonrasi);
    check(dal, `${ad}: çakışmada 409 dalı duruyor`);
    if (/conflict\(\)/.test(sonrasi))
      check(/(const|function) conflict[\s\S]*?409/.test(src), `${ad}: conflict() 409 döndürüyor`);

    i = src.indexOf("versionMismatch(", i + 1);
  }
}
/*
 * Sayı da kilitli: çağrılar tek tek silinip kilit "kapsam dışı" bırakılırsa
 * yukarıdaki döngü hiç dönmez ve kapı sessizce yeşil kalırdı.
 */
check(cagri >= 19, `bütün çağrı yerleri tarandı (${cagri})`);

/* ══ 5. DEMO SIFIRLAMASI DEĞİŞMEDİ ══════════════════════════════════════ */
/*
 * Ürün sahibinin şartının öbür yarısı: demo her girişte sıfırlanmaya devam
 * etsin, silinen ağaç çık-gir sonrası geri gelsin. Muafiyet o davranışın
 * YERİNE değil, YANINA konuldu — biri sıfırlamayı kaldırırsa demo artık
 * "geri gelen" bir vitrin olmaz.
 */
{
  const hesap = kodu(read("../lib/demo-account.ts"));
  check(/export async function prepareDemoAccount/.test(hesap), "hazırlık işlevi duruyor");
  check(/saveFamilyData\(\s*DEMO_USER_ID,/.test(hesap), "her girişte ağaç yeniden yazılıyor");
  check(/DEMO_PEOPLE/.test(hesap), "sıfırlanan veri sabit demo listesi");
  check(/purgeTree\(DEMO_USER_ID, t\.treeId\)/.test(hesap), "fazla ağaçlar temizleniyor");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
