"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import AuthShell, { authField, authLabel } from "@/components/AuthShell";
import Button from "@/components/ui/Button";
import { useT } from "@/lib/i18n";
import { restoreAccount } from "@/lib/actions";
import { demoGirisi } from "./actions";

function LoginForm() {
  const t = useT();
  const [familyName, setFamilyName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  /*
   * Silinmekte olan hesabın geri getirilmesi (bekleme süresi, `lib/retention.ts`).
   *
   * Neden burada: silinmiş hesapla GİRİŞ YAPILAMIYOR, dolayısıyla geri
   * getirmenin oturumlu bir yolu yok. Kullanıcının elinde yalnız aile adı ve
   * şifresi var — ikisi de bu formda zaten yazılı. Bu bağlantı olmasaydı
   * bekleme süresi kullanıcı için hiçbir işe yaramazdı: verisi süre boyunca
   * duruyor ama ona ulaşacak hiçbir düğme yok.
   *
   * Yalnız BAŞARISIZ girişten sonra gösteriliyor: uç güvenlik gereği "böyle
   * hesap yok", "hesap canlı" ve "şifre yanlış" arasında ayrım yapmıyor, o
   * yüzden kimin hesabının beklemede olduğunu önceden bilemiyoruz.
   */
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreFailed, setRestoreFailed] = useState<string[] | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/tree";

  const girisYap = async () => {
    const res = await signIn("credentials", { familyName, password, redirect: false });
    if (res?.error) {
      setError(t("login.error"));
      setLoading(false);
      return false;
    }
    router.push(callbackUrl);
    return true;
  };

  const geriGetir = async () => {
    setRestoreBusy(true);
    setError("");
    try {
      const r = await restoreAccount(familyName, password, t("login.restore.failed"));
      /*
       * 207: hesap geri geldi ama bir şey işlenemedi. Sessizce girip
       * "her şey yolunda" demek yanlış olurdu — kullanıcı, paylaşım
       * bağlantısı gibi eksik kalmış olabilecek şeyleri bilmeli. O yüzden
       * bu dalda otomatik giriş YOK; önce liste okunur.
       */
      if (r.durum === "kismi") {
        setRestoreFailed(r.failed);
        return;
      }
      setLoading(true);
      await girisYap();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRestoreBusy(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    await girisYap();
  };

  return (
    <AuthShell
      title={t("login.title")}
      subtitle={t("login.subtitle")}
      footer={
        <>
          <p>
            {t("login.noAccount")}{" "}
            <Link href="/register" className="text-primary font-medium hover:underline">
              {t("login.createAccount")}
            </Link>
          </p>
          <p className="mt-2">
            <Link href="/forgot-password" className="text-text-subtle hover:text-primary hover:underline">
              {t("login.forgot")}
            </Link>
          </p>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={authLabel} htmlFor="soyisim">{t("login.treeName")}</label>
          <input
            id="soyisim"
            className={authField}
            value={familyName}
            onChange={(e) => setFamilyName(e.target.value)}
            placeholder={t("login.treeNamePlaceholder")}
            autoComplete="username"
            required
          />
        </div>

        <div>
          <label className={authLabel} htmlFor="sifre">{t("login.password")}</label>
          <input
            id="sifre"
            type="password"
            className={authField}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />
        </div>

        {error && (
          <p className="text-xs text-danger bg-danger-soft px-3 py-2.5 rounded-xl">{error}</p>
        )}

        {/* Silinmekte olan hesap için geri getirme yolu — yalnız giriş
            başarısız olduktan sonra, çünkü uç hangi hesabın beklemede
            olduğunu söylemiyor (söyleseydi kayıtlı aile adlarını sormanın
            aracı olurdu). */}
        {error && !restoreFailed && (
          <div className="rounded-xl border border-border bg-surface-2 px-3 py-2.5 space-y-2">
            <p className="text-[11px] text-text-muted leading-snug">{t("login.restore.hint")}</p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              full
              disabled={restoreBusy || loading || !familyName || !password}
              onClick={geriGetir}
            >
              {restoreBusy ? t("login.restore.busy") : t("login.restore.action")}
            </Button>
          </div>
        )}

        {restoreFailed && (
          <div className="rounded-xl border border-danger/40 bg-danger-soft/40 px-3 py-2.5 space-y-1.5">
            <p className="text-[11px] text-danger font-medium">{t("login.restore.partial")}</p>
            <ul className="text-[11px] text-text-muted space-y-0.5">
              {restoreFailed.map((f) => (
                <li key={f}>• {f}</li>
              ))}
            </ul>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              full
              disabled={loading}
              onClick={() => {
                setRestoreFailed(null);
                setLoading(true);
                girisYap();
              }}
            >
              {t("login.restore.continue")}
            </Button>
          </div>
        )}

        <Button type="submit" size="lg" full disabled={loading || demoLoading}>
          {loading ? t("login.signingIn") : t("login.signIn")}
        </Button>
      </form>

      {/* Şifresiz demo */}
      <div className="mt-6">
        <div className="flex items-center gap-3 mb-4">
          <span className="h-px flex-1 bg-border" />
          <span className="text-[11px] text-text-subtle">{t("login.or")}</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <Button
          type="button"
          variant="secondary"
          size="lg"
          full
          disabled={loading || demoLoading}
          onClick={() => {
            setDemoLoading(true);
            setError("");
            demoGirisi().catch(() => {
              setDemoLoading(false);
              setError(t("login.demoFailed"));
            });
          }}
        >
          {demoLoading ? t("login.demoLoading") : t("login.demoButton")}
        </Button>

        <p className="text-[11px] text-text-subtle text-center mt-2.5 leading-relaxed">
          {t("login.demoNote")}
        </p>
      </div>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
