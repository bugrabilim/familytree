import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { pathname } = req.nextUrl;

  const isPublic =
    // Statik varlıklar (public/): görseller, ikonlar, yazı tipleri —
    // bunlar korumaya takılırsa <img> istekleri /login'e yönlenir.
    /\.(?:webp|webm|mp4|png|jpe?g|gif|svg|ico|avif|woff2?|txt|xml|webmanifest)$/i.test(pathname) ||
    pathname === "/" ||
    pathname.startsWith("/tanitim") ||
    pathname.startsWith("/privacy") ||
    pathname.startsWith("/terms") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/register") ||
    pathname.startsWith("/api/reset-password") ||
    // Native mobil kimlik uçları (jeton alma) — oturum gerektirmez.
    pathname.startsWith("/api/mobile/login") ||
    pathname.startsWith("/api/mobile/register") ||
    pathname.startsWith("/join") ||
    pathname.startsWith("/api/tree/join") ||
    // Herkese açık salt-okunur paylaşım görünümü (üyeliksiz).
    pathname === "/g" ||
    pathname.startsWith("/g/") ||
    // Eşleştirme daveti kabul sayfası (giriş yönlendirmesini kendi yönetir;
    // jetonu kaybetmemek için önce sayfa yüklenmeli).
    pathname === "/pair" ||
    /^\/pair\/[^/]+$/.test(pathname) ||
    pathname.startsWith("/_next") ||
    // Vercel Analytics / Speed Insights betikleri. İzin listesinde
    // olmadıkları için oturumsuz her ziyarette /login'e 307 dönüyor,
    // tarayıcı HTML'i betik diye ayrıştırıp hata veriyordu: yani ölçüm
    // TAM DA en çok gereken yerde — açılış, tanıtım ve herkese açık
    // paylaşım sayfalarında — hiç çalışmıyordu.
    pathname.startsWith("/_vercel/") ||
    pathname === "/favicon.ico";

  // Native mobil: `Authorization: Bearer` taşıyan API istekleri çerez oturumu
  // olmadan gelir; /login'e yönlendirme (302) yerine rotaya bırak — rota jetonu
  // resolveActiveTree ile doğrular. Yalnız /api/* için geçerli.
  const hasBearer =
    pathname.startsWith("/api/") &&
    (req.headers.get("authorization")?.startsWith("Bearer ") ?? false);

  if (!req.auth && !isPublic && !hasBearer) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
