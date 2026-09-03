import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { frameHeaders, hasBearerApi, isPublicPath } from "@/lib/public-routes";

export default auth((req) => {
  const { pathname } = req.nextUrl;

  /*
   * Çerçeveleme koruması — HER yanıtta, yönlendirme dâhil.
   *
   * Bu depoda daha önce hiç yoktu: oturum açmış kullanıcının `/tree`
   * sayfası herhangi bir sitenin iframe'ine gömülebiliyor ve tıklama
   * kaçırmaya açık duruyordu. Varsayılan REDDET; yalnız `/embed`
   * gömülebilir. Kural `lib/public-routes.ts`te ve testli.
   *
   * Yönlendirmeye de konuyor: 307'nin gövdesi çizilmiyor, ama başlığı iki
   * yerde birden koymak "hangi dalda unuttuk" sorusunu ortadan kaldırıyor.
   */
  const damgala = (res: NextResponse) => {
    for (const [k, v] of Object.entries(frameHeaders(pathname))) res.headers.set(k, v);
    return res;
  };

  // İzin listesi `lib/public-routes.ts`te — testli ve tek yer.
  if (
    !req.auth &&
    !isPublicPath(pathname) &&
    !hasBearerApi(pathname, req.headers.get("authorization"))
  ) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return damgala(NextResponse.redirect(loginUrl));
  }

  return damgala(NextResponse.next());
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
