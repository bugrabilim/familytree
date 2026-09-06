"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";

/**
 * Gelen kutusu ekranı.
 *
 * ## Gövde HER ZAMAN düz metin olarak çiziliyor
 *
 * `lib/inbox.ts` HTML'i hiç saklamıyor; burada da `dangerouslySetInnerHTML`
 * ya da başka bir çizim yolu YOK. İkisi birlikte, yabancının gönderdiği
 * içeriğin bu sayfada işaretleme olarak yorumlanmasını imkânsız kılıyor.
 * `whitespace-pre-wrap`, metnin satır yapısını korumak için yeterli.
 */

interface Attachment { name: string; size?: number }
interface Reply { text: string; at: string }

interface Mail {
  id: string;
  from: string;
  fromName?: string;
  to: string;
  subject: string;
  text: string;
  at: string;
  read?: boolean;
  repliedAt?: string;
  replies?: Reply[];
  attachments?: Attachment[];
  providerId?: string;
  /** Gövde çekilemediyse nedeni. Yokluğu "gövde elimizde" demek. */
  bodyFetch?: "bekliyor" | "yetki" | "bulunamadi" | "hata" | "yapilandirilmamis";
  /** Kendi adresine iletildi mi? Yokluğu "denenmedi" demek. */
  forward?: "gonderildi" | "kapali" | "dongu" | "hata";
}

/**
 * Gövde neden yok? Her durum için NE YAPILACAĞI yazıyor.
 *
 * "Gövde alınamadı" demek yetmez: kullanıcı ne yapacağını bilemez ve
 * bekler. Oysa en olası sebebin (anahtar izni) beklemekle geçmeyeceği
 * belli — çözüm adımı burada.
 */
const GOVDE_MESAJI: Record<string, string> = {
  yetki:
    "Gövde alınamadı: API anahtarının izni yetmiyor. Resend → API keys'ten “Full access” izinli yeni bir anahtar üret, Vercel'deki RESEND_API_KEY değerini onunla değiştir ve yeniden dağıt. Sonra bu postayı yeniden aç — gövde kendiliğinden gelir.",
  yapilandirilmamis: "Gövde alınamadı: RESEND_API_KEY tanımlı değil.",
  bulunamadi:
    "Gövde sağlayıcıda bulunamadı — saklama süresi dolmuş olabilir. Bu posta için geri getirilemez.",
  hata: "Gövde şu an alınamadı. Postayı kapatıp yeniden açtığında tekrar denenir.",
  bekliyor: "Gövde henüz alınmadı. Postayı kapatıp yeniden açtığında denenir.",
};

/**
 * İletmenin sonucu — her durum tek satırda.
 *
 * Bu satır olmasaydı iletme SESSİZ bir özellik olurdu: kullanıcı postayı
 * kendi kutusunda görmediğinde "gelmedi mi, iletilemedi mi?" sorusunu
 * yanıtlayamazdı.
 */
const ILETME_MESAJI: Record<string, string> = {
  gonderildi: "Kendi adresine iletildi.",
  kapali: "İletilmedi: INBOX_FORWARD_TO tanımlı değil.",
  dongu: "İletilmedi: gönderen zaten iletme adresi (döngü olurdu).",
  hata: "İletilemedi.",
};

export default function InboxClient() {
  const [mails, setMails] = useState<Mail[] | null>(null);
  const [hata, setHata] = useState("");
  const [kimlik, setKimlik] = useState("");
  const [secili, setSecili] = useState<string>("");
  const [yanit, setYanit] = useState("");
  const [busy, setBusy] = useState(false);
  const [bilgi, setBilgi] = useState("");
  const [iletmeAcik, setIletmeAcik] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/admin/inbox", { cache: "no-store" });
        const d = await res.json();
        if (!alive) return;
        if (!res.ok) {
          /*
           * Yetkisiz kurucuya KENDİ hesap kimliği gösteriliyor: yapılandırmayı
           * yapabilmesi için gereken tek bilgi bu. Yoksa "yetkiniz yok" deyip
           * kimliği bulmanın yolunu söylememek, çıkmaz sokak olurdu.
           */
          if (d?.yourAccountId) setKimlik(d.yourAccountId as string);
          throw new Error(d?.error ?? "Yüklenemedi.");
        }
        setMails(d.mails as Mail[]);
        setIletmeAcik(d.forwardReady !== false);
      } catch (e) {
        if (alive) setHata((e as Error).message);
      }
    })();
    return () => { alive = false; };
  }, []);

  const tazele = async () => {
    const res = await fetch("/api/admin/inbox", { cache: "no-store" });
    if (!res.ok) return;
    const d = await res.json();
    setMails((d.mails as Mail[]) ?? []);
    setIletmeAcik(d.forwardReady !== false);
  };

  /**
   * Yeniden iletme — posta GÖNDEREN bir eylem, o yüzden düğmeye bağlı.
   * Sayfayı açmanın yan etkisi olsaydı kullanıcı istemediği bir gönderimi
   * habersiz yapmış olurdu.
   */
  const ilet = async (id: string) => {
    setBusy(true);
    setBilgi("");
    setHata("");
    try {
      const res = await fetch("/api/admin/inbox", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, read: true, forward: true }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error ?? "İletilemedi.");
      const durum = (d.mail as Mail | null)?.forward;
      setBilgi(durum === "gonderildi" ? "İletildi." : (ILETME_MESAJI[durum ?? "hata"] ?? "İletilemedi."));
      await tazele();
    } catch (e) {
      setHata((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const ac = async (m: Mail) => {
    const acilan = m.id === secili ? "" : m.id;
    setSecili(acilan);
    setYanit("");
    setBilgi("");
    if (!acilan) return;
    /*
     * Açılışta HER ZAMAN çağrılıyor, yalnız okunmamışlarda değil: bu çağrı
     * aynı zamanda eksik gövdeyi yeniden deniyor. Yalnız okunmamışlara
     * bağlasaydık, bir kez açılmış ve gövdesi alınamamış posta bir daha
     * asla tamamlanmazdı.
     */
    await fetch("/api/admin/inbox", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: m.id, read: true }),
    });
    await tazele();
  };

  const gonder = async (id: string) => {
    setBusy(true);
    setBilgi("");
    setHata("");
    try {
      const res = await fetch("/api/admin/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, text: yanit }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error ?? "Gönderilemedi.");
      setYanit("");
      setBilgi("Yanıt gönderildi.");
      await tazele();
    } catch (e) {
      setHata((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const sil = async (id: string) => {
    await fetch(`/api/admin/inbox?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    setSecili("");
    await tazele();
  };

  if (hata) {
    return (
      <main className="max-w-2xl mx-auto p-6 space-y-3">
        <h1 className="text-lg font-medium text-text">Gelen posta</h1>
        <p className="text-sm text-danger bg-danger-soft px-3 py-2.5 rounded-xl">{hata}</p>
        {kimlik && (
          <div className="rounded-xl border border-border p-3 space-y-2">
            <p className="text-[11px] text-text-subtle leading-relaxed">
              Bu ekranı açmak için hesap kimliğini <code>ADMIN_ACCOUNT_IDS</code> ortam
              değişkenine ekle (Vercel → Settings → Environment Variables), sonra yeniden
              dağıt. Senin hesap kimliğin:
            </p>
            <code className="block text-[11px] break-all text-text">{kimlik}</code>
          </div>
        )}
      </main>
    );
  }

  if (!mails) return <main className="max-w-2xl mx-auto p-6"><p className="text-sm text-text-muted">Yükleniyor…</p></main>;

  return (
    <main className="max-w-2xl mx-auto p-6 space-y-4">
      <h1 className="text-lg font-medium text-text">
        Gelen posta
        {mails.some((m) => !m.read) && (
          <span className="ml-2 text-xs text-primary">
            · {mails.filter((m) => !m.read).length} okunmamış
          </span>
        )}
      </h1>

      {/*
        İLETME KAPALIYSA SÖYLENİYOR. Kapalıyken bu sayfa "her gün açılması
        gereken" bir yere dönüşüyor ve o yüzden okunmuyor — açık olması asıl
        hâl, kapalı olması bildirilmesi gereken durum.
      */}
      {!iletmeAcik && (
        <p className="text-[11px] text-text-subtle leading-relaxed border border-border rounded-xl px-3 py-2.5">
          Gelen postalar kendi adresine iletilmiyor. Vercel → Settings →
          Environment Variables bölümüne <code>INBOX_FORWARD_TO</code> ekle (kendi e-posta
          adresin; virgülle birden fazla yazabilirsin) ve yeniden dağıt. Sonra bu
          sayfayı açmak zorunda kalmazsın.
        </p>
      )}

      {mails.length === 0 && <p className="text-sm text-text-muted">Kutu boş.</p>}

      {mails.map((m) => (
        <article key={m.id} className="rounded-xl border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => ac(m)}
            className="w-full text-left px-3.5 py-2.5 bg-surface-2 hover:bg-surface-3 transition-colors"
          >
            <span className={`block text-sm ${m.read ? "text-text-muted" : "text-text font-medium"}`}>
              {m.subject}
            </span>
            <span className="block text-[11px] text-text-subtle">
              {m.fromName ? `${m.fromName} · ` : ""}{m.from} · {m.at.slice(0, 16).replace("T", " ")}
              {m.repliedAt ? " · ✓ yanıtlandı" : ""}
            </span>
          </button>

          {secili === m.id && (
            <div className="p-3.5 bg-surface space-y-3">
              {/* Düz metin — bilerek. Bkz. dosya başındaki not. */}
              {m.text.trim() ? (
                <p className="text-sm text-text leading-relaxed whitespace-pre-wrap">{m.text}</p>
              ) : m.bodyFetch ? (
                /*
                 * GÖVDE YOKSA NEDENİ VE ÇÖZÜMÜ yazılıyor. Boş bir alan
                 * göstermek "kişi boş posta atmış" izlenimi verirdi; yalnız
                 * "alınamadı" demek de kullanıcıyı beklemeye iterdi. Yanlış
                 * izlenim, eksik bilgiden kötüdür.
                 */
                <p className="text-[11px] text-text-subtle leading-relaxed border border-border rounded-xl px-3 py-2.5">
                  {GOVDE_MESAJI[m.bodyFetch] ?? GOVDE_MESAJI.hata}
                </p>
              ) : (
                <p className="text-[11px] text-text-subtle leading-relaxed italic">
                  Bu posta boş — gönderen metin yazmamış.
                </p>
              )}

              {m.attachments && m.attachments.length > 0 && (
                <p className="text-[11px] text-text-subtle">
                  Ekler (indirilmiyor, yalnız adı kayıtlı):{" "}
                  {m.attachments.map((a) => a.name).join(", ")}
                </p>
              )}

              {/*
                GÖNDERİLMİŞ YANITLAR. Yalnız "yanıtlandı" damgası göstermek,
                üç gün sonraki "ben buna ne demiştim?" sorusunu yanıtsız
                bırakmak olurdu.
              */}
              {m.replies && m.replies.length > 0 && (
                <div className="space-y-2 border-l-2 border-border pl-3">
                  {m.replies.map((y, i) => (
                    <div key={`${m.id}-y-${i}`}>
                      <p className="text-[11px] text-text-subtle">
                        Yanıtın · {y.at.slice(0, 16).replace("T", " ")}
                      </p>
                      <p className="text-sm text-text-muted leading-relaxed whitespace-pre-wrap">
                        {y.text}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <label className="text-xs font-medium block mb-1" htmlFor={`y-${m.id}`}>
                  {m.replies && m.replies.length > 0 ? "Yeni yanıt" : "Yanıt"}
                </label>
                <textarea
                  id={`y-${m.id}`}
                  className="w-full text-sm px-3 py-2 rounded-xl bg-surface border border-border h-32 resize-none leading-relaxed"
                  value={yanit}
                  onChange={(e) => setYanit(e.target.value)}
                  placeholder="Yanıtını yaz…"
                />
                <p className="text-[11px] text-text-subtle mt-1">
                  {m.from} adresine, {m.subject} konusunun yanıtı olarak gider.
                </p>
              </div>

              {/* İletme durumu: iletildiyse damga, iletilmediyse sebebi. */}
              <p className="text-[11px] text-text-subtle">
                {m.forward
                  ? ILETME_MESAJI[m.forward] ?? ILETME_MESAJI.hata
                  : "Bu posta iletilmedi (iletme eklenmeden önce gelmiş)."}
              </p>

              <div className="flex gap-2 flex-wrap">
                <Button size="sm" onClick={() => gonder(m.id)} disabled={busy || !yanit.trim()}>
                  {busy ? "Gönderiliyor…" : "Yanıtla"}
                </Button>
                {/*
                  Yeniden iletme YALNIZ işe yarayacağı durumlarda görünüyor:
                  "gonderildi" zaten iletilmiş, "dongu" tekrar denense de aynı
                  sonucu verir. İşe yaramayacak bir düğme, kullanıcıyı boşuna
                  denemeye çağırmak olurdu.
                */}
                {iletmeAcik && m.forward !== "gonderildi" && m.forward !== "dongu" && (
                  <Button size="sm" variant="secondary" onClick={() => ilet(m.id)} disabled={busy}>
                    Kendime ilet
                  </Button>
                )}
                <Button size="sm" variant="secondary" onClick={() => sil(m.id)} disabled={busy}>
                  Sil
                </Button>
              </div>

              {bilgi && <p className="text-[11px] text-text-subtle">{bilgi}</p>}
            </div>
          )}
        </article>
      ))}
    </main>
  );
}
