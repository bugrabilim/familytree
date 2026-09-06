import { NextRequest, NextResponse } from "next/server";
import { signOut } from "@/auth";
import { resolveActiveTree } from "@/lib/tree-context";
import { findUserById } from "@/lib/users";
import { verifyFounderPassword } from "@/lib/credentials";
import { softDeleteAccount } from "@/lib/account-lifecycle";
import { DEMO_USER_ID } from "@/lib/demo-account";
import { confirmMatches, GRACE_DAYS } from "@/lib/retention";
import { rateLimitShared } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * HESABI SİL — `POST /api/account/delete` { password, confirm }.
 *
 * Hesap `GRACE_DAYS` gün bekleme süresine alınır: giriş kapanır, ağaçlar her
 * yüzeyden düşer, ama veri durur ve `POST /api/account/restore` ile şifreyle
 * geri alınabilir. Süre dolunca zamanlanmış iş (`app/api/cron/backup`) sahip
 * olunan HER ŞEYİ kalıcı siler.
 *
 * ## Neden şifre ZORUNLU
 *
 * Oturum çerezi tek başına yetmez. Çalınmış ya da açık bırakılmış bir
 * oturumda hesabın kalıcı silinmesi tek tıkla olmamalı — geri dönüşü olan tek
 * şey bekleme süresi ve onu da fark etmek için kullanıcının haberi olması
 * gerekiyor.
 *
 * `confirm` ayrı bir soru: şifre "sen misin", aile adını yazmak "ne yaptığının
 * farkında mısın". İkisi farklı hatalara karşı (çalınmış oturum vs. dalgınlık).
 *
 * ## Dışa aktarma
 *
 * Arayüz silmeden önce dışa aktarmayı öneriyor; sunucu tarafında engel yok —
 * `GET /api/family/export` bu uç çağrılana kadar (ve hesabın her ağacı için)
 * çalışır. Silmeden SONRA çalışmaz: oturum kapanır.
 */

function ipOf(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "bilinmiyor"
  );
}

export async function POST(req: NextRequest) {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status });
  if (!ctx.isFounder)
    return NextResponse.json({ error: "Yalnız hesap sahibi hesabı silebilir." }, { status: 403 });

  /*
   * DEMO HESABI SİLİNEMEZ. Herkese açık ortak oyun alanı: ziyaretçi orada
   * founder yetkisiyle geziyor, yani bu uç açık olsaydı ilk meraklı ziyaretçi
   * demoyu herkes için kapatırdı. Aynı kural `lib/account-lifecycle.ts`te de
   * var — kapı iki katmanda, çünkü ileride başka bir çağıran çıkabilir.
   */
  if (ctx.accountId === DEMO_USER_ID)
    return NextResponse.json({ error: "Demo hesabı silinemez." }, { status: 403 });

  /*
   * ORAN SINIRI ŞİFRE DENEMESİNDEN ÖNCE. Bu uç, oturumu olan birine hesabın
   * şifresini deneme imkânı veriyor (silme onayı olarak); sınırsız olsaydı
   * çalınmış bir çerez, şifreyi kaba kuvvetle bulmanın aracına dönerdi.
   * Anahtar hesap + IP: aynı hesabı iki yerden denemek de sayılsın.
   */
  const rl = await rateLimitShared(`account:delete:${ctx.accountId}:${ipOf(req)}`, {
    capacity: 5,
    refillPerSec: 0.01,
  });
  if (!rl.ok)
    return NextResponse.json(
      { error: "Çok fazla deneme. Lütfen biraz bekleyin." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );

  const body = await req.json().catch(() => ({}));
  const password = typeof body.password === "string" ? body.password : "";

  const user = await findUserById(ctx.accountId);
  if (!user) return NextResponse.json({ error: "Hesap bulunamadı." }, { status: 400 });

  if (!confirmMatches(body.confirm, user.familyName))
    return NextResponse.json(
      { error: `Onay için aile adını birebir yazın: ${user.familyName}` },
      { status: 400 }
    );

  if (!password || !(await verifyFounderPassword(user, password)))
    return NextResponse.json({ error: "Şifre doğrulanamadı." }, { status: 403 });

  const r = await softDeleteAccount(ctx.accountId);
  if (!r.ok) {
    const mesaj =
      r.reason === "demo"
        ? "Demo hesabı silinemez."
        : r.reason === "already-deleted"
          ? "Bu hesap zaten silinmiş durumda."
          : "Hesap bulunamadı.";
    return NextResponse.json({ error: mesaj }, { status: 400 });
  }

  /*
   * OTURUMU DA KAPAT. Çerez yine de sunucuda geçersiz sayılıyor
   * (`resolveActiveTree` silinmiş hesabı çözmüyor), ama kullanıcının
   * tarayıcısında ölü bir oturumun durması "silinmiş" hissini bozar.
   * Best-effort: kapanmazsa silme yine geçerli.
   */
  try {
    await signOut({ redirect: false });
  } catch (e) {
    console.warn("[hesap-silme] oturum kapatılamadı:", (e as Error).message);
  }

  const govde = {
    ok: true,
    deletedAt: r.deletedAt,
    purgeAt: r.purgeAt,
    daysLeft: r.daysLeft,
    graceDays: GRACE_DAYS,
  };
  /*
   * 207: hesap beklemeye alındı AMA bir yol damgalanamadı (ör. bir ağacın
   * erişim dosyası yazılamadı) — yani o ağacın paylaşım bağlantısı hâlâ açık
   * olabilir. Sessizce 200 dönmek, kullanıcıya yanlış bir "her şey kapandı"
   * demek olurdu.
   */
  if (r.failed.length > 0) return NextResponse.json({ ...govde, failed: r.failed }, { status: 207 });
  return NextResponse.json(govde);
}
