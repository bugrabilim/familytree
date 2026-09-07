import { readFileSync } from "node:fs";
import { tr, en } from "../lib/i18n-dict.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
/** Yorumları ayıkla: kuralı ANLATAN metin, kuralın ihlali değildir. */
const kodu = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * KAPI: AİLE MECLİSİ — "uygulama içinde para hareketi YOK" kuralı.
 *
 * ## Neden bir test
 *
 * Bu kural bir tercih değil, bir SINIR: uygulama içinde para toplamak,
 * aktarmak ya da saklamak Türkiye'de 6493 sayılı kanun kapsamında ödeme
 * hizmetidir ve ödeme kuruluşu lisansı ister. Kuralı yalnız yoruma yazmak,
 * onu bir sonraki "kullanıcı kolaylık olsun diye kartla ödesin" isteğine
 * karşı savunmasız bırakırdı — yorum okunmadan da kod yazılır.
 *
 * Bu yüzden sınır kaynak düzeyinde kilitli: meclis dosyalarında ödeme
 * sağlayıcısı adı, kart alanı, bakiye/cüzdan kavramı ve dış uç adresi
 * geçemez; para alanları kuruş tamsayısı olmak zorunda; tutanak kapandıktan
 * sonra değiştirilemez; defter herkese açık paylaşımda görünmez.
 */

const DOSYALAR = [
  "../types/council.ts",
  "../lib/council.ts",
  "../lib/council-store.ts",
  "../app/api/family/council/route.ts",
  "../components/CouncilDialog.tsx",
];

/* ══ 1. PARA HAREKETİ YOK ══════════════════════════════════════════════ */
/*
 * Yasaklı kavramlar üç kümede: ödeme sağlayıcıları, kart/ödeme araçları ve
 * bakiye/cüzdan. Üçü de "uygulama parayı tutuyor" demenin farklı yolları.
 */
/*
 * Kalıplar SÖZCÜK SINIRI ARAMIYOR — ve bu bilinçli. İlk yazımda `\biyzico\b`
 * vardı; mutasyon denemesinde `iyzicoCheckout()` diye bir işlev ekledim ve
 * kapı onu GÖRMEDİ: "iyzico" ile "Checkout" arasında sözcük sınırı yok.
 * Bir sağlayıcı adı kaynağa hangi yazımla girerse girsin (camelCase, alan
 * adı, dize) yasak olmalı; yanlış pozitif riski, kaçırma riskinin yanında
 * önemsiz.
 */
const YASAK: Array<[RegExp, string]> = [
  [/iyzico|iyzipay/i, "iyzico"],
  [/paytr/i, "paytr"],
  [/stripe/i, "stripe"],
  [/paypal/i, "paypal"],
  [/papara/i, "papara"],
  [/adyen/i, "adyen"],
  [/braintree/i, "braintree"],
  [/klarna/i, "klarna"],
  [/mastercard/i, "mastercard"],
  [/card(?:Number|Holder|Token|Cvv)/i, "kart alanı"],
  [/\bcvv\b|\bcvc\b/i, "cvv/cvc"],
  [/bakiye/i, "bakiye"],
  [/balance/i, "balance"],
  [/wallet/i, "wallet"],
  [/c[uü]zdan/i, "cüzdan"],
  [/checkout/i, "checkout"],
  [/payout/i, "payout"],
  [/refund/i, "refund"],
  [/charge\(/i, "charge()"],
  /*
   * IBAN ALANI: `stripIban` meşru (metinden DÜŞÜREN taraf), ama bir
   * ÖZELLİK olarak IBAN hiçbir yerde tanımlanamaz. Kalıp bu yüzden
   * "iban" değil, "iban:" / "iban?:" biçimindeki alan tanımı.
   */
  [/\biban\s*\??\s*:/i, "IBAN alanı"],
];

for (const f of DOSYALAR) {
  const src = kodu(read(f));
  const bulunan = YASAK.filter(([re]) => re.test(src)).map(([, ad]) => ad);
  check(bulunan.length === 0, `${f.replace("../", "")}: para hareketi kavramı yok (bulunan: ${bulunan.join(", ")})`);
  /*
   * DIŞ UÇ ADRESİ YOK. Bir ödeme sağlayıcısına bağlanmanın ilk satırı her
   * zaman bir URL'dir; meclis dosyalarında hiç http(s) adresi bulunmaması,
   * "hiçbir dış hizmete para için bağlanmıyoruz" iddiasının en kaba ama en
   * kırılmaz hâli. (Depo yalnız kendi blob'unu okuyor, adresi değişkenden.)
   */
  check(!/https?:\/\//.test(src), `${f.replace("../", "")}: dış uç adresi yok`);
}

/* ══ 2. PARA = KURUŞ CİNSİNDEN TAMSAYI ═════════════════════════════════ */
{
  const t = kodu(read("../types/council.ts"));

  /* Her para alanı `Kurus` tipinde ve adı `Kurus` ile bitiyor. */
  const kurusAlanlari = [...t.matchAll(/^\s*(\w+)(\??):\s*Kurus;/gm)].map((m) => m[1]);
  check(kurusAlanlari.length >= 4, `para alanı bulundu (${kurusAlanlari.length})`);
  check(kurusAlanlari.every((a) => a.endsWith("Kurus")),
    `her para alanının adı Kurus ile bitiyor (${kurusAlanlari.join(", ")})`);

  /*
   * Ters yön: para ÇAĞRIŞTIRAN bir alan adı `Kurus` olmadan tanımlanamaz.
   * `amount: number` diye bir alan eklemek, lira mı kuruş mu belirsiz bir
   * değer doğurur ve toplamlar sessizce 100 kat şaşar.
   */
  const supheli = [...t.matchAll(/^\s*(\w*(?:amount|target|pledged|paid|total|tutar|price)\w*)(\??):\s*([\w<>[\]| ]+);/gim)]
    /*
     * Yalnız SAYI tipindekiler: `paidAt: string` bir tarih, para değil —
     * ilk yazışta onu da yakalıyordu ve iddia, kuralı zaten uygulayan
     * koda sahte kırmızı veriyordu.
     */
    .filter((m) => !m[1].endsWith("Kurus") && /^(?:number|Kurus)$/.test(m[3].trim()))
    .map((m) => `${m[1]}: ${m[3]}`);
  check(supheli.length === 0, `para çağrıştıran her alan Kurus ile bitiyor (aykırı: ${supheli.join(", ")})`);

  /* Para birimi de saklanıyor: kuruş tek başına "ne kadar" demek değil. */
  check(/currency:\s*Currency;/.test(t), "tutarın yanında para birimi saklanıyor");
}
{
  const lib = kodu(read("../lib/council.ts"));
  /*
   * Kayan noktalı para hesabı yok. `parseFloat`/`toFixed` bu dosyada
   * göründüğü an, `0.1 + 0.2 !== 0.3` defterin içine girmiş demektir.
   */
  check(!/parseFloat\(/.test(lib), "parseFloat yok");
  check(!/toFixed\(/.test(lib), "toFixed yok");
  /* Ayrıştırma tamsayı üstünde: kesir ayrı okunup 100'le toplanıyor. */
  check(/lira \* 100 \+ kurus/.test(lib), "tutar tamsayı aritmetiğiyle kuruşa çevriliyor");
  check(/export function stripIban/.test(lib), "serbest metinden IBAN düşüren işlev var");
}

/* ══ 3. TUTANAK KAPANDIKTAN SONRA DEĞİŞTİRİLEMEZ ═══════════════════════ */
/*
 * Bir meclis kararının değeri değiştirilemezliğinde. Kural üç yolun
 * hepsinde kapalı olmalı: metin güncelleme, oy verme ve SİLME. Üçünden biri
 * açık kalsaydı kural hiç yok sayılırdı — silebilen biri kararı yok edip
 * yenisini yazar.
 */
{
  const lib = kodu(read("../lib/council.ts"));
  const iNorm = lib.indexOf("export function normalizeDecision");
  const norm = lib.slice(iNorm, lib.indexOf("\n}", iNorm));
  check(/if \(existing && isFrozen\(existing\)\) return null;/.test(norm),
    "donmuş tutanağın METNİ değiştirilemiyor");

  const iBallot = lib.indexOf("export function normalizeBallot");
  const ballot = lib.slice(iBallot, lib.indexOf("\n}", iBallot));
  check(/if \(isFrozen\(decision\)\) return \{ error: "kapali" \};/.test(ballot),
    "donmuş tutanağa OY verilemiyor");

  const iClose = lib.indexOf("export function closeDecision");
  const close = lib.slice(iClose, lib.indexOf("\n}", iClose));
  check(/if \(isFrozen\(d\)\) return null;/.test(close), "kapalı karar ikinci kez kapatılamıyor");
  /* Sonuç kapanışta DONDURULUYOR: kural değişirse geçmiş tutanak değişmesin. */
  check(/outcome: decisionOutcome\(decisionTally\(d\.ballots\)\)/.test(close),
    "sonuç kapanış anında hesaplanıp saklanıyor");
}
{
  const store = kodu(read("../lib/council-store.ts"));
  const iDel = store.indexOf("export async function deleteDecision");
  const del = store.slice(iDel, store.indexOf("\n}", store.indexOf("return { yaz: true", iDel)));
  check(/if \(isFrozen\(d\)\) return \{ yaz: false, sonuc: false \};/.test(del),
    "donmuş tutanak SİLİNEMİYOR");
  /* Ve depo kayıp yazma korumasını kullanıyor (oylama en olası çakışma). */
  check(/mutateStore\(/.test(store), "depo ortak kayıp-yazma korumasını kullanıyor");
}

/* ══ 4. YETKİ — mevcut kademeler, YENİ KADEME YOK ══════════════════════ */
{
  const route = kodu(read("../app/api/family/council/route.ts"));
  check(/resolveActiveTree\(\)/.test(route), "rota oturumu resolveActiveTree ile çözüyor");
  check(/canEdit\(ctx\.role\)/.test(route), "defter yazma canEdit'e bağlı");
  check(/canPropose\(ctx\.role\)/.test(route), "oy verme canPropose'a bağlı");
  /*
   * Yeni bir rol kademesi EKLENMEDİ: rota `lib/roles.ts` dışında bir rol
   * dizgesiyle karar vermiyor. ("yonetici"/"uye" karşılaştırması buraya
   * sızarsa, yetki kuralı iki yere bölünür ve biri güncellenmeden kalır.)
   */
  check(!/role\s*===\s*"(yonetici|uye|goruntuleyen)"/.test(route), "rotada elle rol karşılaştırması yok");

  /* Her yazma yolu kapıdan geçiyor. */
  for (const m of ["POST", "PUT", "DELETE"]) {
    const i = route.indexOf(`export async function ${m}(`);
    check(i > -1, `${m} tanımlı`);
    const govde = route.slice(i, route.indexOf("\nexport async function", i + 1) === -1 ? undefined : route.indexOf("\nexport async function", i + 1));
    check(/await guard\(/.test(govde), `${m} yetki kapısından geçiyor`);
    /* İyimser kilit: DEFTERİN kendi damgasına karşı. */
    check(/await conflict\(req, /.test(govde), `${m} iyimser kilit denetimi yapıyor`);
  }
  check(/versionMismatch\(req, kutu\.updatedAt, ctx\.treeId\)/.test(route),
    "kilit defterin KENDİ damgasını karşılaştırıyor (ağacınkini değil)");
}

/* ══ 5. HERKESE AÇIK PAYLAŞIMDA GÖRÜNMEZ ═══════════════════════════════ */
/*
 * Para rakamları ve "kim kime borçlu" bilgisi hassas. Üç kapı birden:
 * paylaşım sayfaları defteri hiç okumuyor, paylaşım kapsamı listesinde
 * "meclis" diye bir seçenek yok ve arayüz `publicView` içinde pencereyi
 * hiç çizmiyor.
 */
for (const f of ["../app/g/[token]/page.tsx", "../app/embed/[token]/page.tsx", "../components/EmbedTree.tsx"]) {
  const src = read(f);
  check(!/council/i.test(src), `${f.replace("../", "")}: meclis verisi okunmuyor`);
}
{
  const scope = kodu(read("../lib/share-scope.ts"));
  check(!/meclis|council/i.test(scope), "paylaşım kapsamında meclis seçeneği yok");
  const pr = kodu(read("../lib/public-routes.ts"));
  check(!/council/i.test(pr), "meclis ucu oturumsuz uçlar listesinde değil");
}
{
  const ws = kodu(read("../app/tree/Workspace.tsx"));
  check(/onOpenCouncil=\{!publicView \?/.test(ws), "menü girişi publicView'da verilmiyor");
  check(/\{councilOpen && !publicView && \(/.test(ws), "pencere publicView'da hiç çizilmiyor");
  /* Adlar gizlilik katmanından geçiyor. */
  const i = ws.indexOf("<CouncilDialog");
  const blok = ws.slice(i, ws.indexOf("/>", i));
  check(/people\.map\(maskView\)/.test(blok), "kişi adları view()'dan geçiyor");
}

/* ══ 6. Arayüz "para taşımıyoruz" diyor — TR ve EN ═════════════════════ */
/*
 * Bu cümle ekrandaki en önemli satır: kullanıcı buraya "ödeme yapacağım"
 * beklentisiyle gelirse, hiçbir uyarı sonradan o beklentiyi düzeltemez.
 */
for (const k of ["council.noMoney", "council.title", "council.decision.hint", "menu.council"]) {
  check(!!tr[k]?.trim() && !!en[k]?.trim(), `${k}: TR+EN dolu`);
}
check(/para/i.test(tr["council.noMoney"] ?? "") && /toplamaz/i.test(tr["council.noMoney"] ?? ""),
  "TR uyarısı para toplamadığımızı açıkça söylüyor");
check(/money/i.test(en["council.noMoney"] ?? ""), "EN uyarısı para konusunu açıkça söylüyor");
{
  const dlg = kodu(read("../components/CouncilDialog.tsx"));
  check(/t\("council\.noMoney"\)/.test(dlg), "uyarı arayüzde çiziliyor");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
