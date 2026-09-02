import { readFileSync } from "node:fs";
import { publicView, publicViewAll, isUnlocked } from "../lib/letters.ts";
import type { Letter } from "../types/letter.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) {
  if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); }
}

/**
 * KAPI TESTİ.
 *
 * `lib/letters.ts` kilidi doğru hesaplıyor mu — bunu `tests/letters.test.mts`
 * ölçüyor. Buradaki soru başka: kapı DOĞRU YERDE Mİ?
 *
 * Zaman kilitli bir mektupta asıl tehlike hesabın yanlış olması değil, doğru
 * hesabın yanlış yerde uygulanmasıdır: metni istemciye gönderip "gösterme"
 * demek kilit değildir — metin ağ sekmesinde, tarayıcı önbelleğinde ve sayfa
 * kaynağında durur. Bu yüzden burada KAYNAK KODU denetleniyor.
 *
 * `lib/letter-store.ts` `server-only` olduğu için doğrudan çağrılamaz; kaynak
 * denetimi, o dosyanın sözünü tutup tutmadığını gösterebilecek tek yol.
 */

const store = readFileSync(new URL("../lib/letter-store.ts", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/family/letters/route.ts", import.meta.url), "utf8");

/* --- Ham kutu dışa açılmıyor -------------------------------------------- */
// `getLetterBox` dışa aktarılsaydı, bir rotanın yanlışlıkla ham veriyi
// döndürmesi bir satırlık hata olurdu.
check(/^\s*async function getLetterBox\(/m.test(store), "getLetterBox tanımlı");
check(!/export\s+(async\s+)?function\s+getLetterBox/.test(store), "getLetterBox DIŞA AKTARILMIYOR");

/* --- Okuma yolu kapıdan geçiyor ----------------------------------------- */
check(/export async function readLetters/.test(store), "readLetters dışa açık okuma yolu");
{
  // readLetters gövdesi publicViewAll ile bitmeli.
  const i = store.indexOf("export async function readLetters");
  const govde = store.slice(i, store.indexOf("\n}", i));
  check(govde.includes("publicViewAll"), "readLetters `publicViewAll`dan geçiyor");
}

/* --- Rota ham mektup döndürmüyor ---------------------------------------- */
{
  /*
   * Denetim ALAN BAZINDA, satır bazında değil.
   *
   * İlk yazışta satırın tamamında "readLetters|publicView" arıyordum. O
   * denetim şunu GEÇİRİYORDU:
   *
   *   NextResponse.json({ letters: await readLetters(...), letter })
   *
   * Satırda `readLetters` geçtiği için temiz sayılıyordu, oysa ikinci alan
   * ham mektubu — kilitli metniyle birlikte — yanıta koyuyordu. Tam da
   * korunmak istenen sızıntı. Artık her alanın KENDİ değeri denetleniyor ve
   * kısayol yazım (`{ letter }`) doğrudan reddediliyor: kısayolun değeri
   * tanım gereği ham değişkendir.
   */
  const yanitlar = [...route.matchAll(/NextResponse\.json\(\{([^}]*)\}/g)].map((m) => m[1]);
  const mektupluYanitlar = yanitlar.filter((g) => /\bletters?\b/.test(g));
  check(mektupluYanitlar.length >= 4, `mektup döndüren yanıtlar bulundu (${mektupluYanitlar.length})`);

  for (const govde of mektupluYanitlar) {
    // Virgülle ayrılmış alanlar; iç içe parantezleri kabaca atlamak için
    // parantez derinliği sayılır.
    const alanlar: string[] = [];
    let derinlik = 0, son = 0;
    for (let i = 0; i < govde.length; i++) {
      const c = govde[i];
      if (c === "(" || c === "[") derinlik++;
      else if (c === ")" || c === "]") derinlik--;
      else if (c === "," && derinlik === 0) { alanlar.push(govde.slice(son, i)); son = i + 1; }
    }
    alanlar.push(govde.slice(son));

    for (const alan of alanlar.map((a) => a.trim()).filter(Boolean)) {
      const iki = alan.split(":");
      const ad = iki[0].trim();
      if (!/^letters?$/.test(ad)) continue;
      if (iki.length === 1) {
        // Kısayol: `{ letter }` — değeri ham değişken, kapıdan geçmemiş.
        check(false, `kısayol alan kapıdan GEÇMİYOR: "${alan}"`);
        continue;
      }
      const deger = iki.slice(1).join(":").trim();
      check(/readLetters|publicView/.test(deger), `alan kapıdan geçiyor: ${ad}: ${deger.slice(0, 60)}`);
    }
  }

  // Ham depo çağrılarının doğrudan yanıta konmadığını da doğrula.
  check(
    !/NextResponse\.json\(\{[^}]*letters:\s*(box|raw|await getLetterBox)/.test(route),
    "yanıtta ham kutu yok"
  );
}

/* --- Davranış: kapı gerçekten metni siliyor ----------------------------- */
{
  const now = new Date("2026-09-02T12:00:00Z");
  const kilitli: Letter = {
    id: "l", title: "Torunuma", opensOn: "2044-06-01",
    body: "COK-GIZLI-METIN", createdAt: "", updatedAt: "",
  };
  const gorunum = publicView(kilitli, now);
  check(!("body" in gorunum), "kilitlide `body` alanı yok");
  check(!JSON.stringify(gorunum).includes("COK-GIZLI-METIN"), "metin serileştirmede geçmiyor");

  // Liste yolu da aynı.
  const liste = publicViewAll([kilitli], now);
  check(!JSON.stringify(liste).includes("COK-GIZLI-METIN"), "liste serileştirmesinde de geçmiyor");

  // Ve kapı, tam açılma gününde açılıyor.
  check(isUnlocked({ opensOn: "2026-09-02" }, now), "açılma günü açık");
  check(!isUnlocked({ opensOn: "2026-09-03" }, now), "ertesi gün hâlâ kilitli");
}

/* --- Kapı, kaynağın kendisinde tek yerde ------------------------------- */
{
  // `isUnlocked` kararını `publicView` dışında bir yerde tekrar uygulamak,
  // ileride iki kuralın ayrışmasına yol açar. `lib/letters.ts`te kilidi
  // uygulayan tek yer `publicView` olmalı.
  const lib = readFileSync(new URL("../lib/letters.ts", import.meta.url), "utf8");
  const gecen = lib.split("\n").filter((l) => /isUnlocked\(/.test(l) && !/export function isUnlocked/.test(l));
  // publicView, daysUntilOpen ve sortLetters kullanır — üçü de meşru.
  check(gecen.length <= 4, `isUnlocked kullanımı sınırlı (${gecen.length} satır)`);
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
