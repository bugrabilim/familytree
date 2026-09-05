import { NextRequest, NextResponse } from "next/server";
import { hash, compare } from "bcryptjs";
import {
  applyRecoveryReset,
  findUserByFamilyName,
  findUserByRecoveryIndex,
  issueRecoveryCode,
} from "@/lib/users";
import { planRecoveryLookup } from "@/lib/recovery-code";
import { updateAccountAuthPassword } from "@/lib/auth-users";
import { rateLimitShared } from "@/lib/rate-limit";

/**
 * KURTARMA KODUYLA ŞİFRE SIFIRLAMA.
 *
 * body: { recoveryCode, newPassword, familyName? }
 *
 * ## Ağaç adı neden artık zorunlu değil
 *
 * Kod benzersiz; hesabı tek başına gösterebiliyor. Ad sorulmasının sebebi hiç
 * ürün değildi: `recoveryCodeHash` bcrypt olduğu için satır ARANAMIYOR, ancak
 * KARŞILAŞTIRILABİLİYORDU — yani önce adla satır bulunuyordu. Artık
 * `recoveryCodeIndex` (normalleştirilmiş kodun SHA-256'sı) satırı buluyor,
 * bcrypt ise asıl doğrulamayı yapmaya DEVAM EDİYOR.
 *
 * Ad yine de kabul ediliyor: indeksi olmayan ESKİ hesapların tek bulunma yolu
 * o (kodun düz hâli kimsede olmadığı için indeks geriye dönük doldurulamaz).
 * Ad verilmemişse ve indeks tutmuyorsa istek reddedilir.
 *
 * ## Ağaç adı bir faktör DEĞİLDİ
 *
 * Herkese açık bir soyad; ikinci bir kimlik doğrulama etkeni saymak yanlış
 * olurdu. Kaldırılan şey bir güvenlik katmanı değil, sürtünme. Karşılığında
 * sınırlar sıkılaştı: IP başına sınırın yanına KOD BAŞINA ikinci bir sınır
 * eklendi.
 */

function ipOf(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "bilinmiyor"
  );
}

/**
 * TEK HATA MESAJI. "Böyle bir hesap yok" ile "kod yanlış" ayrılsaydı, uç
 * hangi ağaç adlarının kayıtlı olduğunu sayan bir numaralandırma aracına
 * dönerdi. Biçimsiz kod da aynı yanıtı alır.
 */
const HATA = "Kurtarma kodu hatalı. (Eski bir hesapsa ağaç adını da yazmayı dene.)";
const reddet = () => NextResponse.json({ error: HATA }, { status: 401 });

const cokFazla = (retryAfter: number) =>
  NextResponse.json(
    { error: "Çok fazla deneme. Lütfen biraz bekleyin." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  );

export async function POST(req: NextRequest) {
  /*
   * SINIRLI. Oturumsuz bir uç ve her çağrı bir bcrypt doğrulaması demek
   * (sunucu işlemcisi). Kurtarma kodu 80 bit olduğu için tahmin edilemez ama
   * sınırsız deneme hem maliyet hem de aşağıdaki numaralandırma sorununu
   * ölçeklendiriyordu.
   */
  const rl = await rateLimitShared(`reset:${ipOf(req)}`, { capacity: 8, refillPerSec: 0.02 });
  if (!rl.ok) return cokFazla(rl.retryAfter);
  try {
    const { familyName, recoveryCode, newPassword } = await req.json();

    if (!recoveryCode || !newPassword) {
      return NextResponse.json(
        { error: "Kurtarma kodu ve yeni şifre zorunludur." },
        { status: 400 }
      );
    }

    if (typeof newPassword !== "string" || newPassword.length < 6) {
      return NextResponse.json({ error: "Şifre en az 6 karakter olmalı." }, { status: 400 });
    }

    const plan = planRecoveryLookup(familyName, recoveryCode);
    if (plan.kind === "reddet") return reddet();

    /*
     * İKİNCİ SINIR — KOD BAŞINA, ve ne yaptığı konusunda dürüst olalım:
     * bu sınır AYNI kodun tekrar tekrar denenmesini kapatıyor, farklı kodlar
     * denenmesini DEĞİL (her kod ayrı bir anahtara düşer). Yani IP havuzu
     * değiştiren bir saldırganın kaba kuvvetini durdurmuyor; onu durduran şey
     * kodun 80 bit olması.
     *
     * Kapattığı gerçek durum şu: bir yerden SIZMIŞ ya da omuz üstünden
     * görülmüş bir kodun ısrarla denenmesi — özellikle IP değiştirerek.
     * Orada ilk kez bir tavan var.
     *
     * Hesap başına sınır bilerek KONMADI: hesabı bilen biri (ağaç adı herkese
     * açık) o hesabın sıfırlama yolunu istediği zaman kilitleyebilirdi.
     * Şifresini unutmuş kullanıcıyı dışarıda bırakmak, saldırganı
     * yavaşlatmaktan daha büyük bir zarar.
     *
     * Anahtar indeksin kısaltılmışı; indeks zaten hesap kaydında duruyor,
     * dolayısıyla anahtar yeni bir şey sızdırmıyor.
     */
    const rlKod = await rateLimitShared(`reset:kod:${plan.index.slice(0, 32)}`, {
      capacity: 5,
      refillPerSec: 0.01,
    });
    if (!rlKod.ok) return cokFazla(rlKod.retryAfter);

    /*
     * ÖNCE İNDEKS, sonra (ad verildiyse) eski yol. Sıra önemli: indeksi olan
     * hesaplar ada hiç ihtiyaç duymamalı.
     */
    let user = await findUserByRecoveryIndex(plan.index);
    if (!user && plan.familyName) user = await findUserByFamilyName(plan.familyName);
    if (!user || !user.recoveryCodeHash) return reddet();

    /*
     * ASIL DOĞRULAMA BURADA. İndeks yalnız satırı buldu; onunla yetinmek,
     * tuzsuz tek turlu SHA-256'yı kimlik doğrulama katmanı yapmak olurdu.
     * Birden çok aday deneniyor çünkü eski kayıtlar kodu ayraçlı hâliyle
     * hash'lemişti (`recoveryCodeCandidates`).
     */
    let gecerli = false;
    for (const aday of plan.codes) {
      if (await compare(aday, user.recoveryCodeHash)) {
        gecerli = true;
        break;
      }
    }
    if (!gecerli) return reddet();

    const newPasswordHash = await hash(newPassword, 12);

    /*
     * KOD YENİLENİYOR — üç sebep birden:
     *  1. Kullanılan kurtarma kodu düşmeli; kâğıttaki eski kod bir daha
     *     geçerli olmamalı (jetonlarda olduğu gibi tek kullanım).
     *  2. Düz kod yalnız BU AN elimizde; indeksi ancak şimdi yazabiliriz.
     *     Böylece eski hesaplar kullandıkça kendiliğinden yeni düzene geçer.
     *  3. Yeni kod benzersizlik denetiminden geçiyor; eski kodun indeksini
     *     olduğu gibi yazsaydık çakışma ihtimalini denetlemeden devralırdık.
     *
     * Üretim başarısız olursa (depo okunamadı, çakışma) sıfırlama İPTAL
     * EDİLMİYOR: kullanıcı şifresini alamadan kalmasın. O durumda eski kod
     * geçerli kalır — istenmeyen ama kilitlenmekten iyi bir sonuç.
     */
    let yeniKod: string | null = null;
    let kodYamasi: { recoveryCodeHash?: string; recoveryCodeIndex?: string } = {};
    try {
      const yeni = await issueRecoveryCode();
      yeniKod = yeni.code;
      kodYamasi = { recoveryCodeHash: yeni.hash, recoveryCodeIndex: yeni.index };
    } catch (e) {
      console.warn(`[kurtarma] yeni kod üretilemedi (${user.id}):`, (e as Error).message);
    }

    await applyRecoveryReset(user.id, { passwordHash: newPasswordHash, ...kodYamasi });

    // Faz 3c — Supabase Auth şifresini de senkronla (düz-metinle, en güvenilir
    // yol). Böylece sıfırlanmış ESKİ şifre Supabase üzerinden kabul edilemez.
    // Best-effort: hata sıfırlamayı bozmaz (bcrypt zaten güncellendi).
    try {
      await updateAccountAuthPassword(user.id, newPassword);
    } catch (e) {
      console.warn(`[3c] Supabase Auth şifre senkronu başarısız (${user.id}):`, (e as Error).message);
    }

    // `recoveryCode` yalnız yenileme başarılıysa dolu; arayüz null gelirse
    // kutuyu hiç göstermiyor (kullanıcıya var olmayan bir kod okutmayalım).
    return NextResponse.json({ success: true, recoveryCode: yeniKod });
  } catch (err) {
    console.error("Reset password error:", err);
    const message = err instanceof Error ? err.message : String(err);
    const isBlobAuth = message.includes("No blob credentials") || message.includes("BLOB_READ_WRITE_TOKEN");
    return NextResponse.json(
      {
        error: isBlobAuth
          ? "Depolama yapılandırması eksik (BLOB_READ_WRITE_TOKEN). Vercel proje ayarlarında Blob store bağlantısını kontrol edin."
          : `Sunucu hatası: ${message}`,
      },
      { status: 500 }
    );
  }
}
