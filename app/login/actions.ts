"use server";

import { signIn } from "@/auth";

/**
 * Şifresiz demo girişi. Hesabı hazırlar, ağacı sıfırlar ve oturum açar.
 * Sunucuda çalıştığı için istemciye hiçbir kimlik bilgisi sızmaz.
 */
export async function demoGirisi() {
  await signIn("demo", { redirectTo: "/tree" });
}
