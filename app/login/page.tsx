"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import AuthShell, { authField, authLabel } from "@/components/AuthShell";
import Button from "@/components/ui/Button";

function LoginForm() {
  const [familyName, setFamilyName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/tree";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await signIn("credentials", { familyName, password, redirect: false });

    if (res?.error) {
      setError("Soyisim veya şifre hatalı.");
      setLoading(false);
    } else {
      router.push(callbackUrl);
    }
  };

  return (
    <AuthShell
      title="Tekrar hoş geldin"
      subtitle="Aile hesabına giriş yap"
      footer={
        <>
          <p>
            Hesabın yok mu?{" "}
            <Link href="/register" className="text-primary font-medium hover:underline">
              Hesap oluştur
            </Link>
          </p>
          <p className="mt-2">
            <Link href="/forgot-password" className="text-text-subtle hover:text-primary hover:underline">
              Şifremi unuttum
            </Link>
          </p>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={authLabel} htmlFor="soyisim">Soyisim</label>
          <input
            id="soyisim"
            className={authField}
            value={familyName}
            onChange={(e) => setFamilyName(e.target.value)}
            placeholder="Aile soyadınız"
            autoComplete="username"
            required
          />
        </div>

        <div>
          <label className={authLabel} htmlFor="sifre">Şifre</label>
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

        <Button type="submit" size="lg" full disabled={loading}>
          {loading ? "Giriş yapılıyor…" : "Giriş yap"}
        </Button>
      </form>
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
