import { consume, type BucketState } from "../lib/rate-limit-core.ts";

let ok = 0, fail = 0;
function eq<T>(got: T, want: T, msg: string) {
  if (JSON.stringify(got) === JSON.stringify(want)) ok++;
  else { fail++; console.log(`✗ ${msg}: bekl ${JSON.stringify(want)}, geldi ${JSON.stringify(got)}`); }
}
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

const T0 = 1_700_000_000_000;
const OPTS = { capacity: 3, refillPerSec: 0.5 }; // 2 saniyede bir jeton

/* --- İlk istek engellenmemeli ------------------------------------------- */
{
  const { result, state } = consume(null, OPTS, T0);
  check(result.ok, "yeni anahtarın ilk isteği geçer");
  eq(state.tokens, 2, "dolu kovadan bir jeton düştü");
  eq(result.retryAfter, 0, "geçen istekte bekleme yok");
}

/* --- Kapasite kadar art arda, sonra ret --------------------------------- */
{
  let s: BucketState | null = null;
  const sonuclar: boolean[] = [];
  for (let i = 0; i < 5; i++) {
    const r = consume(s, OPTS, T0);
    s = r.state;
    sonuclar.push(r.result.ok);
  }
  eq(sonuclar, [true, true, true, false, false], "kapasite kadar geçer, sonrası reddedilir");
}

/* --- Reddedilen istek JETON HARCAMAZ ------------------------------------ */
{
  /*
   * Aksi hâlde sürekli deneyen bir istemci kovayı hiç dolmaz hâlde tutar ve
   * `retryAfter` yalan söylerdi: "1 saniye sonra dene" der, 1 saniye sonra
   * yine reddederdi.
   */
  let s: BucketState = { tokens: 0, updated: T0 };
  const ilk = consume(s, OPTS, T0);
  s = ilk.state;
  const ikinci = consume(s, OPTS, T0);
  eq(s.tokens, 0, "reddedilen istek jetonu eksiye düşürmedi");
  eq(ikinci.result.retryAfter, ilk.result.retryAfter, "art arda ret aynı bekleme süresini veriyor");
}

/* --- Geri dolum ---------------------------------------------------------- */
{
  const bos: BucketState = { tokens: 0, updated: T0 };
  // 0.5 jeton/sn → 2 sn'de tam 1 jeton.
  check(!consume(bos, OPTS, T0 + 1000).result.ok, "1 saniye yetmiyor");
  check(consume(bos, OPTS, T0 + 2000).result.ok, "2 saniyede bir jeton doldu");
}
{
  // Kapasite AŞILAMAZ: uzun bir aradan sonra kova taşmaz.
  const bos: BucketState = { tokens: 0, updated: T0 };
  const { state } = consume(bos, OPTS, T0 + 3_600_000);
  eq(state.tokens, OPTS.capacity - 1, "uzun aradan sonra kova kapasiteyle sınırlı");
}

/* --- retryAfter dürüst mü? ----------------------------------------------- */
{
  const bos: BucketState = { tokens: 0, updated: T0 };
  const r = consume(bos, OPTS, T0);
  eq(r.result.retryAfter, 2, "boş kovada 2 saniye (0.5 jeton/sn)");
  // Söylediği süre kadar bekleyince GERÇEKTEN geçmeli — yoksa tavsiye yalan.
  check(consume(bos, OPTS, T0 + r.result.retryAfter * 1000).result.ok,
    "önerilen süre sonunda istek geçiyor");
}
{
  const yarim: BucketState = { tokens: 0.5, updated: T0 };
  eq(consume(yarim, OPTS, T0).result.retryAfter, 1, "yarım jetonda 1 saniye");
}

/* --- Saat kayması: jeton GERİ ALINMAMALI -------------------------------- */
{
  /*
   * Sunucular arası saat kayması gerçek: paylaşımlı depoda `updated` başka
   * bir örneğin saatiyle yazılmış olabilir. Negatif geçen süreyi olduğu gibi
   * kullansaydık jeton geri alınır ve sınır kendiliğinden sertleşirdi.
   */
  const s: BucketState = { tokens: 2, updated: T0 };
  const { state, result } = consume(s, OPTS, T0 - 60_000);
  check(result.ok, "geriye giden saatte istek yine de değerlendiriliyor");
  eq(state.tokens, 1, "geriye giden saat jeton silmiyor");
}

/* --- Uç değerler --------------------------------------------------------- */
{
  // Geri dolumu olmayan kova: tükenince makul bir süre söylemeli, NaN değil.
  const s: BucketState = { tokens: 0, updated: T0 };
  const r = consume(s, { capacity: 1, refillPerSec: 0 }, T0);
  check(!r.result.ok, "dolumsuz kova tükenince reddediyor");
  check(Number.isFinite(r.result.retryAfter) && r.result.retryAfter > 0,
    `dolumsuz kovada sonlu bekleme (${r.result.retryAfter})`);
}
{
  // Kapasite 0 ya da negatif verilirse en az 1 olmalı; aksi hâlde HİÇBİR
  // istek geçmez ve bir yapılandırma hatası tüm ucu kapatırdı.
  check(consume(null, { capacity: 0, refillPerSec: 1 }, T0).result.ok, "kapasite 0 → en az 1");
  check(consume(null, { capacity: -5, refillPerSec: 1 }, T0).result.ok, "negatif kapasite → en az 1");
}
{
  const r = consume(null, { capacity: 2, refillPerSec: -1 }, T0);
  check(r.result.ok, "negatif dolum ilk isteği engellemiyor");
  check(Number.isFinite(r.state.tokens), "negatif dolum NaN üretmiyor");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
