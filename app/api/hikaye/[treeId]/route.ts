import { NextRequest, NextResponse } from "next/server";
import { getFamilyData } from "@/lib/blob";
import { findRequestByToken, submitContribution } from "@/lib/story-store";
import { publicRequest } from "@/lib/contribution";
import { fullName } from "@/lib/name";
import { rateLimitShared } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * HİKÂYE TALEBİ — GİRİŞSİZ yüzey (madde 49/50).
 *
 * `GET  /api/hikaye/<treeId>?token=…` → yalnız sorulan soru
 * `POST /api/hikaye/<treeId>` { token, authorName, text } → onay kuyruğuna
 *
 * Bağlantıyı alan akrabanın hesabı yok ve olması da beklenmiyor; kimlik
 * jetonda. Yanıt kişinin kaydına DOĞRUDAN yazılmıyor: girişsiz yazmanın
 * kayda doğrudan girmesi, ailenin en değerli şeyine kimliksiz yazma yetkisi
 * vermek olurdu. Kuyruk, "bu bağlantı kimin elinde" belirsizliğini kaydın
 * DIŞINDA tutuyor.
 */

function ipOf(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "bilinmiyor"
  );
}

/*
 * TEK RET MESAJI. "Jeton yok" ile "böyle bir ağaç yok" ayrılsaydı, uç
 * rastgele kimliklerle hangi ağaçların var olduğunu öğrenmek için bir sorgu
 * aracına dönerdi.
 */
const yok = () => NextResponse.json({ error: "Bu bağlantı geçerli değil." }, { status: 404 });

export async function GET(req: NextRequest, { params }: { params: Promise<{ treeId: string }> }) {
  const { treeId } = await params;
  const token = (new URL(req.url).searchParams.get("token") ?? "").trim();
  if (!token) return yok();

  const rl = await rateLimitShared(`hikaye:oku:${ipOf(req)}`, { capacity: 30, refillPerSec: 0.1 });
  if (!rl.ok)
    return NextResponse.json(
      { error: "Çok fazla deneme. Lütfen biraz bekleyin." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );

  const r = await findRequestByToken(treeId, token);
  if (!r) return yok();

  /*
   * Yalnız KİMİN hakkında sorulduğunun adı taşınıyor — `publicRequest` jetonu,
   * kişi kimliğini, son kullanmayı ve kuyruğun geri kalanını dışarıda
   * bırakıyor. Bağlantıyı alan kişi ağacın içine bir pencere görmemeli.
   */
  const { people } = await getFamilyData(treeId);
  const kisi = people.find((p) => p.id === r.personId);
  if (!kisi) return yok();
  return NextResponse.json(publicRequest(r, fullName(kisi)));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ treeId: string }> }) {
  const { treeId } = await params;

  /*
   * Sınırlı. Kimlik doğrulaması olmadığı için savunma boyut ve sayı
   * sınırlarında olmak zorunda; bu, `lib/contribution.ts`teki iki katmanlı
   * kotanın (jeton başına ve kuyruk tavanı) ÜSTÜNE biniyor.
   */
  const rl = await rateLimitShared(`hikaye:yaz:${ipOf(req)}`, { capacity: 10, refillPerSec: 0.02 });
  if (!rl.ok)
    return NextResponse.json(
      { error: "Çok fazla deneme. Lütfen biraz bekleyin." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );

  let body: { token?: unknown; authorName?: unknown; text?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token : "";
  const r = await submitContribution(treeId, token, {
    authorName: body.authorName,
    text: body.text,
  });
  if (r.ok) return NextResponse.json({ ok: true });

  /*
   * Hata mesajları AYRIŞIYOR ama yalnız yazanın kendi girdisi hakkında
   * ("ad gerekli", "metin uzun"). Talebin varlığı/geçerliliği hakkında olan
   * her şey tek mesaja düşüyor — yoksa jeton tahmini için bir sorgu aracı
   * olurdu.
   */
  const KENDI: Record<string, string> = {
    "ad-gerekli": "Adını yazar mısın?",
    "metin-gerekli": "Yanıt boş olamaz.",
    "metin-uzun": "Yanıt çok uzun.",
    "jeton-kotasi": "Bu bağlantıyla gönderilebilecek yanıt sayısı doldu.",
    "kuyruk-dolu": "Şu an yeni yanıt alınamıyor. Lütfen sonra tekrar deneyin.",
  };
  const mesaj = KENDI[r.error];
  if (mesaj) return NextResponse.json({ error: mesaj }, { status: 400 });
  return yok();
}
