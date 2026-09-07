"use client";

/* Kayıt formunun tamamı — `page.tsx` metadata verebilmek için SUNUCU
   bileşeni kaldı, etkileşim buraya taşındı (bkz. `page.tsx`). */

import { useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AuthShell, { authField, authLabel } from "@/components/AuthShell";
import Button from "@/components/ui/Button";
import { useT } from "@/lib/i18n";

export default function RegisterView() {
  const t = useT();
  const [step, setStep] = useState<"form" | "recovery">("form");
  const [familyName, setFamilyName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [agreed, setAgreed] = useState(false);
  /*
   * Onay eksikliği hata METNİNDEN ayrı tutuluyor: kutuya `aria-invalid`
   * koyabilmek için hangi hatanın geldiğini bilmemiz gerekiyor ve bunu
   * `error === t("register.consentRequired")` diye karşılaştırmak dile
   * bağlı, kırılgan bir kontrol olurdu.
   */
  const [consentError, setConsentError] = useState(false);
  const consentRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [copied, setCopied] = useState(false);
  const router = useRouter();

  /*
   * Onay eksik — tek yerde: hem tarayıcının doğrulaması (`invalid` olayı)
   * hem de gönderim dalı buraya iniyor, böylece iki yol da AYNI mesajı ve
   * aynı odağı üretiyor.
   *
   * Odak elle veriliyor: yerel balonu bastırdığımızda (`preventDefault`)
   * tarayıcı geçersiz alana kendiliğinden gitmiyor; gitmezse hata metni
   * ekranda görünür ama klavye/ekran okuyucu kullanıcısı hâlâ formun
   * neresinde olduğunu bilmez.
   */
  const onayEksik = () => {
    setError(t("register.consentRequired"));
    setConsentError(true);
    consentRef.current?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError(t("register.passwordMismatch"));
      return;
    }
    if (!agreed) {
      onayEksik();
      return;
    }
    setConsentError(false);

    setLoading(true);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ familyName, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("register.failed"));
        return;
      }
      setRecoveryCode(data.recoveryCode);
      setStep("recovery");
    } catch {
      setError(t("register.connError"));
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = async () => {
    setLoading(true);
    try {
      await signIn("credentials", { familyName, password, redirect: false });
      router.push("/tree");
    } catch {
      router.push("/login");
    }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(recoveryCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (step === "recovery") {
    return (
      <AuthShell
        icon="🔑"
        title={t("register.recoveryTitle")}
        subtitle={t("register.recoverySubtitle")}
      >
        <div className="rounded-2xl border-2 border-accent/40 bg-accent-soft p-4 mb-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-accent mb-2.5">
            {t("register.recoverySave")}
          </p>
          <p className="font-mono text-lg font-semibold text-center text-text tracking-[0.15em] break-all">
            {recoveryCode}
          </p>
        </div>

        <Button variant="secondary" full onClick={copyCode} className="mb-2.5">
          {copied ? t("register.copied") : t("register.copyCode")}
        </Button>

        <Button size="lg" full onClick={handleContinue} disabled={loading}>
          {loading ? t("register.signingIn") : t("register.goToTree")}
        </Button>

        <p className="text-[11px] text-text-subtle text-center mt-3.5 leading-relaxed">
          {t("register.recoveryWarning")}
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={t("register.title")}
      subtitle={t("register.subtitle")}
      footer={
        <p>
          {t("register.haveAccount")}{" "}
          <Link href="/login" className="text-primary font-medium hover:underline">
            {t("register.signIn")}
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={authLabel} htmlFor="r-soyisim">{t("register.treeName")}</label>
          <input
            id="r-soyisim"
            className={authField}
            value={familyName}
            onChange={(e) => setFamilyName(e.target.value)}
            placeholder={t("register.treeNamePlaceholder")}
            minLength={2}
            autoComplete="username"
            required
          />
          <p className="text-[11px] text-text-subtle mt-1.5">
            {t("register.treeNameHelp")}
          </p>
        </div>

        <div>
          <label className={authLabel} htmlFor="r-sifre">{t("register.password")}</label>
          <input
            id="r-sifre"
            type="password"
            className={authField}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("register.passwordPlaceholder")}
            minLength={6}
            autoComplete="new-password"
            required
          />
        </div>

        <div>
          <label className={authLabel} htmlFor="r-sifre2">{t("register.confirm")}</label>
          <input
            id="r-sifre2"
            type="password"
            className={authField}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={t("register.confirmPlaceholder")}
            autoComplete="new-password"
            required
          />
        </div>

        {/* Açık rıza — KVKK: gizlilik + şartlar onayı (zorunlu) */}
        <label className="flex items-start gap-2.5 cursor-pointer select-none">
          <input
            ref={consentRef}
            type="checkbox"
            checked={agreed}
            onChange={(e) => {
              setAgreed(e.target.checked);
              // Kullanıcı eksiği kapattı — hata metni asılı kalmasın.
              if (e.target.checked) {
                setConsentError(false);
                setError((mevcut) => (mevcut === t("register.consentRequired") ? "" : mevcut));
              }
            }}
            /*
             * ZORUNLU alan, platformun kendi diliyle: `required` olmadan
             * kutu ekran okuyucuya "isteğe bağlı" görünürdü ve JavaScript
             * çalışmadığında hiçbir şey onu tutmazdı.
             */
            required
            aria-required
            /*
             * Yerel doğrulama balonunu BASTIRIP kendi mesajımızı gösteriyoruz.
             * Balonun metni TARAYICININ diline göre gelir; bu uygulamada dil
             * kullanıcının seçtiği TR/EN tercihi (localStorage) ve ikisi
             * birbirini tutmuyor. `preventDefault()` yalnız balonu iptal
             * eder, gönderimi tarayıcı zaten durdurmuş olur.
             */
            onInvalid={(e) => {
              e.preventDefault();
              onayEksik();
            }}
            aria-invalid={consentError || undefined}
            aria-describedby={consentError ? "r-form-hata" : undefined}
            className="ui-check mt-0.5"
          />
          <span className="text-[12px] text-text-muted leading-snug">
            <Link href="/privacy" target="_blank" className="text-primary hover:underline">
              {t("register.consentPrivacy")}
            </Link>{" "}
            {t("register.consentAnd")}{" "}
            <Link href="/terms" target="_blank" className="text-primary hover:underline">
              {t("register.consentTerms")}
            </Link>
            {t("register.consentTail")}
          </span>
        </label>

        {/*
          Formun TEK hata bölgesi (şifre uyuşmazlığı da buraya düşüyor, aynı
          anda ikisi birden olmuyor). `role="alert"` + sabit `id`: eksik onay
          durumunda kutuya `aria-describedby` ile bağlanıyor, böylece odak kutuya gittiğinde ekran okuyucu NEYİN eksik
          olduğunu da okur — yalnız "onay kutusu, işaretli değil" demez.
        */}
        {error && (
          <p
            id="r-form-hata"
            role="alert"
            className="text-xs text-danger bg-danger-soft px-3 py-2.5 rounded-xl"
          >
            {error}
          </p>
        )}

        {/*
          Düğme ONAYA GÖRE devre dışı BIRAKILMAZ.

          Eskiden `disabled={loading || !agreed}` yazıyordu ve sonuç sessiz
          bir ölümdü: kutu işaretlenmemişken düğme tıklanmıyor, hiçbir mesaj
          çıkmıyor, Tab sırası düğmeyi tümüyle atlıyordu — kullanıcı neyin
          eksik olduğunu öğrenemiyordu. Eksik onay artık gönderimde
          SÖYLENİYOR (`onayEksik`), gizlenerek değil. `loading` başka bir şey:
          o, süren bir isteğin ikinci kez gönderilmesini engelliyor.
        */}
        <Button type="submit" size="lg" full disabled={loading}>
          {loading ? t("register.creating") : t("register.create")}
        </Button>
      </form>
    </AuthShell>
  );
}
