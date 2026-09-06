import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { createHash } from "node:crypto";
import { acceptInvite, findValidInvite } from "@/lib/members";
import { checkUsername, normalizeUsername, USERNAME_MAX, USERNAME_MIN } from "@/lib/username";
import { getUsersData } from "@/lib/users";
import { rateLimitShared } from "@/lib/rate-limit";

/**
 * Davetle katılma (herkese açık — oturum gerektirmez, jeton yetkiyi taşır).
 *
 * GET  ?token=… → davet geçerli mi + ağaç adı + rol (katılım sayfası için).
 * POST { token, displayName, password } → üye oluşturur, ağaç adını döner
 *       (istemci ardından ağaç adı + şifre ile giriş yapar).
 *
 * ## Neden oran sınırlı — jeton tek başına yetmiyor
 *
 * Jeton 192 bit, yani tahmin edilemez. Sınırın sebebi o değil: aşağıdaki
 * POST, şifre bu ağaçta ZATEN KULLANILIYORSA 409 dönüyor. Bu yanıt bir
 * bilgi sızdırıyor — geçerli bir davetiyesi olan biri, aday şifreleri
 * deneyerek öbür üyelerin şifresini yoklayabilir; bulursa ağaç adı + o
 * şifreyle o üyenin (belki yöneticinin) kimliğiyle giriş yapar.
 *
 * Sınır bunu ortadan kaldırmıyor, PAHALI kılıyor: jeton başına birkaç
 * deneme, dürüst kullanıcıya yeter, yoklamaya yetmez. Kalıcı çözüm 409'un
 * var olma sebebini kaldırmak, yani üye girişinin kimliği ŞİFREDEN
 * çözmemesi — bu bir kimlik modeli değişikliği ve ürün sahibinin kararı.
 */
async function treeNameOf(treeId: string): Promise<string | null> {
  const { users } = await getUsersData();
  return users.find((u) => u.id === treeId)?.familyName ?? null;
}

function ipOf(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "bilinmiyor"
  );
}

const cokFazla = (retryAfter: number) =>
  NextResponse.json(
    { error: "Çok fazla deneme. Lütfen biraz bekleyin." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  );

export async function GET(req: NextRequest) {
  const rl = await rateLimitShared(`join:oku:${ipOf(req)}`, { capacity: 20, refillPerSec: 0.1 });
  if (!rl.ok) return cokFazla(rl.retryAfter);
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const valid = await findValidInvite(token);
  if (!valid) return NextResponse.json({ valid: false }, { status: 404 });
  const treeName = await treeNameOf(valid.treeId);
  if (!treeName) return NextResponse.json({ valid: false }, { status: 404 });
  return NextResponse.json({ valid: true, treeName, role: valid.invite.role });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token : "";

  /*
   * İKİ KATMAN. IP sınırı kaba kuvveti dağıtmayı, JETON sınırı ise asıl
   * riski (şifre yoklaması) kapatıyor: yoklama tanımı gereği TEK bir
   * davetiyeyle yapılıyor, dolayısıyla sınırın jetona bağlı olması şart.
   * Anahtar jetonun özeti; ham jeton günlüğe/anahtara girmesin.
   */
  const rlIp = await rateLimitShared(`join:yaz:${ipOf(req)}`, { capacity: 10, refillPerSec: 0.02 });
  if (!rlIp.ok) return cokFazla(rlIp.retryAfter);
  if (token) {
    const anahtar = createHash("sha256").update(token).digest("hex").slice(0, 32);
    const rlJeton = await rateLimitShared(`join:jeton:${anahtar}`, { capacity: 5, refillPerSec: 0.005 });
    if (!rlJeton.ok) return cokFazla(rlJeton.retryAfter);
  }

  const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const username = normalizeUsername(body.username);

  if (displayName.length < 2)
    return NextResponse.json({ error: "Adınız en az 2 karakter olmalı." }, { status: 400 });
  if (password.length < 6)
    return NextResponse.json({ error: "Şifre en az 6 karakter olmalı." }, { status: 400 });
  /*
   * KULLANICI ADI ZORUNLU (madde 36) — yeni katılımlarda.
   *
   * İsteğe bağlı bırakılsaydı, adsız katılan her üye eski (şifreyle kimlik
   * çözen) yolda kalırdı ve düzeltmeye çalıştığımız belirsizlik yeni
   * kayıtlarla büyümeye devam ederdi. Alan `Member` tipinde opsiyonel
   * kalıyor, ama o yalnız ESKİ kayıtlar için.
   */
  if (!username)
    return NextResponse.json({ error: "Kullanıcı adı gerekli." }, { status: 400 });
  const gecerli = checkUsername(username);
  if (!gecerli.ok)
    return NextResponse.json(
      {
        error: {
          kisa: `Kullanıcı adı en az ${USERNAME_MIN} karakter olmalı.`,
          uzun: `Kullanıcı adı en fazla ${USERNAME_MAX} karakter olabilir.`,
          gecersiz: "Kullanıcı adında yalnız İngiliz harfleri, rakam, nokta, alt çizgi ve tire olabilir.",
          "basi-harf-degil": "Kullanıcı adı bir harfle başlamalı.",
        }[gecerli.fail],
      },
      { status: 400 }
    );

  const valid = await findValidInvite(token);
  if (!valid) return NextResponse.json({ error: "Davet geçersiz ya da süresi dolmuş." }, { status: 400 });

  const treeName = await treeNameOf(valid.treeId);
  if (!treeName) return NextResponse.json({ error: "Ağaç bulunamadı." }, { status: 404 });

  const passwordHash = await hash(password, 12);
  const result = await acceptInvite(token, displayName, passwordHash, password, username);
  if (!result) return NextResponse.json({ error: "Davet geçersiz ya da süresi dolmuş." }, { status: 400 });
  /*
   * Aynı ağaçta aynı şifre olamaz. Giriş formu üye seçtirmediği için kimlik
   * şifreye göre çözülüyor; iki üyenin aynı şifresi olsaydı biri ötekinin
   * kimliğiyle (ve ROLÜYLE) oturum açardı.
   */
  if ("error" in result)
    return NextResponse.json(
      {
        error:
          result.error === "ad-dolu"
            ? "Bu kullanıcı adı bu ağaçta kullanılıyor. Başka bir ad seçin."
            : "Bu şifre bu ağaçta kullanılıyor. Başka bir şifre seçin.",
      },
      { status: 409 }
    );

  return NextResponse.json({ treeName, role: result.member.role, username: result.member.username });
}
