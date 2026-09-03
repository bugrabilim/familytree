"use server";

import { signIn } from "@/auth";
import { SITE_URL } from "@/lib/site";

/**
 * Şifresiz demo girişi. Hesabı hazırlar, ağacı sıfırlar ve oturum açar.
 * Sunucuda çalıştığı için istemciye hiçbir kimlik bilgisi sızmaz.
 */
export async function demoGirisi() {
  await signIn("demo", { redirectTo: "/tree" });
}

/**
 * MİSAFİR girişi (Faz 3d). Yeni bir misafir ağacı açıp oturum kurar.
 *
 * Sunucuda çalışıyor: misafir sağlayıcısı hesap kimliğini istiyor ve o kimlik
 * istemciye hiç verilmiyor. Verilseydi, istemci elindeki kimlikle başka bir
 * misafir hesabına girmeyi deneyebilirdi (sağlayıcı misafir olmayanı zaten
 * reddediyor ama kimliği hiç dışarı vermemek daha dar bir kapı).
 */
export async function misafirGirisi() {
  const res = await fetch(`${SITE_URL}/api/guest`, { method: "POST" });
  if (!res.ok) {
    const d = await res.json().catch(() => null);
    throw new Error(d?.error ?? "Misafir ağacı açılamadı.");
  }
  const { id } = (await res.json()) as { id: string };
  await signIn("guest", { id, redirectTo: "/tree" });
}
