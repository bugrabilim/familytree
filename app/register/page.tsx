"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AuthShell, { authField, authLabel } from "@/components/AuthShell";
import Button from "@/components/ui/Button";

export default function RegisterPage() {
  const [step, setStep] = useState<"form" | "recovery">("form");
  const [familyName, setFamilyName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [copied, setCopied] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("Şifreler eşleşmiyor.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ familyName, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Kayıt başarısız.");
        return;
      }
      setRecoveryCode(data.recoveryCode);
      setStep("recovery");
    } catch {
      setError("Bağlantı hatası. Lütfen tekrar deneyin.");
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
        title="Kurtarma kodun"
        subtitle="Şifreni unutursan hesabına yalnızca bu kodla erişebilirsin."
      >
        <div className="rounded-2xl border-2 border-accent/40 bg-accent-soft p-4 mb-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-accent mb-2.5">
            Güvenli bir yere kaydet
          </p>
          <p className="font-mono text-lg font-semibold text-center text-text tracking-[0.15em] break-all">
            {recoveryCode}
          </p>
        </div>

        <Button variant="secondary" full onClick={copyCode} className="mb-2.5">
          {copied ? "✓ Kopyalandı" : "Kodu kopyala"}
        </Button>

        <Button size="lg" full onClick={handleContinue} disabled={loading}>
          {loading ? "Giriş yapılıyor…" : "Ağacıma git"}
        </Button>

        <p className="text-[11px] text-text-subtle text-center mt-3.5 leading-relaxed">
          Bu sayfayı kapatınca kod bir daha gösterilmez.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Ailenin ağacını kur"
      subtitle="Bir hesap aç, herkes birlikte doldursun"
      footer={
        <p>
          Zaten hesabın var mı?{" "}
          <Link href="/login" className="text-primary font-medium hover:underline">
            Giriş yap
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={authLabel} htmlFor="r-soyisim">Soyisim</label>
          <input
            id="r-soyisim"
            className={authField}
            value={familyName}
            onChange={(e) => setFamilyName(e.target.value)}
            placeholder="Ailenizin soyadı"
            minLength={2}
            autoComplete="username"
            required
          />
          <p className="text-[11px] text-text-subtle mt-1.5">
            Aynı zamanda giriş kullanıcı adın olacak.
          </p>
        </div>

        <div>
          <label className={authLabel} htmlFor="r-sifre">Şifre</label>
          <input
            id="r-sifre"
            type="password"
            className={authField}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="En az 6 karakter"
            minLength={6}
            autoComplete="new-password"
            required
          />
        </div>

        <div>
          <label className={authLabel} htmlFor="r-sifre2">Şifre tekrar</label>
          <input
            id="r-sifre2"
            type="password"
            className={authField}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Şifreni tekrar gir"
            autoComplete="new-password"
            required
          />
        </div>

        {error && (
          <p className="text-xs text-danger bg-danger-soft px-3 py-2.5 rounded-xl">{error}</p>
        )}

        <Button type="submit" size="lg" full disabled={loading}>
          {loading ? "Oluşturuluyor…" : "Hesap oluştur"}
        </Button>
      </form>
    </AuthShell>
  );
}
