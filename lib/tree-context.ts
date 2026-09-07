import { cookies, headers } from "next/headers";
import { auth } from "@/auth";
import { verifyMobileToken } from "@/lib/mobile-token";
import { accessibleTreeIds, hasTreeAccess } from "@/lib/trees";
import { isAccountDeleted, sessionEpochOf } from "@/lib/users";
import { getTreeAccess } from "@/lib/members";
import { normalizeRole, type TreeRole } from "@/types/user";

/** Aktif ağaç kimliğini taşıyan çerez. */
export const ACTIVE_TREE_COOKIE = "soyagaci_tree";
/** Mobil: aktif ağacı seçen başlık (çoklu ağaçta çerez yerine). */
export const ACTIVE_TREE_HEADER = "x-tree-id";

export type TreeContext =
  | { ok: false; status: number }
  | {
      ok: true;
      accountId: string;
      treeId: string;
      role: TreeRole;
      isFounder: boolean;
      /**
       * Bu değişikliği YAPAN kişinin kimliği — katkı akışı için.
       *
       * Davetli üyede kendi üye kimliği, kurucuda ağacın kimliği.
       * `accountId`den ayrı olması şart: o "hangi ağaç" sorusunun yanıtı ve
       * bir ağaçtaki HERKES için aynı. Kaydetmeleri onunla imzaladığımız
       * sürece katkı akışı kimseyi adlandıramıyor, iki farklı üyenin
       * düzenlemesi veride de ayırt edilemiyordu.
       */
      authorId: string;
    };

/**
 * Oturumu iki kaynaktan çözer: önce `Authorization: Bearer` (native mobil jeton),
 * yoksa NextAuth çerez oturumu (web). Böylece tüm API rotaları hem web hem mobil
 * için çalışır — rota başına değişiklik gerekmez.
 */
async function resolveSessionUser(): Promise<{
  id: string;
  isFounder: boolean;
  role: TreeRole;
  memberId?: string;
  /** Jetonun verildiği an (saniye) — `sessionEpoch` denetimi için. */
  iat?: number;
} | null> {
  const h = await headers();
  const authz = h.get("authorization");
  if (authz?.startsWith("Bearer ")) {
    const claims = await verifyMobileToken(authz.slice(7).trim());
    if (claims)
      return {
        id: claims.sub,
        isFounder: claims.isFounder,
        role: claims.role,
        memberId: claims.memberId,
        iat: claims.iat,
      };
    return null; // geçersiz jeton → doğrudan reddet (çerezle karışmasın)
  }
  const session = await auth();
  if (session?.user?.id) {
    return {
      id: session.user.id,
      isFounder: session.user.isFounder ?? true,
      /*
       * Eski oturumlar rol taşımayabilir ya da ESKİ ADI taşır; ikisini de
       * `normalizeRole` çeviriyor. Rolsüz oturum `yonetici` sayılıyor —
       * onlar ağaç şifresiyle giren kuruculardı.
       */
      role: session.user.role === undefined ? "yonetici" : normalizeRole(session.user.role),
      memberId: session.user.memberId,
      iat: session.user.iat,
    };
  }
  return null;
}

/**
 * Aktif ağaç + rol çözümü (çoklu ağaç). Founder değilse (davetli üye) daima
 * giriş yaptığı ağaç ve kendi rolü. Founder ise çerezdeki ağaç, YALNIZ sahip
 * olduğu ağaçlardan biriyse (yetki denetimi); değilse ana ağaç. Founder sahip
 * olduğu her ağacın adminidir.
 */
export async function resolveActiveTree(): Promise<TreeContext> {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return { ok: false, status: 401 };

  const accountId = sessionUser.id;

  /*
   * SİLİNMEKTE OLAN HESABIN OTURUMU DA ÇÖZÜLMEZ.
   *
   * Girişi kapatmak (`lib/credentials.ts`) tek başına yetmiyor: silmeden
   * önce verilmiş NextAuth çerezi ve mobil JWT günlerce geçerli kalıyor ve
   * ikisi de geri çağrılamıyor. Bu satır olmasaydı "hesabımı sildim" diyen
   * kullanıcı, açık sekmesinden uygulamayı kullanmaya devam ederdi.
   *
   * Bedeli her istekte bir hesap listesi okuması olurdu; `isAccountDeleted`
   * bu yüzden birkaç saniyelik bir önbellek tutuyor (`lib/users.ts`).
   */
  if (await isAccountDeleted(accountId)) return { ok: false, status: 401 };

  /*
   * ŞİFRE SIFIRLANDIYSA ESKİ OTURUMLAR DÜŞÜYOR.
   *
   * Ne çerez ne JWT geri çağrılabiliyor; ikisi de imzalandıktan sonra
   * kendi başına geçerli. Sıfırlama `users.json`a bir çağ damgası koyuyor
   * (`lib/users.ts`), burası da o çağdan eski her oturumu reddediyor.
   *
   * `iat` YOKSA REDDEDİLİYOR — ama yalnız çağ VARSA. Çağ konmuş bir hesapta
   * "ne zaman verildiği bilinmeyen" bir oturum, tam olarak düşürmek
   * istediğimiz eski oturumdur; kabul etmek denetimi delik bırakırdı.
   * Çağ hiç yoksa (hesap hiç sıfırlanmamış) `iat`siz eski oturumlar
   * çalışmaya devam ediyor.
   */
  const cag = await sessionEpochOf(accountId);
  if (cag) {
    const verilis = sessionUser.iat ? sessionUser.iat * 1000 : 0;
    const sinir = Date.parse(cag);
    if (!Number.isNaN(sinir) && verilis < sinir) return { ok: false, status: 401 };
  }

  const isFounder = sessionUser.isFounder;

  if (!isFounder) {
    /*
     * ÜYELİK HER İSTEKTE YENİDEN SORULUYOR — jetondaki iddiaya güvenilmiyor.
     *
     * Üyenin rolü ve varlığı eskiden YALNIZ jetondan/çerezden geliyordu ve
     * ikisi de geri çağrılamıyor. Sonuç üç ayrı arızaydı:
     *
     *  · Ağaçtan ÇIKARILAN üye 30 güne kadar (mobilde 60) okumaya devam
     *    ediyordu. "Üyeyi çıkar" düğmesi bir yetkiyi değil, yalnız gelecekteki
     *    girişleri kapatıyordu.
     *  · Rolü DÜŞÜRÜLEN üye eski rolüyle yazmaya devam ediyordu.
     *  · `memberId` taşımayan eski oturumlarda `authorId`, `accountId`e —
     *    yani AĞACIN kimliğine — düşüyordu ve `visibleTo` o oturumu kurucu
     *    sanıp kurucunun önerilerini gösteriyor, geri çekmesine izin
     *    veriyordu.
     *
     * Artık üye kaydı depodan okunuyor: yoksa 401, varsa rol ve yazar
     * kimliği KAYITTAN geliyor. `memberId`siz oturum da kaydı bulamadığı
     * için 401 alıyor ve yeniden girmek zorunda kalıyor — o oturumların
     * taşıyabileceği tek doğru davranış bu.
     *
     * Bedeli istek başına bir erişim dosyası okuması; `getTreeAccess` kendi
     * içinde bunu tek çağrıya indiriyor ve üye sayısı küçük.
     */
    const uyeId = sessionUser.memberId;
    if (!uyeId) return { ok: false, status: 401 };
    let uye: { id: string; role: unknown } | undefined;
    try {
      const erisim = await getTreeAccess(accountId);
      uye = erisim.members.find((m) => m.id === uyeId);
    } catch {
      /*
       * Depo okunamadı. REDDEDİLMİYOR: kendi altyapı hatamız yüzünden
       * üyeyi uygulamasından etmeyiz — `isAccountDeleted`teki aynı karar.
       * Jetondaki role düşülüyor; bu, arıza penceresinde eski davranış.
       */
      return {
        ok: true, accountId, treeId: accountId,
        role: sessionUser.role, isFounder: false, authorId: uyeId,
      };
    }
    if (!uye) return { ok: false, status: 401 };
    return {
      ok: true,
      accountId,
      treeId: accountId,
      /* Rol KAYITTAN: düşürülen yetki bir sonraki istekte geçerli olsun. */
      role: normalizeRole(uye.role),
      isFounder: false,
      authorId: uye.id,
    };
  }

  const homeRole = sessionUser.role;
  // Kurucuda üye kimliği yok; ağacın kimliği onu temsil eder.
  const authorId = sessionUser.memberId ?? accountId;

  // Aktif ağaç seçimi: mobil `x-tree-id` başlığı, yoksa web çerezi.
  const h = await headers();
  const cookieVal = h.get(ACTIVE_TREE_HEADER)?.trim() || (await cookies()).get(ACTIVE_TREE_COOKIE)?.value;
  if (cookieVal && cookieVal !== accountId) {
    /*
     * KAYIT OKUNAMAZSA ANA AĞACA DÜŞÜLÜYOR, HATA VERİLMİYOR.
     *
     * `readRegistry` artık okuma arızasında fırlatıyor (yetim ağaç
     * bırakmamak için, `lib/trees.ts`) ve bu çağrı `resolveActiveTree`in
     * içinde: sarmalanmasaydı geçici bir depo arızası BÜTÜN API'yi 500'e
     * çevirirdi — düzeltmenin kendisi, düzelttiği arızadan ağır bir hasar
     * verirdi.
     *
     * Düşülen yer güvenli yön: kullanıcı seçtiği ağaç yerine KENDİ ana
     * ağacını görüyor. Bu bir DARALTMA — hiçbir zaman erişemeyeceği bir
     * ağacı açmıyor.
     */
    let owned: string[] = [];
    try {
      owned = await accessibleTreeIds(accountId);
    } catch (e) {
      console.warn(`[ağaç-bağlamı] kayıt okunamadı (${accountId}):`, (e as Error).message);
    }
    if (hasTreeAccess(accountId, cookieVal, owned)) {
      return { ok: true, accountId, treeId: cookieVal, role: "yonetici", isFounder: true, authorId };
    }
  }
  return { ok: true, accountId, treeId: accountId, role: homeRole, isFounder: true, authorId };
}
