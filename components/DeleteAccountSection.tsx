"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Button from "./ui/Button";
import DeleteScopeList from "./DeleteScopeList";
import { useLang, useT } from "@/lib/i18n";
import { deleteAccount } from "@/lib/actions";
import { GRACE_DAYS, confirmMatches } from "@/lib/retention";

/**
 * "Hesabı sil" — ayarların EN ALTINDA, ayrı ve görsel olarak tehlikeli.
 *
 * Neden bu kadar sürtünme var:
 *  - Şifre + aile adı BİRLİKTE isteniyor. Şifre "sen misin"i, aile adı "doğru
 *    hesabı mı siliyorsun"u soruyor. Yalnız biri sorulsaydı, açık kalmış bir
 *    oturumda tek tıkla hesap silinebilirdi.
 *  - Yedek bağlantısı silme düğmesinin YANINDA. Ayrı bir sayfaya konsaydı,
 *    "önce yedeğini al" cümlesini yalnız oraya gidenler görürdü — yani
 *    ihtiyacı olmayanlar.
 *  - 207 ayrı ele alınıyor: hesap beklemeye alındı ama bazı veriler
 *    işlenemediyse bunu SÖYLÜYORUZ. Sessizce başarı göstermek, kullanıcıya
 *    verisinin gittiğini sanmasına yol açardı.
 *
 * Silme kalıcı değil: hesap `GRACE_DAYS` gün beklemede kalır ve `purgeAt`
 * anında yok edilir. Metinler "geri alınamaz" DEMİYOR — o cümle artık yanlış
 * olurdu ve kullanıcıyı var olan geri getirme yolundan uzaklaştırırdı.
 */

interface Props {
  /** Hesabın aile adı — teyit metni buna birebir eşleşmeli. */
  familyName: string;
  /** Hesaba bağlı ağaç sayısı. */
  treeCount: number;
  /** Aktif ağaçtaki kişi sayısı — "kabaca ne kadar içerik" için. */
  peopleCount: number;
}

export default function DeleteAccountSection({ familyName, treeCount, peopleCount }: Props) {
  const t = useT();
  const { lang } = useLang();
  const router = useRouter();
  const [acik, setAcik] = useState(false);
  const [sifre, setSifre] = useState("");
  const [onay, setOnay] = useState("");
  const [busy, setBusy] = useState<"" | "export" | "delete">("");
  const [hata, setHata] = useState("");
  const [sonuc, setSonuc] = useState<{ purgeAt?: string; failed?: string[] } | null>(null);

  /*
   * Teyit: şifre boş olmayacak VE aile adı eşleşecek. İkisi de gerekli —
   * biri düşerse düğme etkinleşir ve sürtünmenin tamamı kaybolur.
   *
   * Karşılaştırma sunucunun kullandığı AYNI işlevle (`confirmMatches`)
   * yapılıyor. Arayüz kendi kopyasını yazsaydı iki kural ayrışırdı ve
   * ayrışmanın yönü kötü olurdu: düğme etkinleşir, sunucu 400 döner,
   * kullanıcı doğru yazdığı hâlde neden reddedildiğini anlamaz.
   */
  const eslesti = confirmMatches(onay, familyName);
  const hazir = sifre.length > 0 && eslesti;

  const tarihYaz = (iso?: string) => {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleDateString(lang === "en" ? "en" : "tr", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
    } catch {
      return iso;
    }
  };

  const yedekAl = async () => {
    setBusy("export");
    setHata("");
    try {
      const res = await fetch("/api/family/export?format=json");
      if (!res.ok) throw new Error(t("account.delete.exportFailed"));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${familyName || "aile-agaci"}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setHata((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const sil = async () => {
    if (!hazir) return;
    setBusy("delete");
    setHata("");
    try {
      const r = await deleteAccount(sifre, onay.trim(), t("account.delete.failed"));
      setSonuc({ purgeAt: r.purgeAt, failed: r.durum === "kismi" ? r.failed : undefined });
      setSifre("");
      /*
       * Oturum hemen kapatılıyor (hesap artık beklemede), ama ana sayfaya
       * yönlendirme kullanıcı sonucu OKUDUKTAN sonra. Anında yönlendirseydik
       * kalıcı yok ediş tarihini ve — 207'de — işlenemeyen verileri kimse
       * göremezdi.
       */
      await signOut({ redirect: false });
    } catch (e) {
      setHata((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  /* --- Silindi: kalıcı yok ediş anı + geri getirme yolu ----------------- */
  if (sonuc) {
    return (
      <section className="space-y-2 rounded-xl border border-danger/40 bg-danger-soft/40 p-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-danger">
          {t("account.delete.title")}
        </h3>
        <p className="text-sm text-text">{t("account.delete.done")}</p>
        {sonuc.purgeAt && (
          <p className="text-sm font-medium text-text">
            {t("account.delete.purgeAt", { date: tarihYaz(sonuc.purgeAt) })}
          </p>
        )}
        <p className="text-[12px] text-text-muted leading-snug">
          {t("account.delete.restoreNote", { days: GRACE_DAYS })}
        </p>
        {sonuc.failed && sonuc.failed.length > 0 && (
          <div className="rounded-lg border border-danger/40 bg-bg-elevated p-2.5 space-y-1">
            <p className="text-[12px] font-medium text-danger">{t("account.delete.partial")}</p>
            <ul className="text-[12px] text-text-muted space-y-0.5">
              {sonuc.failed.map((f) => (
                <li key={f}>• {f}</li>
              ))}
            </ul>
            <p className="text-[11px] text-text-subtle leading-snug">
              {t("account.delete.partialHint")}
            </p>
          </div>
        )}
        <Button variant="danger" full onClick={() => router.push("/")}>
          {t("account.delete.goHome")}
        </Button>
      </section>
    );
  }

  return (
    <section className="space-y-2 rounded-xl border border-danger/40 bg-danger-soft/25 p-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-danger">
        {t("account.delete.danger")}
      </h3>
      <p className="text-sm text-text leading-snug">
        {t("account.delete.lead", { days: GRACE_DAYS })}
      </p>
      {/* Kaç ağaç, kaç kişi — kullanıcı neyi riske attığını sayıyla görsün. */}
      <p className="text-[12px] text-text-muted leading-snug">
        {t("account.delete.summary", { trees: treeCount, people: peopleCount })}
      </p>

      {!acik ? (
        <Button variant="danger" size="sm" onClick={() => setAcik(true)}>
          {t("account.delete.open")}
        </Button>
      ) : (
        <div className="space-y-3 pt-1">
          <div className="rounded-lg border border-border bg-bg-elevated p-2.5 space-y-1.5">
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-text-subtle">
              {t("account.delete.scopeTitle")}
            </h4>
            <DeleteScopeList />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[12px] text-text" htmlFor="hesap-silme-sifre">
              {t("account.delete.passwordLabel")}
            </label>
            <input
              id="hesap-silme-sifre"
              type="password"
              value={sifre}
              onChange={(e) => setSifre(e.target.value)}
              placeholder={t("account.delete.passwordPlaceholder")}
              autoComplete="current-password"
              className="w-full h-9 px-3 rounded-xl bg-surface-2 border border-border text-sm text-text placeholder:text-text-subtle focus:outline-none focus:border-danger"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[12px] text-text" htmlFor="hesap-silme-onay">
              {t("account.delete.confirmLabel", { name: familyName })}
            </label>
            <input
              id="hesap-silme-onay"
              value={onay}
              onChange={(e) => setOnay(e.target.value)}
              placeholder={t("account.delete.confirmPlaceholder")}
              autoComplete="off"
              className="w-full h-9 px-3 rounded-xl bg-surface-2 border border-border text-sm text-text placeholder:text-text-subtle focus:outline-none focus:border-danger"
            />
            <p className="text-[11px] text-text-subtle leading-snug">
              {t("account.delete.confirmHint")}
            </p>
          </div>

          {hata && <p className="text-[12px] text-danger">{hata}</p>}

          {/* "Önce yedeğini al" cümlesi ve yedek düğmesi, silme düğmesiyle
              AYNI yerde — kullanıcı düğmeye bakarken görüyor. */}
          <p className="text-[12px] text-text-muted leading-snug">
            {t("account.delete.backupHint")}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="danger" size="sm" onClick={sil} disabled={!hazir || busy !== ""}>
              {busy === "delete" ? t("account.delete.deleting") : t("account.delete.submit")}
            </Button>
            <Button variant="secondary" size="sm" onClick={yedekAl} disabled={busy !== ""}>
              {busy === "export" ? t("account.delete.exporting") : t("account.delete.export")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAcik(false)} disabled={busy !== ""}>
              {t("account.delete.cancel")}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
