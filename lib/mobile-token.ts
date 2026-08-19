import { SignJWT, jwtVerify } from "jose";
import type { TreeRole } from "@/types/user";

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
}

const AUD = "soyagaci-mobile";
function secret(): Uint8Array {
  return new TextEncoder().encode(process.env.AUTH_SECRET || "dev-insecure-secret-change-me");
}

export async function signMobileToken(c: MobileClaims): Promise<string> {
  return new SignJWT({ name: c.name, role: c.role, isFounder: c.isFounder, treeName: c.treeName })
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
      role: (payload.role as TreeRole) ?? "admin",
      isFounder: payload.isFounder !== false,
      treeName: typeof payload.treeName === "string" ? payload.treeName : undefined,
    };
  } catch {
    return null;
  }
}
