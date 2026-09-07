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

  /*
   * İzin listesi `lib/public-routes.ts`te — testli ve tek yer.
   *
   * ## Bilinmeyen yollar neden 404 değil, /login'e yönleniyor
   *
   * Oturumsuz bir ziyaretçi `/bu-yol-yok-12345` istediğinde 404 değil
   * `307 → /login?callbackUrl=…` alıyor. Denetimde "kullanıcı yanlış bir
   * bağlantıyı 'giriş gerekiyor' sanıyor" diye işaretlendi; bilerek
   * BÖYLE BIRAKILDI:
   *
   *  1. Ara katman bir yolun VAR OLUP OLMADIĞINI bilmiyor. Bilmesi için
   *     uygulamadaki rotaların ikinci bir listesi gerekirdi — tam da
   *     `lib/public-routes.ts`in ortadan kaldırmak için yazıldığı türden bir
   *     kopya liste. Ve bu kopyanın kayması ÇOK DAHA KÖTÜ bir hata üretirdi:
   *     listeye eklenmeyi unutan GERÇEK bir sayfa, oturumsuz gelen kullanıcıya
   *     404 gösterirdi — yani derin bağlantı (davet, paylaşım, e-posta) o
   *     kullanıcı için tamamen ulaşılamaz olurdu. Bugünkü davranışta en kötü
   *     ihtimal fazladan bir giriş adımı.
   *  2. Çıkmaz zaten kapandı: `callbackUrl` yolu taşıdığı için kullanıcı
   *     giriş yaptıktan sonra o yola dönüyor ve orada artık markalı, Türkçe
   *     ve çıkış yolu olan 404 sayfamız (`app/not-found.tsx`) çiziliyor.
   *  3. Yan fayda: oturum açmamış birine hangi korumalı yolların var olduğu
   *     söylenmiyor; `/admin/drift` ile `/admin/olmayan` aynı yanıtı veriyor.
   *     Bu tek başına yeterli bir gerekçe olmazdı, ama 1. maddenin yanında
   *     değişmemek için ek bir sebep.
   */
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
