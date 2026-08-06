"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="text-5xl mb-3">🔑</div>
            <h1 className="text-xl font-bold text-gray-900">Kurtarma Kodunuz</h1>
            <p className="text-gray-500 text-sm mt-1">
              Şifrenizi unutursanız bu kodu kullanarak sıfırlayabilirsiniz.
            </p>
          </div>

          <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 mb-4">
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">
              ⚠️ Bu kodu güvenli bir yere kaydedin
            </p>
            <p className="text-lg font-mono font-bold text-center text-gray-900 tracking-widest">
              {recoveryCode}
            </p>
          </div>

          <button
            onClick={copyCode}
            className="w-full mb-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            {copied ? "✓ Kopyalandı!" : "Kodu Kopyala"}
          </button>

          <button
            onClick={handleContinue}
            disabled={loading}
            className="w-full py-2.5 bg-green-700 hover:bg-green-800 disabled:bg-green-400 text-white font-semibold rounded-lg transition-colors"
          >
            {loading ? "Giriş yapılıyor..." : "Devam Et →"}
          </button>

          <p className="text-xs text-gray-400 text-center mt-3">
            Bu sayfayı kapatmadan önce kodu kaydettiğinizden emin olun.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-6xl mb-3">🌳</div>
          <h1 className="text-2xl font-bold text-gray-900">Hesap Oluştur</h1>
          <p className="text-gray-500 text-sm mt-1">Aile soy ağacı hesabı aç</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Soyisim</label>
            <input
              type="text"
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              placeholder="Ailenizin soyadı"
              required
              minLength={2}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-gray-900"
            />
            <p className="text-xs text-gray-400 mt-1">Bu aynı zamanda giriş kullanıcı adınız olacak.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Şifre</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="En az 6 karakter"
              required
              minLength={6}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Şifre Tekrar</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Şifrenizi tekrar girin"
              required
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-gray-900"
            />
          </div>

          {error && (
            <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-green-700 hover:bg-green-800 disabled:bg-green-400 text-white font-semibold rounded-lg transition-colors"
          >
            {loading ? "Oluşturuluyor..." : "Hesap Oluştur"}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-5">
          Zaten hesabınız var mı?{" "}
          <Link href="/login" className="text-green-700 font-medium hover:underline">
            Giriş Yap
          </Link>
        </p>
      </div>
    </div>
  );
}
