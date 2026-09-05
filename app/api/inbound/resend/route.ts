import { NextRequest, NextResponse } from "next/server";
import { verifyWebhook } from "@/lib/webhook-signature";
import { parseInbound } from "@/lib/inbox";
import { storeMail } from "@/lib/inbox-store";

export const dynamic = "force-dynamic";

/**
 * GELEN POSTA WEBHOOK'U — `POST /api/inbound/resend`.
 *
 * Sağlayıcı (Resend) `bilgi@soylus.com`a gelen her postayı buraya iletiyor.
 * Uç OTURUMSUZ olmak ZORUNDA: posta sunucusu bize oturum açamaz. Bu yüzden
 * kimlik, isteğin İMZASINDA.
 *
 * ## İmza olmasaydı
 *
 * Adresi bilen herkes bize istediği "gelen posta"yı uydurabilirdi: sahte
 * gönderen, sahte içerik. Gelen kutusu bir yazma yüzeyine dönerdi ve orada
 * okunan hiçbir şeye güvenilemezdi. `lib/webhook-signature.ts` sırrı yoksa
 * KAPALI düşüyor.
 *
 * ## Neden her zaman 200 dönmüyoruz
 *
 * Ayrıştırılamayan yükte 200 dönüyoruz (sağlayıcı yeniden denemesin, çünkü
 * tekrar denemek aynı sonucu verir), ama İMZASIZ istekte 401: o bir hata
 * değil, reddedilmiş bir istek ve sessizce yutulması yanlış olurdu.
 * Saklama hatasında ise 500 — orada yeniden deneme İSTENİYOR, yoksa posta
 * sessizce kaybolur.
 */
export async function POST(req: NextRequest) {
  /*
   * HAM gövde okunuyor: imza, gövdenin BAYT BAYT kendisi üstünden
   * hesaplanıyor. `req.json()` ile ayrıştırıp yeniden metne çevirmek
   * (anahtar sırası, boşluk, unicode kaçışları) imzayı bozar ve doğrulama
   * HER ZAMAN başarısız olurdu — yani bütün gelen posta sessizce kaybolurdu.
   */
  const body = await req.text();

  const r = verifyWebhook(
    process.env.RESEND_WEBHOOK_SECRET,
    {
      id: req.headers.get("svix-id"),
      timestamp: req.headers.get("svix-timestamp"),
      signature: req.headers.get("svix-signature"),
    },
    body,
    new Date()
  );
  if (!r.ok) {
    console.warn(`[gelen-posta] imza reddedildi: ${r.error}`);
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ ok: true, skipped: "gecersiz-json" });
  }

  /*
   * Kimlik SAĞLAYICININ verdiği `svix-id`: aynı posta yeniden iletilirse
   * (sağlayıcı yeniden denemesi) `planStore` onu aynı kayıt olarak görüp
   * çoğaltmıyor. Kendi ürettiğimiz bir kimlik her denemede farklı olur ve
   * kutuda aynı posta üç kez görünürdü.
   */
  const id = req.headers.get("svix-id") ?? "";
  const mail = parseInbound(payload, id, new Date());
  if (!mail) return NextResponse.json({ ok: true, skipped: "ayristirilamadi" });

  try {
    await storeMail(mail);
  } catch (e) {
    console.error("[gelen-posta] saklanamadı:", (e as Error).message);
    return NextResponse.json({ error: "Saklanamadı" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
