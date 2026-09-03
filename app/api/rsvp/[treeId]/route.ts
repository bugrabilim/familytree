import { NextRequest, NextResponse } from "next/server";
import { addRsvp, findByToken } from "@/lib/gathering-store";
import { publicGathering } from "@/lib/gathering";
import { rateLimitShared } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * ANONİM katılım bildirimi — `/api/rsvp/<treeId>?token=<jeton>`.
 *
 * Bu depodaki tek anonim YAZMA ucu. Oturum yok, kimlik yok; bağlantıyı alan
 * herkes yazabilir. Bu bilinçli: ailenin bir kısmı uygulamada üye değil ve
 * "geliyorum" demek için hesap açmaları beklenemez.
 *
 * ## Katmanlar
 *
 * 1. **Oran sınırı** — IP başına, paylaşımlı (K4/33). Kimliksiz bir uçta
 *    örnek-içi sınır neredeyse hiçbir şey demek olurdu.
 * 2. **Jeton** — tahmin edilemez (18 bayt). Kimlik doğrulaması olmadığı
 *    için jetonun kendisi tek kapı.
 * 3. **`rsvpOpen`** — geçerli jeton, KAPALI bir etkinliğe yazma hakkı
 *    vermiyor. Ayrı bir kapı: biri "hangi etkinlik", öteki "yazma açık mı".
 * 4. **İçerik** — `lib/gathering.ts`teki sınırlar, ad tekilliği ve bağlantı
 *    temizliği.
 *
 * GET yanıtı jetonu ve katılımcı listesini TAŞIMAZ (`publicGathering`):
 * kimin geldiği ailenin bilgisi, davetlinin değil.
 */

function ipOf(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "bilinmiyor"
  );
}

const MESAJ: Record<string, { text: string; status: number }> = {
  yok: { text: "Bu davet bağlantısı geçerli değil.", status: 404 },
  kapali: { text: "Bu etkinlik için katılım bildirimi kapalı.", status: 403 },
  gecersiz: { text: "Adınızı yazın ve bir yanıt seçin.", status: 400 },
  dolu: { text: "Katılım listesi dolu. Aileyle iletişime geçin.", status: 409 },
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ treeId: string }> }
) {
  const { treeId } = await params;
  const token = (req.nextUrl.searchParams.get("token") ?? "").trim();
  if (!token) return NextResponse.json({ error: "token gerekli" }, { status: 400 });

  // Okuma da sınırlı: geçersiz jetonla dövmek de bir Blob maliyeti.
  const rl = await rateLimitShared(`rsvp:get:${ipOf(req)}`, { capacity: 40, refillPerSec: 0.5 });
  if (!rl.ok)
    return NextResponse.json(
      { error: "Çok fazla istek." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );

  const g = await findByToken(treeId, decodeURIComponent(token));
  if (!g) return NextResponse.json({ error: MESAJ.yok.text }, { status: 404 });

  return NextResponse.json({ gathering: publicGathering(g) });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ treeId: string }> }
) {
  const { treeId } = await params;
  const token = (req.nextUrl.searchParams.get("token") ?? "").trim();
  if (!token) return NextResponse.json({ error: "token gerekli" }, { status: 400 });

  /*
   * Yazma sınırı okumadan DAHA SIKI. Bir davetli bir kez yazar, belki bir
   * kez fikrini değiştirir; dakikada onlarca yazma insan davranışı değil.
   */
  const rl = await rateLimitShared(`rsvp:post:${ipOf(req)}`, { capacity: 8, refillPerSec: 0.05 });
  if (!rl.ok)
    return NextResponse.json(
      { error: "Çok fazla istek. Lütfen biraz bekleyin." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }

  const res = await addRsvp(treeId, decodeURIComponent(token), body);
  if ("error" in res) {
    const m = MESAJ[res.error] ?? MESAJ.gecersiz;
    return NextResponse.json({ error: m.text }, { status: m.status });
  }

  /*
   * Yanıtta yalnız KENDİ kaydı ve özet dönüyor; başkalarının adları değil.
   * Davetli kendi yazdığını görsün yeter — listenin tamamı ailenin.
   */
  const g = await findByToken(treeId, decodeURIComponent(token));
  return NextResponse.json({
    rsvp: res.rsvp,
    ...(g ? { gathering: publicGathering(g) } : {}),
  });
}
