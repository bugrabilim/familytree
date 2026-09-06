import { SignJWT, jwtVerify } from "jose";
/*
 * GÖRELİ YOL — bilerek. Bu dosyanın birim testi var ve testler
 * `--experimental-strip-types` ile koşuyor: `@/…` bir ÇALIŞMA ZAMANI
 * içe aktarımı olduğunda çözümlenemiyor (tip-only olsaydı sorun yoktu,
 * o zaten siliniyor). `lib/roles.ts` de aynı sebeple göreli.
 */
import { normalizeRole, type TreeRole } from "../types/user.ts";

/**
 * Native mobil uygulama için jeton (JWT) tabanlı kimlik. Web tarafı NextAuth
 * çerezi kullanır; mobilde çerez yerine bu imzalı jeton `Authorization: Bearer`
 * başlığıyla taşınır. Aynı `AUTH_SECRET` ile imzalanır (HS256), 60 gün geçerli.
 */
export interface MobileClaims {
  sub: string; // hesap kimliği (accountId)
  name?: string;
  role: TreeRole;
  isFounder: boolean;
  treeName?: string;
  /**
   * Davetli ÜYENİN kendi kimliği — katkı akışının yazarı.
   *
   * `sub` "hangi ağaç" sorusunun yanıtı ve bir ağaçtaki herkes için aynı;
   * bu alan "kim". Web oturumundaki `memberId` ile aynı iş. Mobilde de
   * taşınmazsa telefondan yapılan her düzenleme akışta "biri" kalırdı.
   */
  memberId?: string;
}

const AUD = "soyagaci-mobile";
function secret(): Uint8Array {
  /*
   * KAPALI DÜŞÜYOR. Burada eskiden yayımlanmış bir sabite düşülüyordu
   * (`|| "dev-insecure-secret-change-me"`). O sabit depoda yazılı olduğu için
   * `AUTH_SECRET` tanımsızken HERKES istediği hesap kimliği için geçerli bir
   * Bearer jetonu imzalayabilirdi — `proxy.ts` Bearer taşıyan `/api/*`
   * isteklerini giriş duvarından geçiriyor, `resolveActiveTree` de jetondaki
   * `sub`u hesap kimliği sayıyor. Yani kiracı yalıtımının tamamı tek bir
   * ortam değişkeninin yokluğuna bağlıydı.
   *
   * Sessizce zayıf bir sırla devam etmektense hiç jeton üretmemek/kabul
   * etmemek doğru: mobil giriş çalışmaz ve bu görülür, ama kimse başkasının
   * ağacına giremez.
   */
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET tanımsız — mobil jeton imzalanamaz/doğrulanamaz.");
  return new TextEncoder().encode(secret);
}

/**
 * Jeton üretilebilir/doğrulanabilir durumda mı?
 *
 * `secret()` sır yokken FIRLATIYOR — doğru davranış, ama rotalar bunu İŞ
 * YAPMADAN ÖNCE sormalı. Kayıt ucu tam tersini yapsaydı hesabı yaratıp
 * sonra imzada patlar, kullanıcıya kurtarma kodunu HİÇ göstermeden 500
 * dönerdi: hesap var, sahibi giremiyor.
 */
export function isMobileTokenConfigured(): boolean {
  return !!process.env.AUTH_SECRET;
}

export async function signMobileToken(c: MobileClaims): Promise<string> {
  return new SignJWT({ name: c.name, role: c.role, isFounder: c.isFounder, treeName: c.treeName, memberId: c.memberId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(c.sub)
    .setAudience(AUD)
    .setIssuedAt()
    .setExpirationTime("60d")
    .sign(secret());
}

export async function verifyMobileToken(token: string): Promise<MobileClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { audience: AUD });
    if (!payload.sub) return null;
    return {
      sub: payload.sub,
      name: typeof payload.name === "string" ? payload.name : undefined,
      /*
       * Eski jetonlar ESKİ ROL ADINI taşıyor ("admin"/"editor"/…) ve
       * `normalizeRole` onları bugünkü kademeye çeviriyor. Rolsüz jeton
       * `yonetici` sayılıyor: o jetonlar ağaç şifresiyle giren kurucularındı.
       */
      role: payload.role === undefined ? "yonetici" : normalizeRole(payload.role),
      isFounder: payload.isFounder !== false,
      treeName: typeof payload.treeName === "string" ? payload.treeName : undefined,
      memberId: typeof payload.memberId === "string" ? payload.memberId : undefined,
    };
  } catch {
    return null;
  }
}
