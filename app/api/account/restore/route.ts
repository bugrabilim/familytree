import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { compare } from "bcryptjs";
import { findUserByFamilyName } from "@/lib/users";
import { verifyFounderPassword } from "@/lib/credentials";
import { restoreAccount } from "@/lib/account-lifecycle";
import { graceInfo, isSoftDeleted } from "@/lib/retention";
import { rateLimitShared } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * SİLİNMEKTE OLAN HESABI GERİ GETİR — `POST /api/account/restore`
 * { familyName, password }.
 *
 * ## Neden OTURUMSUZ
 *
 * Bekleme süresindeki hesapla GİRİŞ YAPILAMIYOR (`lib/credentials.ts`) —
 * "sildim" diyen birinin uygulamayı kullanmaya devam etmesi silme sayılmaz.
 * Ama o zaman geri almanın da oturumu olamaz: kullanıcı elinde yalnız ağaç
 * adı ve şifresiyle geliyor. Kimlik bu yüzden doğrudan şifreyle kanıtlanıyor,
 * girişin kendisi açılmadan.
 *
 * ## Savunma
 *
 * Kimlik yoksa savunma SAYIDA olmak zorunda; üstelik bu bir şifre deneme
 * yüzeyi. İki kova var: IP başına (bir kaynağın toplam denemesi) ve AĞAÇ ADI
 * başına (tek bir hesabı hedefleyen deneme, IP değiştirse de sayılsın).
 *
 * Yanıtlar AYRIM YAPMIYOR: "böyle hesap yok", "hesap zaten canlı" ve "şifre
 * yanlış" aynı 400'ü döner. Ayrılsaydı bu uç, hangi aile adlarının kayıtlı
 * olduğunu (ve hangilerinin silinmekte olduğunu) sormanın aracı olurdu.
 *
 * ## Aynı yanıt yetmiyor — SÜRE de aynı olmalı
 *
 * Metin ayrımı kapatılmıştı ama zamanlama açıktı: hesap yoksa uç anında
 * dönüyor, varsa bcrypt karşılaştırması çalışıyor (~100 ms). Aradaki fark
 * ölçülebilir ve tam da gizlemeye çalıştığımız şeyi söylüyor — "bu aile
 * adında silinmekte olan bir hesap var". Bu yüzden hesap bulunamadığında da
 * SAHTE bir karşılaştırma koşuluyor: iki yol da aynı bedeli ödüyor.
 */

function ipOf(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "bilinmiyor"
  );
}

const RET = () => NextResponse.json({ error: "Ağaç adı ya da şifre hatalı." }, { status: 400 });

/*
 * Gerçek bir bcrypt özeti (parolası hiçbir yerde kullanılmıyor) — yalnız
 * karşılaştırmanın MALİYETİNİ ödemek için. Ucuz bir sabit gecikme yerine
 * gerçek bir `compare` çağrısı: maliyet, korumaya çalıştığımız yolun
 * maliyetiyle aynı algoritmadan gelmeli, yoksa parametreler değiştiğinde
 * (cost faktörü) taklit geride kalır.
 */
const SAHTE_OZET = "$2b$12$C6UzMDM.H6dfI/f/IKcEe.CjR7SD.eaVFQBKQfxYBQAaVIL9L1Cbe";

/** Hesap bulunmasa da karşılaştırma bedelini öde (zamanlama sızıntısı). */
async function bedeliOde(password: string): Promise<void> {
  try {
    await compare(password || "x", SAHTE_OZET);
  } catch {
    /* bedel ödenemezse de akış değişmiyor */
  }
}

export async function POST(req: NextRequest) {
  const rlIp = await rateLimitShared(`account:restore:ip:${ipOf(req)}`, {
    capacity: 10,
    refillPerSec: 0.02,
  });
  if (!rlIp.ok)
    return NextResponse.json(
      { error: "Çok fazla deneme. Lütfen biraz bekleyin." },
      { status: 429, headers: { "Retry-After": String(rlIp.retryAfter) } }
    );

  const body = await req.json().catch(() => ({}));
  const familyName = typeof body.familyName === "string" ? body.familyName.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!familyName || !password) return RET();

  // Ad küçük harfe indirilip özetleniyor: kova anahtarında ham aile adı
  // taşımanın (günlüklere düşen) bir faydası yok.
  const adAnahtari = createHash("sha256").update(familyName.toLowerCase()).digest("hex").slice(0, 32);
  const rlAd = await rateLimitShared(`account:restore:ad:${adAnahtari}`, {
    capacity: 5,
    refillPerSec: 0.005,
  });
  if (!rlAd.ok)
    return NextResponse.json(
      { error: "Çok fazla deneme. Lütfen biraz bekleyin." },
      { status: 429, headers: { "Retry-After": String(rlAd.retryAfter) } }
    );

  const user = await findUserByFamilyName(familyName);
  if (!user || !isSoftDeleted(user)) {
    // Hesap yok ya da zaten canlı — yine de bcrypt bedelini öde.
    await bedeliOde(password);
    return RET();
  }
  if (!(await verifyFounderPassword(user, password))) return RET();

  const bilgi = graceInfo(user.deletedAt!);
  const r = await restoreAccount(user.id);
  if (!r.ok) return RET();

  const govde = { ok: true, restoredFrom: bilgi.deletedAt };
  // 207: hesap geri geldi ama bir ağacın erişim dosyasındaki damga
  // kaldırılamadı → o ağacın paylaşım bağlantıları kapalı kalmış olabilir.
  if (r.failed.length > 0) return NextResponse.json({ ...govde, failed: r.failed }, { status: 207 });
  return NextResponse.json(govde);
}
