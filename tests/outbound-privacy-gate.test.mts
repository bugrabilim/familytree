import { readFileSync, readdirSync } from "node:fs";
import { forOutbound } from "../lib/privacy.ts";
import type { Person } from "../types/family.ts";

let ok = 0, fail = 0;
const check = (cond: boolean, msg: string) => { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } };
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const kodu = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * KAPI: DIŞARI ÇIKAN her kanal aynı gizlilik süzgecinden geçer.
 *
 * Kural `lib/memorial-notify.ts` başlığında yazılıydı ve iki adımdı:
 * `confidential` MUTLAK dışlanır, kalan herkes `privateFields`ten geçer.
 * Ama kural bir dosyanın İÇİNDE yaşıyordu, dolayısıyla "bütün giden
 * kanallar" diye okunamıyordu — ve LLM kanalında hiç uygulanmamıştı.
 *
 * `/api/ai/chat`, `/act`, `/voice` ham ağacı olduğu gibi Gemini'ye
 * gönderiyordu. Uçlar `canEdit` istediği için uygulama İÇİNDE yeni bir
 * kişiye veri açılmıyordu; sızıntı DIŞARIYAydı.
 *
 * Bunun bilinçli bir boşluk olmadığının kanıtı deponun kendisinde:
 * `/api/ai/suggest` gizli kişide zaten "AI kapalı" diyor — koruma yalnız
 * KONU kişiye konmuş, prompt'a giren listeye konmamıştı.
 */

const kisi = (over: Partial<Person> = {}): Person => ({
  id: "p1", firstName: "A", lastName: "B", gender: "male",
  parentIds: [], spouseIds: [], ...over,
});

/* --- 1. Süzgecin davranışı (çalıştırılarak) --------------------------- */

{
  const gizli = kisi({ id: "gizli", confidential: true, birthDate: "1950", bio: "sır" });
  const acik = kisi({ id: "acik", birthDate: "1960" });
  const out = forOutbound([gizli, acik]);
  check(out.length === 1 && out[0].id === "acik", "confidential kayıt MUTLAK dışlanıyor");
  check(!JSON.stringify(out).includes("sır"), "gizli kaydın hiçbir alanı sızmıyor");
}
{
  // Alan-bazlı gizlilik: kayıt kalıyor, alan gitmiyor.
  const p = kisi({ id: "x", healthCondition: "GIZLI-hastalik", privateFields: ["health"] });
  const out = forOutbound([p]);
  check(out.length === 1, "alan gizli olan kişi listede KALIYOR");
  check(!JSON.stringify(out).includes("GIZLI-hastalik"), "gizli ALAN çıkarılıyor");
}
{
  const p = kisi({ id: "x", birthDate: "1950" });
  const out = forOutbound([p]);
  check(out[0].birthDate === "1950", "gizli olmayan alanlar korunuyor");
  check(forOutbound([]).length === 0, "boş liste boş dönüyor");
}

/* --- 2. HER giden kanal süzgeci ÇAĞIRIYOR ----------------------------- */
/*
 * Dizin taranıyor, elle liste tutulmuyor: yarın eklenen bir AI ucu
 * kendiliğinden kapsanmalı. Kuralı kopyalamak bugün üç ayrı hatanın
 * kaynağıydı; kapı da kopya listeyle kurulmamalı.
 */
{
  const kok = new URL("../app/api/ai/", import.meta.url).pathname;
  const uclar = readdirSync(kok, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => [d.name, `${kok}${d.name}/route.ts`] as const);
  check(uclar.length >= 4, `AI uçları bulundu (${uclar.length})`);

  for (const [ad, yol] of uclar) {
    let src: string;
    try { src = kodu(readFileSync(yol, "utf8")); } catch { continue; }
    /*
     * ÖLÇÜT "veriyi okuyor mu" DEĞİL, "veri PROMPT'A gidiyor mu".
     *
     * İlk yazdığım hâli `getFamilyData(` arıyordu ve `ai/extract`i hatalı
     * yakaladı: o uç aile verisini yalnız YAZMAK için okuyor (birleştirme +
     * sürüm kilidi), prompt'u ise `buildExtractPrompt(lang)` — içinde kişi
     * yok. Süzgeç istemesi anlamsız olurdu.
     */
    const promptCagrilari = src.match(/build\w*Prompt\([^)]*\)/g) ?? [];
    const kisiTasiyor = promptCagrilari.some((c) => /\bpeople\b|\bham\b/.test(c));
    if (!kisiTasiyor) continue;
    check(src.includes("forOutbound("), `ai/${ad}: giden kanal süzgecinden geçiyor`);
    // Ham liste doğrudan prompt'a gitmemeli.
    check(!/buildActPrompt\(message, ham/.test(src) && !/data\.people, lang/.test(src),
      `ai/${ad}: ham listeyi prompt'a vermiyor`);
  }
}

/* --- 3. Posta kanalı da AYNI işlevi kullanıyor (kopya kural yok) ------ */
{
  const mn = kodu(read("../lib/memorial-notify.ts"));
  check(mn.includes("forOutbound("), "posta kanalı ortak süzgeci kullanıyor");
  check(!/people\.filter\(\(p\) => !p\.confidential\)/.test(mn),
    "posta kanalında kuralın KOPYASI kalmadı");
}

/* --- 4. `act`: geçerli kimlikler de süzülmüş listeden ----------------- */
/*
 * Ham listeden alınsaydı, AI'ın hiç görmediği bir gizli kişiye komut
 * üretmesi kabul edilebilirdi — göstermediğimiz bir kaydı, tahmin edilmiş
 * bir kimlik üzerinden düzenlenebilir yapmak.
 */
{
  const src = kodu(read("../app/api/ai/act/route.ts"));
  const suz = src.indexOf("forOutbound(");
  const ids = src.indexOf("validIds = new Set(");
  check(suz > -1 && ids > suz, "act: validIds süzgeçten SONRA kuruluyor");
  check(/validIds = new Set\(people\.map/.test(src), "act: validIds süzülmüş listeden");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail) process.exit(1);
