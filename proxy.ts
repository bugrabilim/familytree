import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { hasBearerApi, isPublicPath } from "@/lib/public-routes";

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // İzin listesi `lib/public-routes.ts`te — testli ve tek yer.
  if (
    !req.auth &&
    !isPublicPath(pathname) &&
    !hasBearerApi(pathname, req.headers.get("authorization"))
  ) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
