"use client";

import { useEffect, useState } from "react";
import Button from "./ui/Button";
import { useT } from "@/lib/i18n";
import { mutationHeaders } from "@/lib/actions";

/**
 * AĞAÇTAKİ KİŞİNİN E-POSTA ADRESİ — çift onaylı (madde 47/48 uzantısı).
 *
 * ## Neden formun geri kalanından ayrı
 *
 * Adres, kişi kaydıyla birlikte GELMİYOR: `lib/privacy.ts` onu görüntü
 * katmanında koşulsuz siliyor, çünkü ağaç yükü bütün üyelere ve paylaşım
 * bağlantısını açan herkese gidiyor. Bu bileşen adresi kendi ucundan
 * (`/api/family/person/[id]/contact`) okuyup yine oraya yazıyor — yani adres
 * yalnız onu düzenleyebilen kişiye, yalnız bu bölüm açıldığında gidiyor.
 *
 * Kaydetmesi de ayrı: formun "Kaydet" düğmesine bağlanmadı. Bağlansaydı,
 * kişinin adını düzeltmek için formu kaydeden biri farkında olmadan adresi de
 * yeniden yazmış olurdu — ve adres değişikliği onayı sıfırlayan bir işlem.
 *
 * ## Ekranda ne yazıyor, neden
 *
 * "Kaydedince onay postası gider" ve "yanıt gelmezse hiçbir şey
 * gönderilmez" — ikisi de baştan söyleniyor. Kullanıcı burada BAŞKASININ
 * adresini giriyor; ne olacağını bilmeden girmemeli.
 */

type Onay = "bekliyor" | "onayli" | "red" | null;

interface Durum {
  contactEmail: string;
  contactConsent: Onay;
  contactAskedAt: string | null;
}

const BOS: Durum = { contactEmail: "", contactConsent: null, contactAskedAt: null };

export default function ContactSection({ personId }: { personId: string }) {
  const t = useT();
  const [durum, setDurum] = useState<Durum>(BOS);
  const [adres, setAdres] = useState("");
  const [yukleniyor, setYukleniyor] = useState(true);
  const [kaydediyor, setKaydediyor] = useState(false);
  const [bilgi, setBilgi] = useState("");
  const [hata, setHata] = useState("");

  useEffect(() => {
    let iptal = false;
    (async () => {
      try {
        const res = await fetch(`/api/family/person/${personId}/contact`, { cache: "no-store" });
        if (!res.ok) return;
        const d = (await res.json()) as Partial<Durum>;
        if (iptal) return;
        setDurum({ ...BOS, ...d });
        setAdres(d.contactEmail ?? "");
      } catch {
        /* okunamadıysa boş gösterilir; yazma yine de çalışır */
      } finally {
        if (!iptal) setYukleniyor(false);
      }
    })();
    return () => { iptal = true; };
  }, [personId]);

  const kaydet = async () => {
    setKaydediyor(true);
    setBilgi("");
    setHata("");
    try {
      const res = await fetch(`/api/family/person/${personId}/contact`, {
        method: "PUT",
        // `mutationHeaders`: sürüm başlığı olmadan iyimser kilit sessizce kapalı kalır.
        headers: mutationHeaders(),
        body: JSON.stringify({ contactEmail: adres.trim() }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) {
        setHata(d?.error ?? t("contact.failed"));
        return;
      }
      setDurum({ ...BOS, ...(d as Partial<Durum>) });
      setBilgi(adres.trim() ? t("contact.saved") : t("contact.cleared"));
    } catch {
      setHata(t("contact.failed"));
    } finally {
      setKaydediyor(false);
    }
  };

  /*
   * Durum rozetinin metni onayın KİMDE olduğunu söylüyor: "bekliyor" derken
   * bekleyen biziz, karar veren o kişi. Kullanıcı burada bir düğmeye basıp
   * onayı kendisi veremesin diye onay durumu salt okunur.
   */
  const rozet =
    durum.contactConsent === "onayli"
      ? { metin: t("contact.stateApproved"), sinif: "text-primary" }
      : durum.contactConsent === "red"
        ? { metin: t("contact.stateDeclined"), sinif: "text-text-muted" }
        : durum.contactConsent === "bekliyor"
          ? { metin: t("contact.statePending"), sinif: "text-text-subtle" }
          : null;

  const degisti = adres.trim() !== (durum.contactEmail ?? "").trim();

  return (
    <section className="space-y-2.5">
      <div>
        <label className="text-xs font-medium block mb-1" htmlFor={`contact-${personId}`}>
          {t("contact.label")}
        </label>
        <p className="text-[11px] text-text-subtle leading-snug mb-2">{t("contact.hint")}</p>
        <input
          id={`contact-${personId}`}
          type="email"
          className="w-full text-sm px-3 py-2 rounded-xl bg-surface border border-border"
          value={adres}
          disabled={yukleniyor}
          placeholder="ornek@eposta.com"
          onChange={(e) => setAdres(e.target.value)}
        />
      </div>

      {rozet && !degisti && (
        <p className={`text-[11px] ${rozet.sinif}`}>{rozet.metin}</p>
      )}

      {/*
        Reddedene bir daha SORULMUYOR (`lib/contact-consent.ts`, `planAsk`).
        Bunu ekranda da söylüyoruz ki kullanıcı "kaydete bir daha basayım,
        belki gider" diye denemesin.
      */}
      {durum.contactConsent === "red" && !degisti && (
        <p className="text-[11px] text-text-muted leading-snug">{t("contact.declinedNote")}</p>
      )}

      <p className="text-[11px] text-text-subtle leading-snug">{t("contact.consentNote")}</p>

      <Button size="sm" onClick={kaydet} disabled={kaydediyor || yukleniyor || !degisti}>
        {kaydediyor ? t("contact.saving") : t("contact.save")}
      </Button>

      {bilgi && <p className="text-[11px] text-text-subtle">{bilgi}</p>}
      {hata && <p className="text-xs text-danger bg-danger-soft px-3 py-2 rounded-xl">{hata}</p>}
    </section>
  );
}
