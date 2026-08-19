/**
 * Sitenin kanonik kök URL'i — metadata (OG/twitter), manifest, robots ve
 * sitemap için. Sırasıyla: açık env → Vercel prod alanı → yerel geliştirme.
 * Gerçek alan adı bağlanınca `NEXT_PUBLIC_SITE_URL` ile geçersiz kılınır.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

export const SITE_NAME = "Soy Ağacı";
