import {
  RESET_TTL_MINUTES,
  checkResetToken,
  clearedResetToken,
  planResetRequest,
  type ResetAccount,
} from "../lib/password-reset.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

const SIMDI = new Date("2026-09-05T20:00:00Z");
const UUID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

/* ── İSTEK PLANI ─────────────────────────────────────────────────────────── */

{
  const saglam: ResetAccount = { authEmail: "ali@x.com", authEmailVerified: true };
  const p = planResetRequest(saglam, SIMDI);
  check(p.kind === "gonder", "doğrulanmış adrese bağlantı gönderilir");
  check(p.kind === "gonder" && p.email === "ali@x.com", "hedef adres doğru");
}

/* --- ASIL KURAL: doğrulanmamış adres kurtarma yolu DEĞİLDİR ------------- */
/*
 * Bu kural `lib/account-email.ts`te tek yerde ve burası onu ÇAĞIRIYOR.
 * Kopyalansaydı iki tanım ayrışırdı; ayrışmanın bedeli, yabancı bir adrese
 * hesabı ele geçirme bağlantısı göndermek olurdu.
 */
for (const [ad, hesap] of [
  ["adres yok", {}],
  ["doğrulanmamış", { authEmail: "ali@x.com" }],
  ["açıkça false", { authEmail: "ali@x.com", authEmailVerified: false }],
  ["boş adres, doğrulanmış", { authEmail: "   ", authEmailVerified: true }],
  ["sentetik adres", { authEmail: `${UUID}@soyagaci.local`, authEmailVerified: true }],
] as Array<[string, ResetAccount]>) {
  check(planResetRequest(hesap, SIMDI).kind === "gonderme", `gönderilmiyor: ${ad}`);
}
check(planResetRequest(null, SIMDI).kind === "gonderme", "hesap yoksa gönderilmiyor");
check(planResetRequest(undefined, SIMDI).kind === "gonderme", "undefined hesapta gönderilmiyor");

/* --- Sebep AYRIŞTIRILABİLİR ama kullanıcıya GİTMEZ ---------------------- */
/*
 * `reason` yalnız sunucu günlüğü için. Rota her dalda aynı yanıtı vermeli;
 * aksi hâlde hangi aile adlarının kayıtlı olduğunu ve hangilerinin e-posta
 * bağladığını sayan bir kâhin doğar. Aynı hata bu depoda bir kez yapılmıştı.
 */
{
  const sebep = (h: ResetAccount | null) => {
    const p = planResetRequest(h, SIMDI);
    return p.kind === "gonderme" ? p.reason : "gonder";
  };
  check(sebep(null) === "hesap-yok", "sebep: hesap yok");
  check(sebep({}) === "adres-yok", "sebep: adres yok");
  check(sebep({ authEmail: "a@b.com" }) === "dogrulanmamis", "sebep: doğrulanmamış");
}

/* --- Süre ---------------------------------------------------------------- */
{
  const p = planResetRequest({ authEmail: "ali@x.com", authEmailVerified: true }, SIMDI);
  check(p.kind === "gonder" && p.expires === "2026-09-05T21:00:00.000Z",
    `bitiş ${RESET_TTL_MINUTES} dakika sonra`);
  /*
   * Sıfırlama jetonu HESABIN KENDİSİNİ veriyor; adres doğrulama jetonu (24
   * saat) yalnız bir adresi bağlıyor. Yetkisi büyük olanın penceresi dar
   * olmalı.
   */
  check(RESET_TTL_MINUTES <= 60, "sıfırlama penceresi en fazla bir saat");
  check(RESET_TTL_MINUTES * 60 < 24 * 3600, "doğrulama jetonundan KISA");
}

/* ── JETON DENETİMİ ──────────────────────────────────────────────────────── */

const HASH = "a".repeat(64);
const gecerli: ResetAccount = {
  authEmail: "ali@x.com",
  authEmailVerified: true,
  resetTokenHash: HASH,
  resetTokenExpires: "2026-09-05T21:00:00.000Z",
};

check(checkResetToken(gecerli, HASH, SIMDI).ok, "geçerli jeton kabul ediliyor");

{
  const r = checkResetToken(gecerli, "b".repeat(64), SIMDI);
  check(!r.ok && r.reason === "eslesmiyor", "yanlış jeton reddediliyor");
}
{
  // Uzunluğu farklı bir özet de reddedilmeli (erken çıkış dalı).
  const r = checkResetToken(gecerli, "a".repeat(10), SIMDI);
  check(!r.ok && r.reason === "eslesmiyor", "kısa jeton reddediliyor");
}
for (const [ad, hesap] of [
  ["jeton hiç yok", { authEmail: "a@b.com", authEmailVerified: true }],
  ["yalnız özet var", { resetTokenHash: HASH }],
  ["yalnız süre var", { resetTokenExpires: "2026-09-05T21:00:00.000Z" }],
  ["temizlenmiş jeton", { resetTokenHash: "", resetTokenExpires: "" }],
] as Array<[string, ResetAccount]>) {
  const r = checkResetToken(hesap, HASH, SIMDI);
  check(!r.ok && r.reason === "jeton-yok", `jeton yok sayılıyor: ${ad}`);
}
check(!checkResetToken(null, HASH, SIMDI).ok, "hesap yoksa jeton geçersiz");

/* --- Süre sınırı: tam sınırda REDDEDİLİR -------------------------------- */
/*
 * Bir saniyelik belirsizlikte güvenli taraf "reddet". `>` yazılsaydı tam
 * sınırdaki jeton kabul edilirdi.
 */
{
  const tamSinir = new Date("2026-09-05T21:00:00.000Z");
  const r = checkResetToken(gecerli, HASH, tamSinir);
  check(!r.ok && r.reason === "suresi-dolmus", "tam sınırda süresi dolmuş sayılıyor");

  const birMsOnce = new Date("2026-09-05T20:59:59.999Z");
  check(checkResetToken(gecerli, HASH, birMsOnce).ok, "sınırdan hemen önce geçerli");

  const sonra = new Date("2026-09-05T22:00:00Z");
  const r2 = checkResetToken(gecerli, HASH, sonra);
  check(!r2.ok && r2.reason === "suresi-dolmus", "süre dolunca reddediliyor");
}
{
  /*
   * SÜRE ÖNCE denetleniyor: süresi dolmuş bir jetonun özeti doğru olsa bile
   * kabul edilmemeli. Sıra ters olsaydı süresiz bir jeton doğardı.
   */
  const r = checkResetToken(gecerli, HASH, new Date("2026-09-06T00:00:00Z"));
  check(!r.ok && r.reason === "suresi-dolmus", "doğru özet bile süre dolunca geçmiyor");
}

/* ── TEK KULLANIM ────────────────────────────────────────────────────────── */
/*
 * Jeton kullanıldıktan sonra düşmezse, aynı bağlantı postada durduğu sürece
 * hesabı tekrar tekrar ele geçirmeye yarar.
 */
{
  const temiz = clearedResetToken();
  check(temiz.resetTokenHash === "" && temiz.resetTokenExpires === "", "jeton alanları temizleniyor");
  const sonra: ResetAccount = { ...gecerli, ...temiz };
  const r = checkResetToken(sonra, HASH, SIMDI);
  check(!r.ok && r.reason === "jeton-yok", "temizlenmiş jeton bir daha kullanılamıyor");
}

/* ── JETON KARIŞMASI: doğrulama jetonu sıfırlama jetonu DEĞİLDİR ────────── */
/*
 * `emailTokenHash` adres doğrulama içindir. Aynı alan burada da kullanılsaydı,
 * adresini doğrulamak için gönderilen bir postayı ele geçiren biri hesabın
 * şifresini de değiştirebilirdi. Alanlar ayrı olduğu için doğrulama jetonu
 * taşıyan bir hesapta sıfırlama denetimi "jeton yok" der.
 */
{
  const dogrulamaJetonuVar = {
    authEmail: "ali@x.com",
    authEmailVerified: true,
    emailTokenHash: HASH,
    emailTokenExpires: "2026-09-06T20:00:00.000Z",
  } as ResetAccount & { emailTokenHash: string; emailTokenExpires: string };
  const r = checkResetToken(dogrulamaJetonuVar, HASH, SIMDI);
  check(!r.ok && r.reason === "jeton-yok",
    "doğrulama jetonu şifre sıfırlamaya YARAMIYOR");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
