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
  attachments?: Attachment[];
}

export default function InboxClient() {
  const [mails, setMails] = useState<Mail[] | null>(null);
  const [hata, setHata] = useState("");
  const [kimlik, setKimlik] = useState("");
  const [secili, setSecili] = useState<string>("");
  const [yanit, setYanit] = useState("");
  const [busy, setBusy] = useState(false);
  const [bilgi, setBilgi] = useState("");

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
      } catch (e) {
        if (alive) setHata((e as Error).message);
      }
    })();
    return () => { alive = false; };
  }, []);

  const tazele = async () => {
    const res = await fetch("/api/admin/inbox", { cache: "no-store" });
    if (res.ok) setMails(((await res.json()).mails as Mail[]) ?? []);
  };

  const ac = async (m: Mail) => {
    setSecili(m.id === secili ? "" : m.id);
    setYanit("");
    setBilgi("");
    if (!m.read) {
      await fetch("/api/admin/inbox", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: m.id, read: true }),
      });
      await tazele();
    }
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
              ) : (
                /*
                 * BOŞ GÖVDE AÇIKÇA SÖYLENİYOR. Boş bir alan göstermek,
                 * "kişi boş posta atmış" izlenimi verirdi; oysa sebep
                 * sağlayıcının bildiriminde gövdenin hiç bulunmaması.
                 * Yanlış izlenim, eksik bilgiden kötüdür.
                 */
                <p className="text-[11px] text-text-subtle leading-relaxed italic">
                  Bu bildirimde gövde metni gelmedi (yalnız üstbilgi ve konu).
                </p>
              )}

              {m.attachments && m.attachments.length > 0 && (
                <p className="text-[11px] text-text-subtle">
                  Ekler (indirilmiyor, yalnız adı kayıtlı):{" "}
                  {m.attachments.map((a) => a.name).join(", ")}
                </p>
              )}

              <div>
                <label className="text-xs font-medium block mb-1" htmlFor={`y-${m.id}`}>
                  Yanıt
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

              <div className="flex gap-2">
                <Button size="sm" onClick={() => gonder(m.id)} disabled={busy || !yanit.trim()}>
                  {busy ? "Gönderiliyor…" : "Yanıtla"}
                </Button>
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
