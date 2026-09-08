import { readFileSync } from "node:fs";
import { isPublicPath } from "../lib/public-routes.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

/**
 * KAPI: kimlik e-postası (Faz 3e).
 *
 * İki kural var ve ikisi de sessizce delinebilir:
 *  1. Doğrulanmamış adres asla kurtarma yolu değildir.
 *  2. Adres değişince doğrulama sıfırlanır.
 *
 * Birincisini delmek "hesabı geri alma" yolunu doğrulanmamış bir adrese
 * açardı; ikincisini delmek kullanıcının kendi adresini doğrulayıp sonra
 * başkasınınkiyle değiştirerek doğrulanmış bir yabancı adres elde etmesine
 * izin verirdi.
 */

const lib = read("../lib/account-email.ts");
const bind = read("../app/api/account/email/route.ts");
const verify = read("../app/api/account/email/verify/route.ts");
const authUsers = read("../lib/auth-users.ts");
const sayfa = read("../app/verify-email/[token]/page.tsx");
const istemci = read("../app/verify-email/[token]/VerifyEmailClient.tsx");

/** Olumsuz iddialardan önce yorumlar ayıklanır. */
const kodu = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const bindKod = kodu(bind);
const authKod = kodu(authUsers);

/* --- Kural tek yerde --------------------------------------------------- */
check(/export function canRecoverByEmail/.test(lib), "kurtarma kuralı tek işlevde");
check(/if \(!a\.authEmailVerified\) return false;/.test(lib), "doğrulanmamış reddediliyor");
check(/if \(isSyntheticEmail\(e\)\) return false;/.test(lib), "sentetik adres reddediliyor");
check(/case "ayarla":[\s\S]{0,120}authEmailVerified: false/.test(lib), "adres değişince doğrulama sıfırlanıyor");

/* --- Bağlama ucu ------------------------------------------------------- */
check(bind.includes("resolveActiveTree"), "bağlama ucu oturum istiyor");
check(/if \(!ctx\.isFounder\)/.test(bind), "yalnız hesap sahibi");
check(bind.includes("rateLimitShared"), "bağlama sınırlı (posta yağdırma yolu)");
check(bind.includes("planEmailChange") && bind.includes("applyEmailChange"),
  "karar saf katmanda, rota yalnız uyguluyor");
/*
 * Bağlama ASLA doğrulanmış yazmamalı. Tek satırlık bir `true` bütün kuralı
 * boşa çıkarırdı.
 */
{
  // Yalnız YAZMA çağrılarına bak — yanıt gövdesinde mevcut durumu yansıtmak
  // meşru; kuralı delen şey depoya `true` yazmaktır.
  const yazmalar = [...bind.matchAll(/updateUserAuthEmail\([\s\S]*?\}\);/g)].map((m) => m[0]);
  check(yazmalar.length >= 2, `bağlama ucunda yazma çağrıları bulundu (${yazmalar.length})`);
  check(yazmalar.every((y) => !/authEmailVerified:\s*true/.test(y)),
    "bağlama ucu depoya hiçbir zaman doğrulanmış YAZMIYOR");
}

/* --- Doğrulama ucu ----------------------------------------------------- */
check(!verify.includes("resolveActiveTree"), "doğrulama oturum İSTEMİYOR (bilerek — posta başka cihazda açılır)");
check(verify.includes("rateLimitShared"), "oturumsuz uç sınırlı");
check(/createHash\("sha256"\)/.test(verify), "jeton özetle karşılaştırılıyor");
check(/x\.emailTokenHash && x\.emailTokenHash === hash/.test(verify),
  "boş/eksik özet eşleşmiyor (önce varlık denetimi)");
check(/if \(!token\) return/.test(verify), "boş jeton erkenden reddediliyor");
check(/emailTokenExpires <= new Date\(\)\.toISOString\(\)/.test(verify), "süre dolmuş jeton reddediliyor");
check(/emailTokenHash: null/.test(verify), "jeton TEK KULLANIMLIK (doğrulamayla düşüyor)");
// ÇAĞRI yerine bak, içe aktarma satırına değil: `includes` ikisini ayırmıyor.
check(/if \(verifyWouldCollide\([^)]*\)\)/.test(verify), "tekillik doğrulamada gerçekten ÇAĞRILIYOR");

/* --- Supabase tarafı: DOĞRULANMAMIŞ adres Auth'a hiç girmiyor ---------- */
/*
 * Eski kural "yazarken 'doğrulandı' deme"ydi ve gerekçesi sağlamdı, ama
 * bedeli görülmemişti: doğrulanmamış adres Auth'ta hesabın GİRİŞ adresi
 * hâline geliyordu. Proje e-posta onayını zorunlu tutuyorsa o kullanıcı
 * giriş yapamaz — bcrypt yedeği kalktığı için (Faz 4/1b) doğrudan
 * kilitlenme, üstelik kullanıcının hiçbir hata yapmadığı bir akışta.
 *
 * Kural artık daha güçlü: doğrulanmamış adres Auth'a HİÇ yazılmıyor.
 * Bağlama Auth'a dokunmuyor; adres yalnız doğrulama tamamlanınca ve
 * `email_confirm: true` ile giriyor.
 */
{
  check(!authKod.includes("updateAccountAuthEmail"),
    "gelişigüzel adres yazan işlev KALDIRILDI (yanlışlıkla çağrılamaz)");
  check(!bindKod.includes("confirmAccountAuthEmail"),
    "bağlama ucu adresi ONAYLAMIYOR");
  check(!/resetAccountAuthEmail\(ctx\.accountId,/.test(bindKod),
    "geri döndürme işlevi adres ALMIYOR (yalnız sentetiğe döner)");

  const j = authUsers.indexOf("export async function confirmAccountAuthEmail");
  check(j > 0 && authUsers.slice(j, authUsers.indexOf("\n}", j)).includes("email_confirm: true"),
    "onay ayrı bir işlevde ve orada 'doğrulandı' deniyor");
  check(verify.includes("confirmAccountAuthEmail("),
    "Auth'a yazma YALNIZ doğrulama ucundan");

  const i = authUsers.indexOf("export async function resetAccountAuthEmail");
  const govde = authUsers.slice(i, authUsers.indexOf("\n}", i));
  check(i > 0, "sentetiğe döndürme işlevi var");
  check(/email: authEmailForAccount\(accountId\)/.test(govde),
    "her zaman sentetik adrese döndürüyor (adres tahmin etmiyor)");
  check(govde.includes("email_confirm: true"),
    "sentetik adres ONAYLI yazılıyor — e-postasını kaldıran kullanıcı kendini kilitlemesin");
}

/* --- Sayfa görüntülemesi yan etki üretmiyor ---------------------------- */
/*
 * Posta istemcileri ve önizleme botları bağlantıları ön-getiriyor. Doğrulama
 * sayfa yüklenirken yapılsaydı jeton kullanıcı hiç görmeden tükenirdi.
 */
check(!sayfa.includes("fetch(") && !sayfa.includes("updateUserAuthEmail"),
  "sayfa açılışı jetonu tüketmiyor");
check(istemci.includes("onClick={dogrula}"), "doğrulamayı kullanıcı başlatıyor");

/* --- Yol izinleri ------------------------------------------------------ */
check(isPublicPath("/verify-email/abc"), "doğrulama sayfası oturumsuz açık");
check(isPublicPath("/api/account/email/verify"), "doğrulama ucu oturumsuz açık");
check(!isPublicPath("/api/account/email"), "bağlama ucu KAPALI kalıyor");

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
