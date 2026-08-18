import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { pathname } = req.nextUrl;

  const isPublic =
    pathname === "/" ||
    pathname.startsWith("/privacy") ||
    pathname.startsWith("/terms") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/register") ||
    pathname.startsWith("/api/reset-password") ||
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
    pathname === "/favicon.ico";

  if (!req.auth && !isPublic) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
