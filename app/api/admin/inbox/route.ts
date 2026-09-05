import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminAccount, isAdminConfigured } from "@/lib/admin";
import { isEmailConfigured, replyAddress, sendEmail } from "@/lib/email";
import { quoteForReply, replySubject, threadHeaders } from "@/lib/inbox";
import { deleteMail, findMail, markRead, markReplied, readInbox, setBody } from "@/lib/inbox-store";
import { fetchInboundBody } from "@/lib/resend-inbound";
import { renderEmail } from "@/lib/email-template";

export const dynamic = "force-dynamic";

/**
 * GELEN KUTUSU — yalnız site işletmecisi.
 *
 * `isFounder` BURADA YETMEZ ve kullanılmadı: bu depoda her kullanıcı kendi
 * ağacının kurucusu, yani `isFounder` "kaydolmuş herkes" demek. Onunla
 * korunsaydı, kaydolan herkes yabancıların bize yazdığı postaları okurdu.
 * Kapı `lib/admin.ts`te ve ortam değişkenine dayanıyor.
 */

const yetkisiz = () => NextResponse.json({ error: "Yetkisiz" }, { status: 403 });

async function guard() {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return { error: NextResponse.json({ error: "Yetkisiz" }, { status: 401 }) };
  if (!isAdminAccount(id)) return { error: yetkisiz(), accountId: id };
  return { accountId: id };
}

/**
 * Kutu. Yetkisiz kurucuya KENDİ hesap kimliğini söylüyoruz — yapılandırmayı
 * yapabilmesi için gereken tek bilgi bu ve kendi kimliği, kendisinden
 * saklanacak bir şey değil. Kutunun içeriği elbette gitmiyor.
 */
export async function GET() {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  if (!isAdminAccount(id))
    return NextResponse.json(
      { error: "Yetkisiz", yourAccountId: id, configured: isAdminConfigured() },
      { status: 403 }
    );
  return NextResponse.json({ mails: await readInbox(), emailReady: isEmailConfigured() });
}

/**
 * Okundu/okunmadı — ve gerekiyorsa GÖVDEYİ ÇEKME.
 *
 * İkisi aynı yerde çünkü aynı anda oluyor: kullanıcı postayı AÇIYOR. Ayrı
 * bir "gövdeyi çek" düğmesi koymak, kullanıcıya bizim iç sorunumuzu iş
 * olarak devretmek olurdu.
 *
 * Yeniden deneme burada olduğu için, API anahtarının izni sonradan
 * düzeltildiğinde eski postalar da açıldıkça tamamlanıyor — yeniden posta
 * göndermeye gerek yok.
 */
export async function PATCH(req: NextRequest) {
  const g = await guard();
  if ("error" in g) return g.error;
  const body = (await req.json().catch(() => ({}))) as { id?: unknown; read?: unknown };
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  const ok = await markRead(id, body.read !== false);
  if (!ok) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });

  const mail = await findMail(id);
  /*
   * "bulunamadi" YENİDEN DENENMİYOR: sağlayıcıda kayıt yok (saklama süresi
   * doldu) ve tekrar sormak her açılışta boşuna bir dış çağrı demek olurdu.
   * Öbür durumların hepsi düzeltilebilir, o yüzden denenmeye değer.
   */
  if (mail?.providerId && mail.bodyFetch && mail.bodyFetch !== "bulunamadi") {
    try {
      const r = await fetchInboundBody(mail.providerId);
      if (r.ok) await setBody(id, { text: r.text });
      else await setBody(id, { state: r.state });
    } catch {
      await setBody(id, { state: "hata" });
    }
  }

  return NextResponse.json({ ok: true, mail: await findMail(id) });
}

/** Yanıt gönder. */
export async function POST(req: NextRequest) {
  const g = await guard();
  if ("error" in g) return g.error;
  if (!isEmailConfigured())
    return NextResponse.json({ error: "E-posta yapılandırılmamış." }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { id?: unknown; text?: unknown };
  const id = typeof body.id === "string" ? body.id : "";
  const metin = typeof body.text === "string" ? body.text.trim() : "";
  if (!id || !metin) return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });

  const mail = await findMail(id);
  if (!mail) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });

  /*
   * Alıcı KAYITTAN alınıyor, istemciden değil. İstemci alıcı belirtebilseydi,
   * bu uç "işletmeci hesabından istediğim adrese posta at" aracına dönerdi —
   * yani doğrulanmış alan adımızdan istenmeyen posta göndermenin yolu.
   */
  const { html, text } = renderEmail({
    title: replySubject(mail.subject),
    intro: metin,
    /*
     * Özgün posta ALINTILANIYOR: araya günler girdiğinde yanıtı alan kişi
     * neyin yanıtı olduğunu görebilsin.
     */
    note: quoteForReply(mail).trim(),
    footer: "Bu ileti Soy Ağacı ekibinden gönderildi.",
  });

  const r = await sendEmail({
    to: mail.from,
    subject: replySubject(mail.subject),
    html,
    text,
    replyTo: replyAddress() ?? undefined,
    // Zincir başlıkları olmadan yanıt ayrı bir konu gibi düşer.
    headers: threadHeaders(mail),
  });
  if (!r.sent) return NextResponse.json({ error: "Gönderilemedi." }, { status: 502 });

  await markReplied(id, new Date().toISOString());
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const g = await guard();
  if ("error" in g) return g.error;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  const ok = await deleteMail(id);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Bulunamadı" }, { status: 404 });
}
