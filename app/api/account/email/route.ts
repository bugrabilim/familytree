import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { resolveActiveTree } from "@/lib/tree-context";
import { canDo } from "@/lib/guest";
import { getUsersData, updateUserAuthEmail } from "@/lib/users";
import {
  applyEmailChange,
  canRecoverByEmail,
  emailTakenBy,
  planEmailChange,
} from "@/lib/account-email";
import { updateAccountAuthEmail } from "@/lib/auth-users";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { SITE_URL } from "@/lib/site";
import { rateLimitShared } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * HESABIN KİMLİK E-POSTASI (Supabase Faz 3e, madde 42).
 *
 *  GET  → { authEmail, authEmailVerified, canRecover, pending, deliverable }
 *  POST → body { email }  — adresi bağlar ve doğrulama başlatır
 *
 * ## İki adım, bilerek ayrı
 *
 * BAĞLAMA kullanıcının adresi yazmasıdır; DOĞRULAMA o adresin gerçekten ona
 * ait olduğunun kanıtıdır. Bu uç yalnız birincisini yapar. Doğrulanmamış bir
 * adres hiçbir zaman kurtarma yolu değildir (`canRecoverByEmail`) — kural
 * `lib/account-email.ts`te, tek yerde.
 *
 * ## Teslimat henüz yok
 *
 * Doğrulama bağlantısı e-postayla gider ve e-posta sağlayıcısı madde 54'e
 * bağlı. Sağlayıcı yokken jeton yine üretilir ve saklanır ama gönderilemez;
 * yanıt `deliverable: false` der ki arayüz "doğrulama e-postası yolda"
 * yalanını söylemesin. Sağlayıcı geldiğinde bu uç hiç değişmeden çalışır.
 *
 * Yalnız founder hesap: kimlik e-postası hesabın kendisine ait, ağacın değil.
 */

const TTL_SAAT = 24;

function ipOf(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "bilinmiyor"
  );
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function GET() {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status });
  /*
   * MİSAFİR KAPISI (Faz 3d). Gerekçe `lib/guest.ts` başında: misafir
   * hesabı sınırsız üretilebiliyor, dolayısıyla hesap başına ölçülen
   * ya da kendi ağacının dışına uzanan hiçbir yüzey ona açık olamaz.
   */
  if (!canDo(ctx.isGuest, "email"))
    return NextResponse.json({ error: "Önce ağacınızı sahiplenin; e-posta bağlama ondan sonra." }, { status: 403 });
  if (!ctx.isFounder)
    return NextResponse.json({ error: "Yalnız hesap sahibi." }, { status: 403 });

  const { users } = await getUsersData();
  const u = users.find((x) => x.id === ctx.accountId);
  const bekleyen =
    !!u?.emailTokenHash &&
    !!u?.emailTokenExpires &&
    u.emailTokenExpires > new Date().toISOString();

  return NextResponse.json({
    authEmail: u?.authEmail ?? "",
    authEmailVerified: !!u?.authEmailVerified,
    canRecover: canRecoverByEmail(u ?? {}),
    pending: bekleyen,
    // Arayüz "e-posta yolda" demeden önce buna bakmalı.
    deliverable: isEmailConfigured(),
  });
}

export async function POST(req: NextRequest) {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status });
  if (!ctx.isFounder)
    return NextResponse.json({ error: "Yalnız hesap sahibi." }, { status: 403 });

  /*
   * Sınırlı: her istek bir doğrulama postası tetikleyebiliyor, yani sınırsız
   * çağrı başkasının kutusuna posta yağdırmanın yolu olurdu.
   */
  const rl = await rateLimitShared(`email:bind:${ctx.accountId}:${ipOf(req)}`, {
    capacity: 5,
    refillPerSec: 0.02,
  });
  if (!rl.ok)
    return NextResponse.json(
      { error: "Çok fazla deneme. Lütfen biraz bekleyin." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );

  let body: { email?: unknown };
  try {
    body = (await req.json()) as { email?: unknown };
  } catch {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }

  const { users } = await getUsersData();
  const u = users.find((x) => x.id === ctx.accountId);
  if (!u) return NextResponse.json({ error: "Hesap bulunamadı." }, { status: 404 });

  const plan = planEmailChange(u, body.email);
  if (plan.kind === "gecersiz")
    return NextResponse.json({ error: "Geçerli bir e-posta adresi girin." }, { status: 400 });

  const sonraki = applyEmailChange(plan)!;

  /*
   * Tekillik BAĞLAMADA değil doğrulamada zorlanıyor — ama başkasının
   * DOĞRULANMIŞ adresini bağlamaya çalışmak baştan reddediliyor ki kullanıcı
   * doğrulama sonuna kadar gidip orada duvara toslamasın.
   */
  if (sonraki.authEmail && emailTakenBy(sonraki.authEmail, users, ctx.accountId))
    return NextResponse.json(
      { error: "Bu e-posta başka bir hesapta doğrulanmış." },
      { status: 409 }
    );

  // Temizleme: jeton da düşer.
  if (!sonraki.authEmail) {
    await updateUserAuthEmail(ctx.accountId, {
      authEmail: "",
      authEmailVerified: false,
      emailTokenHash: null,
      emailTokenExpires: null,
    });
    try {
      await updateAccountAuthEmail(ctx.accountId, "");
    } catch (e) {
      console.warn(`[3e] auth e-posta temizleme (${ctx.accountId}):`, (e as Error).message);
    }
    return NextResponse.json({ ok: true, authEmail: "", authEmailVerified: false });
  }

  // Zaten doğrulanmış aynı adres → yeni jeton üretmeye gerek yok.
  if (plan.kind === "degismedi" && sonraki.authEmailVerified) {
    return NextResponse.json({ ok: true, authEmail: sonraki.authEmail, authEmailVerified: true });
  }

  const token = randomBytes(24).toString("base64url");
  const expires = new Date(Date.now() + TTL_SAAT * 3600_000).toISOString();
  await updateUserAuthEmail(ctx.accountId, {
    authEmail: sonraki.authEmail,
    authEmailVerified: false,
    emailTokenHash: sha256(token),
    emailTokenExpires: expires,
  });

  /*
   * Supabase Auth tarafını da güncelle (best-effort) — orada da DOĞRULANMAMIŞ
   * olarak. Başarısızlık bağlamayı geri almıyor: Blob kaynak doğruluğu ve
   * göç/denetim araçları bu ayrışmayı zaten yakalar.
   */
  try {
    await updateAccountAuthEmail(ctx.accountId, sonraki.authEmail);
  } catch (e) {
    console.warn(`[3e] auth e-posta güncelleme (${ctx.accountId}):`, (e as Error).message);
  }

  const link = `${SITE_URL}/verify-email/${encodeURIComponent(token)}`;
  let sent = false;
  if (isEmailConfigured()) {
    const r = await sendEmail({
      to: sonraki.authEmail,
      subject: "Soy Ağacı — e-posta adresinizi doğrulayın",
      text: `Hesabınıza bu adresi bağlamak için bağlantıya tıklayın:\n\n${link}\n\nBağlantı ${TTL_SAAT} saat geçerlidir. Bu isteği siz yapmadıysanız yok sayın.`,
    });
    sent = r.sent;
  }

  return NextResponse.json({
    ok: true,
    authEmail: sonraki.authEmail,
    authEmailVerified: false,
    // Arayüz buna bakıp doğru cümleyi kuruyor; "yolda" demiyoruz göndermeden.
    deliverable: isEmailConfigured(),
    sent,
  });
}
