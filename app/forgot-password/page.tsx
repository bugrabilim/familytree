"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthShell, { authField, authLabel } from "@/components/AuthShell";
import Button from "@/components/ui/Button";
import { useT } from "@/lib/i18n";

/**
 * ŞİFREMİ UNUTTUM — iki kurtarma yolu, üstte seçimli.
 *
 * ## Neden seçim
 *
 * Sayfada eskiden kurtarma kodu formu vardı, e-posta yolu ise en alta bir
 * ayırıcının altına iliştirilmişti. Şifresini unutmuş biri zaten telaşlı; ona
 * iki yolu birden gösterip "hangisi bende var?" diye düşündürmek yerine ÖNCE
 * yolu seçtiriyoruz, sonra yalnız o yolun alanlarını gösteriyoruz.
 *
 * Ağaç adı iki yolda da gerekiyor, o yüzden ortak alan olarak yukarıda
 * duruyor — seçim değişince kaybolup yeniden yazılması gerekmiyor.
 *
 * ## Notlar neden var
 *
 * Kullanıcı hangi yolun kendisinde çalışacağını bilmiyor: kodu kaydetmiş
 * olabilir de olmayabilir de, adres bağlamış olabilir de olmayabilir de. Her
 * yolun altındaki ikinci not çıkmaz sokağı baştan söylüyor ("bu sende yoksa
 * öbürünü dene") — kullanıcı formu doldurup duvara toslamasın.
 */

type Yol = "kod" | "eposta";

export default function ForgotPasswordPage() {
  const t = useT();
  const router = useRouter();

  const [yol, setYol] = useState<Yol>("kod");
  const [step, setStep] = useState<"form" | "done">("form");
  const [familyName, setFamilyName] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mailBusy, setMailBusy] = useState(false);
  const [mailInfo, setMailInfo] = useState("");

  const yolDegistir = (y: Yol) => {
    setYol(y);
    // Bir yolun hatası öbür yolun ekranında asılı kalmasın.
    setError("");
    setMailInfo("");
  };

  const kodIleSifirla = async () => {
    if (newPassword !== confirm) {
      setError(t("forgot.passwordMismatch"));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ familyName, recoveryCode, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? t("forgot.genericError"));
      else setStep("done");
    } catch {
      setError(t("forgot.connError"));
    } finally {
      setLoading(false);
    }
  };

  /*
   * Uç HER DURUMDA aynı yanıtı veriyor (hesap var/yok, adres bağlı/değil), bu
   * yüzden arayüz de tek bir cümle gösteriyor. Farklı mesajlar göstermek,
   * sunucudaki numaralandırma korumasını arayüzden delmek olurdu.
   */
  const eMailIste = async () => {
    if (!familyName.trim()) {
      /*
       * Buraya eskiden yanlışlıkla PLACEHOLDER anahtarı konmuştu: ekranda hata
       * olarak "Hesabındaki ağaç adı" yazıyordu — cümle bile değil, ne
       * yapılacağını söylemiyordu.
       */
      setError(t("forgot.needName"));
      return;
    }
    setMailBusy(true);
    try {
      await fetch("/api/reset-password/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ familyName: familyName.trim() }),
      });
      setMailInfo(t("forgot.emailSent"));
    } catch {
      setError(t("forgot.connError"));
    } finally {
      setMailBusy(false);
    }
  };

  const gonder = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMailInfo("");
    void (yol === "kod" ? kodIleSifirla() : eMailIste());
  };

  if (step === "done") {
    return (
      <AuthShell icon="✅" title={t("forgot.doneTitle")} subtitle={t("forgot.doneSubtitle")}>
        <Button size="lg" full onClick={() => router.push("/login")}>
          {t("forgot.signIn")}
        </Button>
      </AuthShell>
    );
  }

  const sekme = (y: Yol, etiket: string) => {
    const secili = yol === y;
    return (
      <button
        type="button"
        onClick={() => yolDegistir(y)}
        aria-pressed={secili}
        className={`flex-1 text-xs font-medium py-2 rounded-lg transition-colors ${
          secili ? "bg-surface shadow-card text-text" : "text-text-subtle hover:text-text"
        }`}
      >
        {etiket}
      </button>
    );
  };

  return (
    <AuthShell
      icon="🔑"
      title={t("forgot.title")}
      subtitle={t("forgot.method")}
      footer={
        <Link href="/login" className="text-primary font-medium hover:underline">
          {t("forgot.backToLogin")}
        </Link>
      }
    >
      {/* Yol seçimi — aşağıdaki alanlar buna göre değişiyor. */}
      <div className="flex gap-1 p-1 rounded-xl border border-border mb-3">
        {sekme("kod", t("forgot.methodCode"))}
        {sekme("eposta", t("forgot.methodEmail"))}
      </div>

      <p className="text-[11px] text-text-subtle leading-relaxed mb-1.5">
        {yol === "kod" ? t("forgot.codeNote") : t("forgot.emailNote")}
      </p>
      <p className="text-[11px] text-text-muted leading-relaxed mb-4">
        {yol === "kod" ? t("forgot.codeNoteLost") : t("forgot.emailNoteNone")}
      </p>

      <form onSubmit={gonder} className="space-y-4">
        {/* Ağaç adı iki yolda da gerekiyor; seçim değişince kaybolmuyor. */}
        <div>
          <label className={authLabel} htmlFor="f-soyisim">{t("forgot.treeName")}</label>
          <input
            id="f-soyisim"
            type="text"
            className={authField}
            value={familyName}
            onChange={(e) => setFamilyName(e.target.value)}
            placeholder={t("forgot.treeNamePlaceholder")}
            autoComplete="username"
            required
          />
          <p className="text-[11px] text-text-subtle mt-1.5 leading-relaxed">
            {t("forgot.bothNeedName")}
          </p>
        </div>

        {yol === "kod" && (
          <>
            <div>
              <label className={authLabel} htmlFor="f-kod">{t("forgot.recoveryCode")}</label>
              <input
                id="f-kod"
                type="text"
                className={authField}
                value={recoveryCode}
                onChange={(e) => setRecoveryCode(e.target.value)}
                placeholder="XXXX-XXXX-XXXX-XXXX"
                autoComplete="one-time-code"
                required
              />
            </div>

            <div>
              <label className={authLabel} htmlFor="f-sifre">{t("forgot.newPassword")}</label>
              <input
                id="f-sifre"
                type="password"
                className={authField}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t("forgot.newPasswordPlaceholder")}
                minLength={6}
                autoComplete="new-password"
                required
              />
            </div>

            <div>
              <label className={authLabel} htmlFor="f-sifre2">{t("forgot.confirm")}</label>
              <input
                id="f-sifre2"
                type="password"
                className={authField}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder={t("forgot.confirmPlaceholder")}
                autoComplete="new-password"
                required
              />
            </div>
          </>
        )}

        {error && (
          <p className="text-xs text-danger bg-danger-soft px-3 py-2.5 rounded-xl">{error}</p>
        )}
        {mailInfo && (
          <p className="text-[11px] text-text-subtle leading-relaxed border border-border px-3 py-2.5 rounded-xl">
            {mailInfo}
          </p>
        )}

        <Button type="submit" size="lg" full disabled={loading || mailBusy}>
          {yol === "kod"
            ? loading ? t("forgot.updating") : t("forgot.reset")
            : mailBusy ? t("forgot.emailSending") : t("forgot.emailSend")}
        </Button>
      </form>
    </AuthShell>
  );
}
