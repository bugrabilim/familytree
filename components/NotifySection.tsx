"use client";

import { useEffect, useState } from "react";
import Button from "./ui/Button";
import { useT } from "@/lib/i18n";

/**
 * BİLDİRİM AYARLARI — adres + üç ayrı onay.
 *
 * ## Neden yeni
 *
 * `/api/account/notify` ucu ve günlük cron aylardır vardı ama onları çağıran
 * BİR EKRAN YOKTU: kullanıcı hiçbir yerden abone olamıyordu, dolayısıyla
 * günlük iş her gece koşup kimseye posta göndermiyordu. Özellik teknik olarak
 * "bitmiş", pratikte erişilemezdi.
 *
 * ## Üç onay neden ayrı
 *
 * Doğum günü hatırlatması, vefat anması ve aylık bülten aynı şey değil: biri
 * kutlama, öbürü yas, üçüncüsü özet. Tek onaya bağlamak, yas gününü
 * hatırlatan bir postayı istememiş birine göndermek olurdu.
 *
 * ## Adres silinince onaylar da düşer
 *
 * Kural sunucuda (`lib/users.ts` `updateUserNotify`); arayüz de onu
 * yansıtıyor. Bayraklar açık kalsaydı, kullanıcı sonradan yeni bir adres
 * yazdığında hiç onaylamadığı postaları almaya başlardı.
 */

interface Durum {
  notifyEmail: string;
  notifyReminders: boolean;
  notifyMemorials: boolean;
  notifyNewsletter: boolean;
}

const BOS: Durum = {
  notifyEmail: "",
  notifyReminders: false,
  notifyMemorials: false,
  notifyNewsletter: false,
};

export default function NotifySection() {
  const t = useT();
  const [durum, setDurum] = useState<Durum>(BOS);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [kaydediyor, setKaydediyor] = useState(false);
  const [bilgi, setBilgi] = useState("");
  const [hata, setHata] = useState("");

  useEffect(() => {
    let iptal = false;
    (async () => {
      try {
        const res = await fetch("/api/account/notify", { cache: "no-store" });
        if (!res.ok) return;
        const d = (await res.json()) as Partial<Durum>;
        if (!iptal) setDurum({ ...BOS, ...d });
      } catch {
        /* ayar okunamadıysa varsayılan kapalı gösterilir */
      } finally {
        if (!iptal) setYukleniyor(false);
      }
    })();
    return () => { iptal = true; };
  }, []);

  const kaydet = async () => {
    setKaydediyor(true);
    setBilgi("");
    setHata("");
    try {
      const res = await fetch("/api/account/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(durum),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) setHata(d?.error ?? t("notify.failed"));
      else {
        setBilgi(t("notify.saved"));
        // Sunucu adres silinince onayları düşürüyor; ekran da onu göstersin.
        if (!durum.notifyEmail.trim()) setDurum(BOS);
      }
    } catch {
      setHata(t("notify.failed"));
    } finally {
      setKaydediyor(false);
    }
  };

  const adresYok = !durum.notifyEmail.trim();

  const kutu = (
    alan: "notifyReminders" | "notifyMemorials" | "notifyNewsletter",
    etiket: string,
    ipucu: string
  ) => (
    <label className="flex items-start gap-2.5 cursor-pointer">
      <input
        type="checkbox"
        className="mt-0.5 accent-primary"
        checked={durum[alan]}
        disabled={adresYok || yukleniyor}
        onChange={(e) => setDurum((d) => ({ ...d, [alan]: e.target.checked }))}
      />
      <span className="leading-snug">
        <span className="text-xs font-medium">{etiket}</span>
        <span className="block text-[11px] text-text-subtle">{ipucu}</span>
      </span>
    </label>
  );

  return (
    <section className="space-y-3">
      <div>
        <label className="text-xs font-medium block mb-1" htmlFor="notify-mail">
          {t("notify.label")}
        </label>
        <p className="text-[11px] text-text-subtle leading-snug mb-2">{t("notify.hint")}</p>
        <input
          id="notify-mail"
          type="email"
          className="w-full text-sm px-3 py-2 rounded-xl bg-surface border border-border"
          value={durum.notifyEmail}
          disabled={yukleniyor}
          placeholder="ornek@eposta.com"
          onChange={(e) => setDurum((d) => ({ ...d, notifyEmail: e.target.value }))}
        />
      </div>

      <div className="space-y-2">
        {kutu("notifyReminders", t("notify.reminders"), t("notify.remindersHint"))}
        {kutu("notifyMemorials", t("notify.memorials"), t("notify.memorialsHint"))}
        {kutu("notifyNewsletter", t("notify.newsletter"), t("notify.newsletterHint"))}
      </div>

      {adresYok && !yukleniyor && (
        <p className="text-[11px] text-text-subtle">{t("notify.needsAddress")}</p>
      )}

      <Button size="sm" onClick={kaydet} disabled={kaydediyor || yukleniyor}>
        {kaydediyor ? t("notify.saving") : t("notify.save")}
      </Button>

      {bilgi && <p className="text-[11px] text-text-subtle">{bilgi}</p>}
      {hata && <p className="text-xs text-danger bg-danger-soft px-3 py-2 rounded-xl">{hata}</p>}
    </section>
  );
}
