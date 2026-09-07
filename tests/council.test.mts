import type { Ballot, Campaign, Debt, Decision, Pledge } from "../types/council.ts";
import {
  MAX_KURUS,
  campaignTally,
  cleanDay,
  cleanText,
  closeDecision,
  decisionOutcome,
  decisionTally,
  formatMoney,
  isFrozen,
  isVote,
  normalizeBallot,
  normalizeCampaign,
  normalizeDebt,
  normalizeDecision,
  normalizePledge,
  openDebtTotals,
  parseMoney,
  stripIban,
} from "../lib/council.ts";

let ok = 0, fail = 0;
function eq<T>(got: T, want: T, msg: string) {
  if (JSON.stringify(got) === JSON.stringify(want)) ok++;
  else { fail++; console.log(`✗ ${msg}: bekl ${JSON.stringify(want)}, geldi ${JSON.stringify(got)}`); }
}
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

const NOW = "2026-01-01T00:00:00.000Z";

/* ══ PARA: kuruş tamsayısı — kayan nokta YOK ═══════════════════════════ */
/*
 * Bu bloğun tek derdi şu: `Number("1.15") * 100 === 114.99999999999999`.
 * Bir aidat defterinde bu, her satırda bir kuruş kaybı ve toplamda
 * "kim ne kadar kaldı" sorusunun yanlış yanıtı demek.
 */
eq(parseMoney("1,15"), 115, "TR ondalık virgülü");
eq(parseMoney("1.15"), 115, "EN ondalık noktası");
eq(parseMoney("0,10"), 10, "on kuruş");
eq(parseMoney("0,1"), 10, "tek haneli kesir onluk kuruş");
eq(parseMoney("1.250"), 125000, "üç haneli kuyruk BİNLİK ayraç");
eq(parseMoney("1.250,50"), 125050, "TR tam yazım");
eq(parseMoney("1,250.50"), 125050, "EN tam yazım");
eq(parseMoney("12.345.678"), 1234567800, "çoklu binlik ayraç");
eq(parseMoney("2500"), 250000, "ayraçsız tam sayı");
eq(parseMoney(" 2.500 ₺ "), 250000, "simge ve boşluk atılıyor");
eq(parseMoney(""), null, "boş girdi");
eq(parseMoney("abc"), null, "harf reddedilir");
eq(parseMoney("-5"), null, "eksi tutar reddedilir");
eq(parseMoney(null), null, "null reddedilir");
eq(parseMoney(1.5), null, "ondalıklı SAYI reddedilir (kuruş tamsayıdır)");
eq(parseMoney(500), 500, "sayı girdi KURUŞ sayılır");
eq(parseMoney(MAX_KURUS + 1), null, "tavan üstü sayı reddedilir");
eq(parseMoney("999999999999"), null, "tavan üstü dizge reddedilir");

/* Toplama tamsayı üstünde: kuruş kayması olmamalı. */
{
  let toplam = 0;
  for (let i = 0; i < 10; i++) toplam += parseMoney("0,10")!;
  eq(toplam, 100, "on kez 0,10 tam olarak 1,00");
}

eq(formatMoney(125050, "TRY"), "1.250,50 ₺", "TR biçim");
eq(formatMoney(125050, "USD", "en"), "1,250.50 $", "EN biçim");
eq(formatMoney(5, "TRY"), "0,05 ₺", "beş kuruş sıfır dolduruyor");
eq(formatMoney(0, "EUR"), "0,00 €", "sıfır");

/* ══ IBAN: hiç saklanmıyor, metinden de DÜŞÜYOR ════════════════════════ */
/*
 * Ürün kararı "IBAN saklamıyoruz". Alan koymamak tek başına yetmez: serbest
 * metin o kararın açık kapısıdır — kullanıcı açıklamaya yazar ve IBAN yine
 * veritabanına girer, üstelik adı konmamış bir yere.
 */
check(!stripIban("TR33 0006 1005 1978 6457 8413 26").includes("6457"), "boşluklu IBAN düşer");
check(!stripIban("TR330006100519786457841326").includes("841326"), "bitişik IBAN düşer");
check(!stripIban("hesap: 1234 5678 9012 3456").includes("9012"), "16 haneli hesap/kart numarası düşer");
eq(cleanText("Mezar taşı için TR33 0006 1005 1978 6457 8413 26 numaraya", 200),
   "Mezar taşı için numaraya", "açıklamadaki IBAN temizlenir");
eq(cleanText("Toplantı 2026-06-01 tarihinde", 200), "Toplantı 2026-06-01 tarihinde", "tarih korunur");
eq(cleanText("Hedef 12.500 TL", 200), "Hedef 12.500 TL", "tutar metni korunur");
eq(cleanText("Bak: https://kotu.example/x", 200), "Bak:", "bağlantı düşer");
eq(cleanText("<b>kalın</b>", 200), "b kalın /b", "açı ayraçları düşer");
eq(cleanText(42, 200), "", "metin olmayan girdi boş");

eq(cleanDay("2026-06-01"), "2026-06-01", "geçerli gün");
eq(cleanDay("01.06.2026"), "", "biçimsiz gün reddedilir");
eq(cleanDay(""), "", "boş gün");

/* ══ KAMPANYA — aidat / katkı defteri ══════════════════════════════════ */
{
  const c = normalizeCampaign({ title: "  Mezar taşı  ", targetText: "10.000" }, NOW)!;
  eq(c.title, "Mezar taşı", "başlık kırpılır");
  eq(c.targetKurus, 1000000, "hedef kuruşa çevrilir");
  eq(c.currency, "TRY", "varsayılan para birimi");
  eq(c.closed, false, "yeni kampanya açık");
  eq(c.pledges, [], "katkı listesi boş başlar");
}
check(normalizeCampaign({ title: "   " }, NOW) === null, "başlıksız kampanya reddedilir");
check(normalizeCampaign({ title: "X", targetText: "abc" }, NOW) === null, "geçersiz hedef reddedilir");
{
  const eski = normalizeCampaign({ title: "A", targetText: "100" }, NOW)!;
  eski.id = "c1";
  eski.pledges = [{ id: "p", name: "Ali", pledgedKurus: 100, paidKurus: 0, createdAt: NOW, updatedAt: NOW }];
  const yeni = normalizeCampaign({ title: "B" }, NOW, eski)!;
  eq(yeni.id, "c1", "kimlik korunur");
  eq(yeni.pledges.length, 1, "katkı satırları korunur");
  eq(yeni.targetKurus, 10000, "dokunulmayan hedef korunur");
}

{
  const P = (o: Partial<Pledge>): Pledge => ({
    id: "p", name: "Ali", pledgedKurus: 0, paidKurus: 0, createdAt: NOW, updatedAt: NOW, ...o,
  });
  const c: Pick<Campaign, "targetKurus" | "pledges"> = {
    targetKurus: 1000000,
    pledges: [
      P({ pledgedKurus: 500000, paidKurus: 500000 }),
      P({ pledgedKurus: 300000, paidKurus: 100000 }),
    ],
  };
  const s = campaignTally(c);
  eq(s.pledgedKurus, 800000, "taahhüt toplamı");
  eq(s.paidKurus, 600000, "beyan toplamı");
  eq(s.remainingKurus, 400000, "hedefe kalan BEYANDAN hesaplanır");
  eq(s.outstandingKurus, 200000, "söz verilip gelmeyen");
  eq(s.contributors, 2, "katkıcı sayısı");

  /* Fazla beyan eksiye düşürmemeli: eksi bir sayı ekranda "iade" gibi okunur. */
  const fazla = campaignTally({ targetKurus: 100, pledges: [P({ pledgedKurus: 100, paidKurus: 500 })] });
  eq(fazla.remainingKurus, 0, "hedefi aşan beyanda kalan sıfır");
  eq(fazla.outstandingKurus, 0, "fazla ödemede bekleyen sıfır");

  const hedefsiz = campaignTally({ targetKurus: 0, pledges: [P({ pledgedKurus: 100, paidKurus: 0 })] });
  eq(hedefsiz.remainingKurus, 0, "hedefsiz kampanyada kalan sıfır");
}

{
  const p = normalizePledge({ name: "Ayşe", pledgedText: "1.500", paidText: "500,50", paidAt: "2026-02-03" }, NOW)!;
  eq(p.pledgedKurus, 150000, "taahhüt kuruş");
  eq(p.paidKurus, 50050, "beyan kuruş");
  eq(p.paidAt, "2026-02-03", "beyan tarihi");
  check(!("personId" in p), "boş kişi bağı hiç yazılmaz");
}
check(normalizePledge({ name: "", pledgedText: "10" }, NOW) === null, "adsız katkı reddedilir");
check(normalizePledge({ name: "A", pledgedText: "on lira" }, NOW) === null, "geçersiz tutar reddedilir");

/* ══ BORÇ-ALACAK ═══════════════════════════════════════════════════════ */
{
  const d = normalizeDebt({ fromName: "Ali", toName: "Veli", amountText: "250", on: "2026-03-01" }, NOW)!;
  eq(d.amountKurus, 25000, "borç tutarı kuruş");
  check(!d.settledAt, "yeni borç açık");
}
check(normalizeDebt({ fromName: "Ali", toName: "", amountText: "5" }, NOW) === null, "tek taraflı borç reddedilir");
check(normalizeDebt({ fromName: "Ali", toName: "Veli", amountText: "0" }, NOW) === null, "sıfır tutarlı borç reddedilir");
{
  const acik = normalizeDebt({ fromName: "A", toName: "B", amountText: "10" }, NOW)!;
  const kapali = normalizeDebt({ settled: true }, "2026-05-05T00:00:00.000Z", acik)!;
  eq(kapali.settledAt, "2026-05-05T00:00:00.000Z", "kapanış damgası konur");
  const tekrar = normalizeDebt({ settled: false }, NOW, kapali)!;
  check(!tekrar.settledAt, "borç yeniden açılabilir (tutanak DEĞİL)");
}
{
  const D = (o: Partial<Debt>): Debt => ({
    id: "d", fromName: "A", toName: "B", amountKurus: 100, currency: "TRY",
    on: "2026-01-01", createdAt: NOW, updatedAt: NOW, ...o,
  });
  const t = openDebtTotals([
    D({ amountKurus: 10000 }),
    D({ amountKurus: 5000 }),
    D({ amountKurus: 999, settledAt: NOW }),
    D({ amountKurus: 2000, currency: "EUR" }),
  ]);
  eq(t, [
    { currency: "TRY", totalKurus: 15000, count: 2 },
    { currency: "EUR", totalKurus: 2000, count: 1 },
  ], "açık borçlar para birimi başına, kapananlar hariç");
}

/* ══ TUTANAK — kapandıktan sonra DEĞİŞTİRİLEMEZ ════════════════════════ */
/*
 * Bir meclis kararının bütün değeri değiştirilemezliğinde. Sonradan
 * düzeltilebilen tutanak, tutanak değil taslaktır.
 */
const K = (o: Partial<Decision> = {}): Decision => ({
  id: "k", title: "Buluşma nerede?", ballots: [], createdAt: NOW, updatedAt: NOW, ...o,
});
const B = (o: Partial<Ballot> = {}): Ballot => ({
  id: "b", voterId: "u1", voterName: "Ali", vote: "evet", at: NOW, ...o,
});

check(!isFrozen(K()), "açık karar donmuş değil");
check(isFrozen(K({ closedAt: NOW })), "kapalı karar donmuş");
check(normalizeDecision({ title: "Yeni" }, NOW, K({ closedAt: NOW })) === null,
  "DONMUŞ tutanağın metni değiştirilemez");
check(closeDecision(K({ closedAt: NOW }), NOW) === null, "kapalı karar ikinci kez kapatılamaz");
{
  const acik = K();
  const yeni = normalizeDecision({ title: "Değişti" }, NOW, acik)!;
  eq(yeni.title, "Değişti", "açık karar değiştirilebilir");
}

/* Oy: bir üye bir oy; ikinci oy YENİ SATIR değil GÜNCELLEME. */
{
  const r = normalizeBallot(K(), { voterId: "u1", voterName: "Ali", vote: "evet" }, NOW);
  check("ballot" in r && r.ballot.vote === "evet", "geçerli oy kabul edilir");
  check("ballot" in r && !r.replacesId, "ilk oy yeni satır");
}
{
  const r = normalizeBallot(K({ ballots: [B({ id: "b1", vote: "hayir" })] }),
    { voterId: "u1", voterName: "Ali", vote: "evet" }, NOW);
  check("ballot" in r && r.replacesId === "b1", "aynı üyenin ikinci oyu satırı GÜNCELLER");
}
{
  const r = normalizeBallot(K({ closedAt: NOW }), { voterId: "u1", vote: "evet" }, NOW);
  check("error" in r && r.error === "kapali", "kapanmış karara oy verilemez");
}
{
  const r = normalizeBallot(K(), { voterId: "u1", vote: "belki" }, NOW);
  check("error" in r && r.error === "gecersiz", "serbest oy reddedilir");
  const r2 = normalizeBallot(K(), { voterId: "", vote: "evet" }, NOW);
  check("error" in r2 && r2.error === "gecersiz", "kimliksiz oy reddedilir");
}
for (const v of ["evet", "hayir", "cekimser"]) check(isVote(v), `${v} geçerli oy`);
check(!isVote("belki"), "bilinmeyen oy değeri reddedilir");

/* Sayım ve sonuç: ÇEKİMSER bir yöne sayılmaz. */
{
  const t = decisionTally([B({ vote: "evet" }), B({ vote: "evet" }), B({ vote: "hayir" }), B({ vote: "cekimser" })]);
  eq(t, { evet: 2, hayir: 1, cekimser: 1, toplam: 4 }, "oy sayımı");
  eq(decisionOutcome(t), "kabul", "çoğunluk evet → kabul");
}
eq(decisionOutcome({ evet: 1, hayir: 3, cekimser: 0, toplam: 4 }), "ret", "çoğunluk hayır → ret");
eq(decisionOutcome({ evet: 2, hayir: 2, cekimser: 5, toplam: 9 }), "esitlik",
  "eşitlikte karar YOK — çekimserler bir yöne sayılmıyor");
eq(decisionOutcome({ evet: 0, hayir: 0, cekimser: 0, toplam: 0 }), "esitlik", "oysuz karar eşitlik");

/* Kapanışta sonuç HESAPLANIP DONDURULUYOR — sonradan türetilmiyor. */
{
  const d = closeDecision(K({ ballots: [B({ vote: "evet" }), B({ id: "b2", voterId: "u2", vote: "hayir" }), B({ id: "b3", voterId: "u3", vote: "evet" })] }), "2026-07-07T00:00:00.000Z")!;
  eq(d.outcome, "kabul", "kapanışta sonuç saklanır");
  eq(d.closedAt, "2026-07-07T00:00:00.000Z", "kapanış damgası");
  check(isFrozen(d), "kapanan karar donuyor");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
