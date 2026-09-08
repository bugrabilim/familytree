import AccountsClient from "./AccountsClient";

export const dynamic = "force-dynamic";

/**
 * Hesap yönetimi paneli — `/admin/migrate` ve `/admin/drift`in üçüncüsü.
 *
 * ## Neden burada `auth()` + `canManage` YOK
 *
 * Öbür iki sayfa oturumu okuyup yetkisizi yönlendiriyor; orada bu doğru,
 * çünkü o araçlar çağıranın KENDİ verisine bakıyor ve gösterecekleri şey
 * oturumdan çıkıyor. Bu sayfa hiçbir şey göstermiyor: bütün veri
 * `/api/admin/accounts`tan geliyor ve o uç yalnız `CRON_SECRET` ile
 * konuşuyor. Buraya bir `canManage` kapısı koymak, korumanın oturumda
 * olduğunu ima ederdi — oysa değil ve olamaz: bu uygulamada her kurucu
 * kendi ağacının yöneticisi, yani `canManage` herkesi geçirir. Yanlış yerde
 * duran bir kapı, olmayan bir kapıdan daha kötüdür; sonraki okuyucu ona
 * güvenir.
 *
 * Sayfanın kendisi yine de oturumsuz görünmüyor: `proxy.ts` oturumu olmayan
 * her isteği `/login`e yolluyor ve bu yol `lib/public-routes.ts`teki
 * oturumsuz listede DEĞİL. Yani duvar duruyor, sadece bu dosyada tekrar
 * edilmiyor.
 *
 * Sunucuda yapılacak bir iş de yok (sır tarayıcıda, istemci gönderiyor), o
 * yüzden burası yalnız istemci bileşenini çiziyor.
 */
export default function AccountsPage() {
  return <AccountsClient />;
}
