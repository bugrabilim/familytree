import { readFileSync } from "node:fs";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
/** Yorumları ayıkla: kuralı ANLATAN metin, kuralın kanıtı değildir. */
const kodu = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * KAPI: HTML yedeğinin UÇTAN UCA bağlı kalması.
 *
 * `tests/export-html.test.mts` üreticinin kendisini sınıyor; ama üretici
 * kusursuz olsa bile hiçbir rotadan çağrılmıyorsa kullanıcı için yedek YOKTUR.
 * Buradaki iddialar zinciri tutuyor: dışa aktarma ucu → indirme arayüzü →
 * içe aktarma ucu. Zincirin bir halkası düşerse "yedeğim var" sanıp yedeksiz
 * kalmak, hiç yedek almamış olmaktan kötüdür.
 */

/* ══ 1. DIŞA AKTARMA UCU html BİÇİMİNİ TANIYOR ══════════════════════════ */
{
  const src = kodu(read("../app/api/family/export/route.ts"));
  check(/q === "html"/.test(src), "dışa aktarma rotasında html dalı yok");
  check(/exportHtml\(/.test(src), "rota exportHtml çağırmıyor");

  // Dalın GÖVDESİ doğru başlıkları yazıyor mu — dosyanın herhangi bir yeri değil.
  const i = src.indexOf('q === "html"');
  const govde = src.slice(i, src.indexOf("// Excel", i) >= 0 ? src.indexOf("// Excel", i) : i + 900);
  check(/text\/html; charset=utf-8/.test(govde), "html dalında Content-Type yanlış");
  check(/attachment; filename="aile-agaci\.html"/.test(govde), "html dalında indirme adı yok");
  check(/lang/.test(govde), "html dalı dil parametresini okumuyor");
}

/* ══ 2. ARAYÜZ BİÇİMİ SUNUYOR VE VARSAYILAN O ═══════════════════════════ */
/*
 * Varsayılanın html olması bir tercih değil, bu işin ta kendisi: kullanıcı
 * "Dışa aktar"a bastığında eline programsız açılamayan bir dosya geçerse
 * yedek almış olmuyor. Varsayılan sessizce GEDCOM'a dönerse bu kapı yanar.
 */
{
  const src = kodu(read("../components/GedcomDialog.tsx"));
  check(/useState<ExportChoice>\("html"\)/.test(src), "dışa aktarma varsayılanı html değil");
  check(/\{ v: "html", l: t\("gedcom\.fmtHtml"\) \}/.test(src), "biçim listesinde html düğmesi yok");
  check(/format=html&lang=/.test(src), "html indirmesinde dil sunucuya taşınmıyor");
}

/* ══ 3. İÇE AKTARMA UCU AYNI DOSYAYI GERİ OKUYOR ════════════════════════ */
/*
 * Gidiş-dönüşün ikinci yarısı. `unwrapArchive` çağrısı `detectFormat`ten
 * ÖNCE gelmeli: sonra gelseydi HTML metni "CSV" sanılır ve ağaca saçma
 * kayıtlar eklenirdi.
 */
{
  const src = kodu(read("../app/api/family/import/route.ts"));
  check(/unwrapArchive\(/.test(src), "içe aktarma rotası unwrapArchive çağırmıyor");
  const a = src.indexOf("unwrapArchive(");
  const b = src.indexOf("detectFormat(");
  check(a > 0 && b > 0 && a < b, "unwrapArchive, detectFormat'ten sonra çağrılıyor");
  check(/acilan\.ok/.test(src) && /status: 400/.test(src.slice(a, b)), "arşiv olmayan HTML reddedilmiyor");
}

/* ══ 4. İSTEMCİ .html DOSYASINI YAPISAL UCA GÖNDERİYOR ══════════════════ */
/*
 * Bu satır düşerse dosya yapay zekâ çıkarımına gider: kullanıcı kendi tam
 * yedeğini geri yüklerken kayıtları "tahmin" ettirmiş olur.
 */
{
  const src = kodu(read("../lib/import-client.ts"));
  const m = src.match(/const STRUCTURED = \/([^/]+)\//);
  check(!!m, "STRUCTURED deseni bulunamadı");
  check(!!m && new RegExp(m[1], "i").test(".html"), "istemci .html'i yapısal saymıyor");
  check(!!m && new RegExp(m[1], "i").test(".htm"), "istemci .htm'i yapısal saymıyor");
}

/* ══ 5. GÖMÜLÜ VERİ BLOĞUNUN KİMLİĞİ SABİT ══════════════════════════════ */
/*
 * `VERI_ID` değişirse ESKİ yedekler okunamaz hâle gelir — kullanıcının bir
 * yıl önce indirdiği dosya sessizce işe yaramaz olur. Sabit tek yerde
 * tanımlı olmalı ve iki taraf da onu kullanmalı; elle yazılmış bir kopya
 * ayrışabilir.
 */
{
  const src = read("../lib/export-html.ts");
  check(/export const VERI_ID = "soyagaci-veri";/.test(src), "VERI_ID sabiti değişmiş");
  const kod = kodu(src);
  check(/id="\$\{VERI_ID\}"/.test(kod), "gömme tarafı sabiti kullanmıyor");
  check(/\$\{VERI_ID\}/.test(kod.slice(kod.indexOf("extractEmbedded"))), "çıkarma tarafı sabiti kullanmıyor");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
