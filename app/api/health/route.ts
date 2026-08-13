import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canManage } from "@/lib/roles";
import { pingBlob } from "@/lib/blob";
import { pingCloudinary } from "@/lib/cloudinary";
import { pingSupabase, supabaseEnvPresence } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * Yönetici-özel sağlık kontrolü: dış servislere (Vercel Blob + Cloudinary)
 * gerçekten ulaşılıyor mu? Canlıda (sırların bulunduğu ortam) çalışır; tarayıcıda
 * yönetici olarak `/api/health` açılınca anlık durum döner. Sır/değer sızdırmaz —
 * yalnız ok/hata ve env değişkeninin VAR olup olmadığı.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  if (!canManage(session.user.role))
    return NextResponse.json({ error: "Yönetici olmalısınız." }, { status: 403 });

  const [blob, cloudinary, supabase] = await Promise.all([
    pingBlob(),
    pingCloudinary(),
    pingSupabase(),
  ]);

  const envPresent = {
    BLOB_READ_WRITE_TOKEN: !!process.env.BLOB_READ_WRITE_TOKEN,
    CLOUDINARY_CLOUD_NAME: !!process.env.CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY: !!process.env.CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET: !!process.env.CLOUDINARY_API_SECRET,
    // NextAuth v5 gizli anahtarı AUTH_SECRET adıyla okur (NEXTAUTH_SECRET değil).
    AUTH_SECRET: !!process.env.AUTH_SECRET,
    ...supabaseEnvPresence(),
  };

  // Not: Supabase henüz uygulamaya bağlı değil (Faz 2). Bu yüzden `healthy`
  // hesabına KATILMAZ — yalnız bilgilendirme amaçlı gösterilir.
  const healthy = blob.ok && cloudinary.ok;
  return NextResponse.json(
    {
      healthy,
      checkedAt: new Date().toISOString(),
      services: {
        vercelBlob: blob, // veri deposu (JSON)
        cloudinary, // fotoğraf + ses
        supabase, // Postgres (Faz 2 — bilgilendirme)
      },
      env: envPresent, // yalnız var/yok (değer değil)
    },
    { status: healthy ? 200 : 503 }
  );
}
