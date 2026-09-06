import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminAccount, isAdminConfigured } from "@/lib/admin";
import { isEmailConfigured, replyAddress, sendEmail } from "@/lib/email";
import { MAX_TEXT, quoteForReply, replySubject, threadHeaders } from "@/lib/inbox";
import {
  deleteMail,
  findMail,
  markRead,
  markReplied,
  readInbox,
  setBody,
  setForward,
} from "@/lib/inbox-store";
import { forwardConfigured, forwardIncoming } from "@/lib/inbox-forward-send";
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

/**
 * DÖRT YÖNTEMİN DE tek kapısı.
 *
 * `GET` bir süre kendi kopyasını taşıdı ve bu, kapının kendisini denetimsiz
 * bıraktı: kaynak-düzeyi kapı testi yalnız `PATCH`/`POST`/`DELETE`in
 * `guard()` çağırdığına bakıyordu, `GET`in kopyası ise `isAdminAccount`
 * geçtiği için ayrıca aranmıyordu. `GET` kutunun TAMAMINI döndüren yöntem,
 * yani korumasız kalması en pahalı olan. Kopya yok: kural tek yerde.
 *
 * Yetkisiz kurucuya KENDİ hesap kimliğini söylüyoruz — yapılandırmayı
 * yapabilmesi için gereken tek bilgi bu ve kendi kimliği, kendisinden
 * saklanacak bir şey değil. Kutunun içeriği elbette gitmiyor.
 */
async function guard() {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return { error: NextResponse.json({ error: "Yetkisiz" }, { status: 401 }) };
  if (!isAdminAccount(id))
    return {
      error: NextResponse.json(
        { error: "Yetkisiz", yourAccountId: id, configured: isAdminConfigured() },
        { status: 403 }
      ),
      accountId: id,
    };
  return { accountId: id };
}

/** Kutu. */
export async function GET() {
  const g = await guard();
  if ("error" in g) return g.error;
  try {
    return NextResponse.json({
      mails: await readInbox(),
      emailReady: isEmailConfigured(),
      forwardReady: forwardConfigured(),
    });
  } catch (e) {
    /*
     * Depo artık okuyamadığında BOŞ KUTU dönmüyor, fırlatıyor — çünkü boş
     * kutu dönmek hem yanlış bilgi hem de (yazma yolunda) veri kaybıydı.
     * Karşılığında bu hatayı burada okunur kılmak gerekiyor: yakalanmazsa
     * ekran ham bir sunucu hatası sayfasını JSON sanıp ayrıştırmaya
     * çalışırdı. "Kutu boş" ile "kutu okunamadı" ayrımı bu hattın en pahalı
     * belirsizliğiydi; ekranda da ayrı görünmeli.
     */
    console.error("[gelen-posta] kutu okunamadı:", (e as Error).message);
    return NextResponse.json(
      { error: "Gelen kutusu şu an okunamadı. Birazdan tekrar dene." },
      { status: 503 }
    );
  }
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
  const body = (await req.json().catch(() => ({}))) as {
    id?: unknown;
    read?: unknown;
    forward?: unknown;
  };
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

  /*
   * YENİDEN İLETME — yalnız AÇIKÇA istendiğinde.
   *
   * Gövde çekmenin tersine bu kendiliğinden denenmiyor: iletme bir posta
   * GÖNDERMEK demek, yani dışarıya çıkan bir eylem. Sayfayı açmanın yan
   * etkisi olarak posta göndermek, kullanıcının istemediği bir şeyi
   * habersiz yapmak olurdu — üstelik sayfayı açan kişi postayı zaten
   * okuyor. Düğme ekranda, kararı kullanıcı veriyor.
   */
  if (body.forward === true) {
    /*
     * Kayıt YENİDEN OKUNUYOR: yukarıdaki gövde çekme başarılı olduysa
     * elimizdeki `mail` artık eski ve iletilen posta GÖVDESİZ giderdi —
     * hem de tam gövdenin geldiği anda.
     */
    const guncel = await findMail(id);
    try {
      if (guncel) await setForward(id, await forwardIncoming(guncel));
    } catch (e) {
      console.warn("[gelen-posta] yeniden iletme hata verdi:", (e as Error).message);
      await setForward(id, "hata");
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
  /*
   * Kırpıp göndermek YOK: depo `MAX_TEXT` uyguluyor, dolayısıyla daha uzun
   * bir metin GÖNDERİLİR ama kaydın içinde eksik durur — kullanıcı ne
   * yazdığını sandığından farklı bir şey görür ve farkı hiç öğrenemez.
   * Reddetmek, sessizce ayrışan bir kayıttan iyidir.
   */
  if (metin.length > MAX_TEXT)
    return NextResponse.json(
      { error: `Yanıt çok uzun (en fazla ${MAX_TEXT} karakter).` },
      { status: 400 }
    );

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

  /*
   * Yanıt YALNIZ gönderim başarılıysa saklanıyor — yukarıdaki `r.sent`
   * denetiminden sonra. Gönderilmemiş bir metni "yanıtım" diye kaydetmek,
   * olmayan bir yazışmayı kayda geçirmek olurdu ve kullanıcı karşı tarafın
   * onu okuduğunu sanırdı.
   */
  const kaydedildi = await markReplied(id, new Date().toISOString(), metin);
  /*
   * Posta arada silinmiş olabilir. Gönderim GERÇEKLEŞTİ; sessiz kalmak,
   * kayıtta izi olmayan bir yanıt bırakmak olurdu.
   */
  if (!kaydedildi) console.warn(`[gelen-posta] yanıt gönderildi ama kayda yazılamadı — ${id}`);
  return NextResponse.json({ ok: true, mail: await findMail(id) });
}

export async function DELETE(req: NextRequest) {
  const g = await guard();
  if ("error" in g) return g.error;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  const ok = await deleteMail(id);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Bulunamadı" }, { status: 404 });
}
