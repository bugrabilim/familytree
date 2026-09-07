import {
  SERIES_VOICE,
  SERIES_WEEKS,
  normalizeSeries,
  planWeekly,
  weekIndex,
  type StorySeries,
} from "../lib/story-series.ts";
import { PROMPTS, eligiblePrompts, type PromptSubject } from "../lib/prompts.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

/**
 * HAFTALIK SORU SERİSİ — saf karar katmanı (madde 39).
 *
 * Burada sınanan tek şey KADANS: haftası geldi mi, hangi soru, banka bitti
 * mi, seri hâlâ yaşıyor mu. Gönderim, izin ve depo bunun dışında — o
 * kapılar `tests/cron-gate.test.mts` ve `tests/story-gate.test.mts`te.
 */

const SIMDI = new Date("2026-09-06T09:00:00Z"); // pazar
const HAFTA = weekIndex(SIMDI);

const KONU: PromptSubject = {
  id: "p1",
  hasSpouse: false,
  hasChildren: false,
  hasOccupation: false,
  hasEducation: false,
  hasBirthPlace: false,
  living: true,
  answered: [],
};

const seri = (over: Partial<StorySeries> = {}): StorySeries => ({
  id: "s1",
  personId: "p1",
  createdAt: "2026-01-01T00:00:00Z",
  expiresAt: "2027-01-01T00:00:00Z",
  asked: [],
  ...over,
});

/* ── Sınırlar ─────────────────────────────────────────────────────────────── */
{
  check(SERIES_VOICE === "self", "seri ikinci tekil sesle soruyor");
  /*
   * Bu sayı ELLE yazılmadı, bankadan türetiliyor. Sabit bir 52 yazılsaydı
   * banka değiştiğinde ilerleme göstergesi sessizce yalan söylerdi.
   */
  check(
    SERIES_WEEKS === PROMPTS.filter((p) => p.voice === "self").length,
    `hafta sayısı bankadan türetiliyor (${SERIES_WEEKS})`
  );
  check(SERIES_WEEKS > 0, "banka boş değil");
}

/* ── Hafta numarası ───────────────────────────────────────────────────────── */
{
  /*
   * Cron PAZAR günü gönderiyor; ardışık iki pazarın hafta numarası AYNI
   * olsaydı ikinci pazar "bu hafta gönderildi" diye atlanır ve seri iki
   * haftada bir ilerlerdi.
   */
  const pazarlar = [
    "2026-09-06T09:00:00Z",
    "2026-09-13T09:00:00Z",
    "2026-09-20T09:00:00Z",
    "2026-09-27T09:00:00Z",
  ].map((s) => weekIndex(new Date(s)));
  check(new Set(pazarlar).size === 4, "ardışık pazarlar farklı haftalara düşüyor");
  check(
    pazarlar.every((h, i) => i === 0 || h === pazarlar[i - 1] + 1),
    "hafta numarası birer birer artıyor"
  );
  /* Aynı haftanın iki farklı günü AYNI numarayı taşımalı — tekrar denemesi
   * aynı soruyu üretsin diye. */
  check(
    weekIndex(new Date("2026-09-06T09:00:00Z")) === weekIndex(new Date("2026-09-07T23:00:00Z")),
    "aynı haftanın günleri aynı numarada"
  );
}

/* ── Serinin kendi durumu kapıların ÖNÜNDE ───────────────────────────────── */
{
  const kapali = planWeekly(seri({ closed: true }), KONU, SIMDI);
  check(kapali.kind === "atla" && kapali.reason === "kapali", "kapalı seri atlanıyor");

  const gecmis = planWeekly(seri({ expiresAt: "2026-01-01T00:00:00Z" }), KONU, SIMDI);
  check(gecmis.kind === "bitti" && gecmis.reason === "sure-doldu", "süresi dolan seri bitti");

  /*
   * BOZUK DAMGA da "bitti" sayılıyor. `NaN >= x` her zaman false döndüğü
   * için çıplak bir karşılaştırma bozuk damgayı SÜRESİZ bir seriye
   * çevirirdi — süresiz bir seri her hafta yeni bir girişsiz yazma
   * bağlantısı üreten sonsuz bir boru demek.
   */
  const bozuk = planWeekly(seri({ expiresAt: "evet" }), KONU, SIMDI);
  check(bozuk.kind === "bitti" && bozuk.reason === "sure-doldu", "bozuk damga açık kapı bırakmıyor");
}

/* ── Haftada BİR ─────────────────────────────────────────────────────────── */
{
  const ilk = planWeekly(seri(), KONU, SIMDI);
  check(ilk.kind === "gonder", "ilk hafta gönderiliyor");
  check(ilk.kind === "gonder" && ilk.week === HAFTA, "işaretlenecek hafta plan ile geliyor");

  const ayniHafta = planWeekly(seri({ lastWeek: HAFTA }), KONU, SIMDI);
  check(
    ayniHafta.kind === "atla" && ayniHafta.reason === "bu-hafta-gonderildi",
    "aynı hafta ikinci soru gitmiyor"
  );

  const sonraki = planWeekly(seri({ lastWeek: HAFTA - 1 }), KONU, SIMDI);
  check(sonraki.kind === "gonder", "sonraki hafta yeniden gönderiliyor");

  /*
   * `<=` (yalnız `===` değil): saat geriye kayarsa geçmiş bir hafta yeniden
   * açılmamalı, yoksa aynı kişiye aynı hafta ikinci bir yazma bağlantısı
   * gider.
   */
  const ileri = planWeekly(seri({ lastWeek: HAFTA + 3 }), KONU, SIMDI);
  check(ileri.kind === "atla", "geriye kayan saat yeni gönderim açmıyor");
}

/* ── DETERMİNİZM — tekrar denemesi aynı soruyu üretmeli ──────────────────── */
{
  const a = planWeekly(seri(), KONU, SIMDI);
  const b = planWeekly(seri(), KONU, new Date("2026-09-08T04:00:00Z")); // aynı hafta, başka gün
  check(
    a.kind === "gonder" && b.kind === "gonder" && a.promptId === b.promptId,
    "aynı hafta içindeki tekrar AYNI soruyu üretiyor"
  );
  /*
   * Gerekçe `lib/prompts.ts`te yazılıydı: "haftalık cron her çalıştığında
   * aynı hafta için aynı soruyu üretmeli". Rastgele seçim, düşen bir
   * gönderimin ertesi günkü tekrarında İKİNCİ bir soru ve ikinci bir açık
   * yazma bağlantısı demek olurdu.
   */
  const farkliSeri = planWeekly(seri({ id: "s2" }), KONU, SIMDI);
  check(farkliSeri.kind === "gonder", "başka seri de soru buluyor");
}

/* ── Sorulan soru BİR DAHA sorulmuyor ────────────────────────────────────── */
{
  const ilk = planWeekly(seri(), KONU, SIMDI);
  if (ilk.kind !== "gonder") throw new Error("kurulum bozuk");
  const ikinci = planWeekly(
    seri({ asked: [ilk.promptId], lastWeek: HAFTA - 1 }),
    KONU,
    SIMDI
  );
  check(
    ikinci.kind === "gonder" && ikinci.promptId !== ilk.promptId,
    "serinin kendi defteri tekrarı engelliyor"
  );
  /*
   * Defter neden kişinin anılarında DEĞİL: `lib/contribution.ts` `toMemory`
   * anıya sorunun METNİNİ yazıyor, kimliğini değil. Kimlikle dolu bir
   * `answered` listesi buradan gelmiyor; gelmeseydi seri sorduğu soruları
   * baştan sorardı.
   */
  const anilarKimlikTasimiyor = planWeekly(
    seri({ lastWeek: HAFTA - 1 }),
    { ...KONU, answered: ["Çocukluğun nasıldı?"] },
    SIMDI
  );
  check(anilarKimlikTasimiyor.kind === "gonder", "anıdaki cümle soru kimliğiyle karışmıyor");
}

/* ── BANKA BİTTİĞİNDE ────────────────────────────────────────────────────── */
{
  const hepsi = eligiblePrompts(KONU, { voice: "self" }, SIMDI).map((p) => p.id);
  check(hepsi.length > 0, "kurulumda uygun soru var");
  const bitmis = planWeekly(seri({ asked: hepsi, lastWeek: HAFTA - 1 }), KONU, SIMDI);
  check(
    bitmis.kind === "bitti" && bitmis.reason === "banka-bitti",
    "uygun soru kalmayınca seri bitti"
  );

  /* Tavan da bitiriyor — banka büyüse bile bir seri `SERIES_WEEKS`i aşmıyor. */
  const tavan = planWeekly(
    seri({ asked: Array.from({ length: SERIES_WEEKS }, (_, i) => `x${i}`), lastWeek: HAFTA - 1 }),
    KONU,
    SIMDI
  );
  check(tavan.kind === "bitti" && tavan.reason === "banka-bitti", "hafta tavanı seriyi bitiriyor");
}

/* ── VEFAT ETMİŞ kişiye kendisi hakkında soru sorulmuyor ─────────────────── */
{
  /*
   * `isEligible` bunu zaten yasaklıyor; burada kilitlenen şey serinin o
   * kuralı DELMEMESİ. Serinin postası konunun KENDİ adresine gidiyor —
   * vefat etmiş biri için o adres zaten olmamalı, ama iki koruma bir
   * korumadan iyi.
   */
  const p = planWeekly(seri(), { ...KONU, living: false, deathDate: "2010" }, SIMDI);
  check(p.kind === "bitti", "vefat etmiş konu için seri soru üretmiyor");
}

/* ── Normalleştirme ALAN DÜŞÜRMÜYOR ──────────────────────────────────────── */
{
  const tam = normalizeSeries({
    id: "s1",
    personId: "p1",
    createdAt: "2026-01-01T00:00:00Z",
    expiresAt: "2027-01-01T00:00:00Z",
    asked: ["childhood", 7, "advice"],
    lastWeek: 2950,
    currentRequestId: "r9",
    closed: true,
  });
  check(!!tam && tam.asked.length === 2, "sayısal çöp `asked`ten eleniyor");
  check(!!tam && tam.lastWeek === 2950, "hafta damgası korunuyor");
  check(!!tam && tam.currentRequestId === "r9", "açık talep bağı korunuyor");
  check(!!tam && tam.closed === true, "kapatma damgası korunuyor");

  /*
   * Kimliksiz / damgasız kayıt DÜŞÜYOR. Sessizce "boş seri" sayılsaydı
   * `asked` listesi kaybolur ve seri sorduğu soruları baştan sorardı.
   */
  check(normalizeSeries(null) === null, "boş kayıt eleniyor");
  check(normalizeSeries({ personId: "p1" }) === null, "kimliksiz kayıt eleniyor");
  check(
    normalizeSeries({ id: "s", personId: "p", createdAt: "x" }) === null,
    "son kullanma damgası olmayan kayıt eleniyor"
  );
  const eksik = normalizeSeries({
    id: "s",
    personId: "p",
    createdAt: "2026-01-01T00:00:00Z",
    expiresAt: "2027-01-01T00:00:00Z",
  });
  check(!!eksik && eksik.asked.length === 0 && eksik.lastWeek === undefined,
    "eksik alanlar güvenli varsayılana düşüyor");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
