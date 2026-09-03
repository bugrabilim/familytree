import { readFileSync } from "node:fs";
import { GUEST_DENIED, type GuestAction } from "../lib/guest.ts";
import { isPublicPath } from "../lib/public-routes.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

/**
 * KAPI: misafir hesap (Faz 3d).
 *
 * İki ayrı şeyi kilitliyor.
 *
 * ## 1. Bayrak zinciri
 *
 * `isGuest` altı duraktan geçiyor: User → SessionUser → JWT → session →
 * TreeContext → rota. HERHANGİ BİRİNDE düşerse misafir sessizce TAM YETKİ
 * kazanır — ve hiçbir hata vermez, yalnız kısıt kaybolur. Bu yüzden her
 * durak ayrı denetleniyor.
 *
 * ## 2. Kapalı yüzeyler
 *
 * `lib/guest.ts`teki liste yalnız bir niyet beyanı; rotalar ona bakmazsa
 * hiçbir şey ifade etmez. Kapalı her eylem için en az bir rotanın gerçekten
 * `canDo` çağırdığı denetleniyor.
 */

/* --- Zincir: altı durak ------------------------------------------------- */
{
  const user = read("../types/user.ts");
  check(/^\s*guest\?: boolean;/m.test(user), "1) User.guest alanı var");

  const cred = read("../lib/credentials.ts");
  check(/isGuest\?: boolean;/.test(cred), "2) SessionUser.isGuest var");

  const authTs = read("../auth.ts");
  check(/token\.isGuest = u\.isGuest === true;/.test(authTs), "3) JWT bayrağı taşıyor");
  check(/session\.user\.isGuest = token\.isGuest === true;/.test(authTs), "4) session bayrağı taşıyor");

  const ctx = read("../lib/tree-context.ts");
  check(/isGuest: session\.user\.isGuest === true,/.test(ctx), "5a) TreeContext çerezden okuyor");
  check(/isGuest: claims\.isGuest === true,/.test(ctx), "5b) TreeContext Bearer'dan okuyor");
  check((ctx.match(/isGuest,/g) ?? []).length >= 3, "5c) her dönüş dalı bayrağı taşıyor");

  const mob = read("../lib/mobile-token.ts");
  check(/isGuest: c\.isGuest === true/.test(mob), "6a) mobil jeton bayrağı yazıyor");
  check(/isGuest: payload\.isGuest === true,/.test(mob), "6b) mobil jeton bayrağı okuyor");
}

/* --- Varsayılan YÖNÜ doğru mu ------------------------------------------- */
/*
 * Her yerde `=== true`: bayrağın YOKLUĞU "gerçek hesap" demek. Ters yön
 * (yokluğu misafir saymak) mevcut bütün kullanıcıları kısıtlardı.
 */
{
  const authTs = read("../auth.ts");
  const ctx = read("../lib/tree-context.ts");
  const mob = read("../lib/mobile-token.ts");
  for (const [ad, src] of [["auth.ts", authTs], ["tree-context", ctx], ["mobile-token", mob]] as const) {
    const okumalar = [...src.matchAll(/isGuest[^\n]*/g)].map((m) => m[0]);
    const gevsek = okumalar.filter((l) => /isGuest\s*(\?\?|!==)/.test(l));
    check(gevsek.length === 0, `${ad}: bayrak gevşek okunmuyor (${gevsek.join(" | ") || "temiz"})`);
  }
}

/* --- Kapalı her eylem gerçekten bir rotada denetleniyor ------------------ */
{
  const rotalar: Array<[string, GuestAction]> = [
    ["../app/api/ai/act/route.ts", "ai"],
    ["../app/api/ai/chat/route.ts", "ai"],
    ["../app/api/ai/extract/route.ts", "ai"],
    ["../app/api/ai/suggest/route.ts", "ai"],
    ["../app/api/ai/voice/route.ts", "ai"],
    ["../app/api/upload/route.ts", "upload"],
    ["../app/api/tree/access/route.ts", "invite"],
    ["../app/api/tree/share/route.ts", "share"],
    ["../app/api/tree/pair/route.ts", "pair"],
    ["../app/api/tree/graft/route.ts", "pair"],
    ["../app/api/tree/merge-tree/route.ts", "pair"],
    ["../app/api/family/gatherings/route.ts", "gathering"],
    ["../app/api/account/email/route.ts", "email"],
  ];
  const gorulen = new Set<GuestAction>();
  for (const [yol, eylem] of rotalar) {
    const s = read(yol);
    const re = new RegExp(`canDo\\(ctx\\.isGuest,\\s*"${eylem}"\\)`);
    check(re.test(s), `${yol.split("/").slice(-2).join("/")}: canDo(…, "${eylem}") çağrılıyor`);
    if (re.test(s)) gorulen.add(eylem);
  }
  // Listedeki KAPALI her eylemin en az bir rotada karşılığı olmalı.
  for (const a of GUEST_DENIED) {
    check(gorulen.has(a), `"${a}" kapalı ama bir rotada denetlenmiyor mu? (karşılığı var)`);
  }
}

/* --- AI ve yükleme: asıl iki satır -------------------------------------- */
/*
 * Bu ikisi düşerse kota diye bir şey kalmaz: saldırgan her çağrı için yeni
 * misafir hesabı açar. Ayrıca denetleniyor.
 */
check(GUEST_DENIED.has("ai"), "AI kapalı listede");
check(GUEST_DENIED.has("upload"), "yükleme kapalı listede");

/* --- Misafir sağlayıcısı bir arka kapı DEĞİL ---------------------------- */
{
  const authTs = read("../auth.ts");
  const i = authTs.indexOf('id: "guest"');
  const govde = authTs.slice(i, i + 900);
  check(i > 0, "misafir sağlayıcısı var");
  check(/if \(!user \|\| !user\.guest\) return null;/.test(govde),
    "misafir OLMAYAN hesap bu kapıdan giremiyor (şifresiz giriş değil)");
  check(/isGuest: true/.test(govde), "sağlayıcı bayrağı işaretliyor");
}

/* --- Hesap üretme ucu korumalı ------------------------------------------ */
{
  const oluştur = read("../app/api/guest/route.ts");
  check(/await rateLimitShared\(/.test(oluştur), "misafir açma sınırlı (ÇAĞRI, içe aktarma değil)");
  check(/if \(session\?\.user\?\.id\)/.test(oluştur), "oturum varken yeni hesap açılmıyor");
  /*
   * DÜZELTME: burada önce tersini iddia etmiştim. Bu uç oturumu OLMAYAN biri
   * için hesap açıyor — oturum duvarının arkasında hiç çalışamaz. Canlı
   * denemede 307 dönmesi hatayı gösterdi.
   */
  check(isPublicPath("/api/guest"), "misafir açma ucu oturumsuz erişilebilir");
  check(!isPublicPath("/api/guest/claim"), "SAHİPLENME oturum istiyor (önek sızıntısı yok)");
  check(!isPublicPath("/api/guestx"), "önek benzeri yol açılmıyor");

  const claim = read("../app/api/guest/claim/route.ts");
  check(/planClaim\(u, body/.test(claim), "sahiplenme saf plandan geçiyor (çağrı)");
  check(/await rateLimitShared\(/.test(claim), "sahiplenme sınırlı (ÇAĞRI)");
  check(/reloginRequired: true/.test(claim), "sahiplenme sonrası yeniden giriş gerektiği bildiriliyor");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
