"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthShell, { authField, authLabel } from "@/components/AuthShell";
import Button from "@/components/ui/Button";

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<"form" | "done">("form");
  const [familyName, setFamilyName] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword !== confirm) {
      setError("Şifreler eşleşmiyor.");
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
      if (!res.ok) setError(data.error ?? "Bir hata oluştu.");
      else setStep("done");
    } catch {
      setError("Bağlantı hatası. Lütfen tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  };

  if (step === "done") {
    return (
      <AuthShell icon="✅" title="Şifren güncellendi" subtitle="Yeni şifrenle giriş yapabilirsin.">
        <Button size="lg" full onClick={() => router.push("/login")}>
          Giriş yap
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      icon="🔑"
      title="Şifreni sıfırla"
      subtitle="Kayıt sırasında verilen kurtarma kodunu kullan"
      footer={
        <Link href="/login" className="text-primary font-medium hover:underline">
          Giriş sayfasına dön
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={authLabel} htmlFor="f-soyisim">Ağaç adı</label>
          <input
            id="f-soyisim"
            className={authField}
            value={familyName}
            onChange={(e) => setFamilyName(e.target.value)}
            placeholder="Hesabındaki ağaç adı"
            required
          />
        </div>

        <div>
          <label className={authLabel} htmlFor="f-kod">Kurtarma kodu</label>
          <input
            id="f-kod"
            className={`${authField} font-mono tracking-wider`}
            value={recoveryCode}
            onChange={(e) => setRecoveryCode(e.target.value)}
            placeholder="XXXX-XXXX-XXXX-XXXX"
            required
          />
        </div>

        <div>
          <label className={authLabel} htmlFor="f-sifre">Yeni şifre</label>
          <input
            id="f-sifre"
            type="password"
            className={authField}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="En az 6 karakter"
            minLength={6}
            autoComplete="new-password"
            required
          />
        </div>

        <div>
          <label className={authLabel} htmlFor="f-sifre2">Şifre tekrar</label>
          <input
            id="f-sifre2"
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
          {loading ? "Güncelleniyor…" : "Şifreyi sıfırla"}
        </Button>
      </form>
    </AuthShell>
  );
}
