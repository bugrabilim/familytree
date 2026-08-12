import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Sunucu-taraflı Supabase istemcisi (yalnız sunucu — `server-only`).
 *
 * Servis-rolü anahtarıyla oluşturulur → RLS'yi atlar. Yetki denetimi
 * uygulamada (NextAuth oturumu + resolveActiveTree) yapıldığı için veri
 * katmanında güvenli. Bu anahtar ASLA istemciye sızmamalı; bu yüzden dosya
 * `server-only` ile korunur ve yalnız `SUPABASE_URL` gibi public-olmayan
 * değişkenler okunur.
 *
 * Vercel-Supabase entegrasyonunun enjekte ettiği değişken adları sürümlere
 * göre değişebildiği için birkaç aday isim sırayla denenir.
 */

function pick(...names: string[]): string | undefined {
  for (const n of names) {
    const v = process.env[n];
    if (v) return v;
  }
  return undefined;
}

/** Supabase yapılandırılmış mı? (env değişkenleri mevcut mu) */
export function isSupabaseConfigured(): boolean {
  return !!(
    pick("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL") &&
    pick("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY")
  );
}

let cached: SupabaseClient | null = null;

/**
 * Servis-rolü istemcisini döndürür (bir kez oluşturulup önbelleklenir).
 * Env eksikse net bir hata fırlatır — çağıran taraf isterse
 * `isSupabaseConfigured()` ile önceden kontrol edebilir.
 */
export function supabaseAdmin(): SupabaseClient {
  if (cached) return cached;
  const url = pick("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
  const key = pick("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY");
  if (!url || !key) {
    throw new Error(
      "Supabase yapılandırılmamış: SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY (ya da SUPABASE_SECRET_KEY) gerekli."
    );
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
