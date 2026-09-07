import { readFileSync, readdirSync } from "node:fs";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
/** Yorumları ayıkla: kuralı ANLATAN metin, kuralın kanıtı değildir. */
const kodu = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * KAPI: hata metni ve hata durumu (denetim G2/G3).
 *
 * ## Neden TARAMA, liste değil
 *
 * G2'nin bulgusu üç ekranda görüldü ama depoda aynı kalıptan onlarca çağrı
 * yeri vardı. Üçünü düzeltip listeye yazmak, dördüncüsünün yarın aynı
 * şekilde eklenmesini engellemezdi. Bu yüzden iddia bütün istemci
 * dosyalarını geziyor.
 */

/* ══ 1. HAM HATA METNİ EKRANA GİTMİYOR ══════════════════════════════════ */
/*
 * `catch (e) { setHata((e as Error).message) }` kalıbı, sunucu HTML
 * döndürdüğünde tarayıcının ayrıştırıcı hatasını kullanıcıya gösteriyordu:
 *
 *   Unexpected token '<', "<!DOCTYPE "... is not valid JSON
 *
 * Ne olduğunu söylemiyor, ne yapılacağını söylemiyor, ve uygulamanın bozuk
 * olduğu izlenimi bırakıyor — oysa anlamı genelde basit: 500 sayfası,
 * oturum düşünce gelen giriş yönlendirmesi, ya da ağın kopması.
 */
{
  const gez = (d: string, out: string[] = []): string[] => {
    for (const ad of readdirSync(new URL(d + "/", import.meta.url), { withFileTypes: true })) {
      if (ad.name === "node_modules" || ad.name.startsWith(".")) continue;
      if (ad.isDirectory()) gez(`${d}/${ad.name}`, out);
      else if (ad.name.endsWith(".tsx")) out.push(`${d}/${ad.name}`);
    }
    return out;
  };
  const dosyalar = [...gez("../components"), ...gez("../app")];
  check(dosyalar.length > 40, `istemci dosyaları tarandı (${dosyalar.length})`);

  const suclular: string[] = [];
  for (const f of dosyalar) {
    const src = kodu(read(f));
    /*
     * Aranan: bir setState'e DOĞRUDAN giden ham hata mesajı. `console.*`
     * çağrıları kapsam dışı — onlar geliştirici için ve ham metin orada
     * tam olarak istenen şey.
     */
    for (const m of src.matchAll(/set[A-Za-z0-9_]*\(\s*\(\s*(?:e|err|ex)\s+as\s+Error\s*\)\.message/g)) {
      void m;
      suclular.push(f);
    }
    /* Nesne içinde taşınan hâli de aynı yere varıyor: `{ error: (e as Error).message }`. */
    for (const m of src.matchAll(/error:\s*\(\s*(?:e|err|ex)\s+as\s+Error\s*\)\.message/g)) {
      void m;
      suclular.push(f);
    }
  }
  check(suclular.length === 0,
    `ham hata metni doğrudan ekrana yazılmıyor (${[...new Set(suclular)].join(", ")})`);
}

/* ══ 2. SÜZGEÇ ORTAK ve SAF ═════════════════════════════════════════════ */
/*
 * Kural tek yerde olmalı: her ekranın kendi "şu metni gizle" listesini
 * yazması, listelerin ayrışması ve birinde unutulan bir imzanın ham metni
 * yine geçirmesi demek olurdu.
 */
{
  const lib = kodu(read("../lib/error-text.ts"));
  check(/export function userMessage/.test(lib), "ortak süzgeç var");
  check(!/@\//.test(lib), "saf: çalışma anında `@/` içe aktarımı yok (birim testi koşulabiliyor)");
  /*
   * İKİ YÖNLÜ. Yalnız "ham metni gizle" olsaydı, her şeyi genel bir cümleyle
   * değiştiren bir uygulama da geçerdi ve "Bu ağaç siz bakarken değişti"
   * gibi EYLEME DÖNÜK mesajlar yok olurdu — kullanıcı için daha kötü.
   */
  check(/if \(isRawError\(m\)\) return fallback;/.test(lib), "yalnız TANINAN ham hata değişiyor");
  check(/return m;/.test(lib), "bizim yazdığımız mesaj olduğu gibi geçiyor");
  /*
   * Yerelden bağımsız küçültme: `toLowerCase()` Türkçe yerelde "I"yı "ı"
   * yapıyor ve "JSON" → "jsoı" olurdu; eşleşme kaçar, ham metin kullanıcıya
   * giderdi. Aynı tuzak `normalizeUsername` ve `normalizeContact`ta da var.
   */
  check(/toLocaleLowerCase\("en"\)/.test(lib), "küçültme yerelden bağımsız");
  check(!/\.toLowerCase\(\)/.test(lib), "çıplak toLowerCase YOK");
}

/* ══ 3. HATA VARKEN "boş" ya da "yükleniyor" GÖSTERİLMİYOR (G3) ════════ */
/*
 * Yükleme başarısız olduğunda `catch` listeyi boşaltıyordu ve ekran aynı
 * anda iki şey söylüyordu: "bir hata oldu" ve "henüz hiç kayıt yok".
 * İkincisi YANLIŞ — kayıtlar olabilir, okunamadı — ve ikisi yan yana
 * durduğunda kullanıcı hangisine inanacağını bilemiyor.
 */
for (const [f, bos] of [
  ["../components/GatheringsDialog.tsx", 'gathering.empty'],
  ["../components/ObituaryView.tsx", 'obit.empty'],
] as const) {
  const src = kodu(read(f));
  const i = src.indexOf(bos);
  check(i > -1, `${f}: boş durum bulundu`);
  /* Boş durumun ÜSTÜNDEKİ koşul zincirinde `error ?` olmalı. */
  const once = src.slice(Math.max(0, i - 500), i);
  check(/error \? null :/.test(once), `${f}: boş durum hata varken çizilmiyor`);
}
{
  /* Yükleniyor da aynı zincirde — hata varken "yükleniyor" demek de yanlış. */
  const g = kodu(read("../components/GatheringsDialog.tsx"));
  const iHata = g.indexOf("error ? null :");
  const iYukleniyor = g.indexOf("rsvp.loading");
  check(iHata > -1 && iYukleniyor > iHata, "yükleniyor da aynı koşulun altında");
  /*
   * Ve hata satırı İÇERİĞİN ÜSTÜNDE: en altta duruyordu ve uzun bir listede
   * ekranın dışında kalıyordu. Gösterilen ama görülmeyen bir hata,
   * gösterilmeyen bir hatadan farksız.
   */
  check(g.indexOf("{error &&") < g.indexOf("<ul"), "hata satırı listeden ÖNCE");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
