import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { operatorVerdict } from "@/lib/operator-access";
import { pingBlob } from "@/lib/blob";
import { pingCloudinary } from "@/lib/cloudinary";
import { isSupabaseConfigured, pingSupabase, supabaseEnvPresence } from "@/lib/supabase";
import { emailEnvPresence, isEmailConfigured, replyAddress } from "@/lib/email";

export const dynamic = "force-dynamic";

/**
 * SAĞLIK KONTROLÜ — dış servislere gerçekten ulaşılıyor mu?
 *
 * Sır/değer sızdırmaz: yalnız ok/hata ve env değişkeninin VAR olup olmadığı.
 *
 * ## Kim çağırabilir
 *
 * İki yol var ve ikincisi sonradan eklendi:
 *
 * 1. **Giriş yapmış yönetici** — tarayıcıda `/api/health` açar, anlık durumu
 *    görür.
 * 2. **`CRON_SECRET` taşıyan istek** — `Authorization: Bearer <sır>`.
 *    Sorgu dizesiyle (`?token=`) DEĞİL, bilerek: `proxy.ts` oturumsuz
 *    `/api/*` isteklerini yalnız `Bearer` başlığı varsa geçiriyor, yani
 *    sorgu dizesi buraya hiç ulaşmazdı — çalışmayan bir yol sunmak,
 *    hiç sunmamaktan kötü. Ayrıca sır sorgu dizesinde erişim günlüklerine
 *    ve tarayıcı geçmişine düşerdi.
 *
 * İkincisi olmadan bu uç DIŞARIDAN İZLENEMİYORDU: her sağlık izleme aracı
 * (UptimeRobot, Better Stack, bir cron) oturumsuz çağırır ve 401 alırdı.
 * Yani "her şey çalışıyor mu" sorusunu ancak birinin aklına gelip elle
 * bakması hâlinde yanıtlayabilen bir sağlık ucu — yani sağlık ucu değil.
 *
 * Yeni bir sır ÜRETİLMEDİ: `CRON_SECRET` zaten bu dağıtımın "makine
 * çağırıyor" kimliği. Sır tanımsızsa bu yol KAPALI DÜŞER (yalnız oturum
 * kalır), çünkü "sır yoksa serbest" davranışı ucu herkese açardı.
 *
 * ## `healthy` neyi kapsıyor
 *
 * Blob ve Cloudinary olmadan uygulama çalışmıyor — ikisi de hesaba katılıyor.
 *
 * Supabase eskiden hesaba KATILMIYORDU ve gerekçesi yorumda "henüz uygulamaya
 * bağlı değil (Faz 2)" diye yazıyordu. O gerekçe geçersiz: okuma yolu artık
 * ÖNCE Postgres'e bakıyor (`lib/blob.ts` `getFamilyData`) ve yazma yolu iki
 * yere birden yazıyor. Ayna ölü olduğunda uygulama Blob'a düşerek çalışmaya
 * devam ediyor — kullanıcı bir şey fark etmiyor — ama her yazma aynadan
 * kaçıyor ve ayrışma birikiyor. Fark edilmeyen bozulma, bu depoda aylarca
 * sürmüş bir arıza türü.
 *
 * O yüzden: Supabase YAPILANDIRILMIŞSA hesaba katılıyor. Yapılandırılmamış
 * bir kurulumda (yerel geliştirme) ayna diye bir şey yok, dolayısıyla
 * eksikliği de bir arıza değil.
 *
 * E-posta kanalı GÖRÜNÜYOR ama `healthy`ye KATILMIYOR — gerekçesi aşağıda,
 * `services.email`in başında.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth_ = req.headers.get("authorization") ?? "";
  const makine = !!secret && auth_ === `Bearer ${secret}`;

  if (!makine) {
    /*
     * Oturum yolu artık ORTAK operatör kapısından geçiyor. Eskiden yalnız
     * `canManage` sorulduğu için ŞİFRESİZ demo oturumu buradan altyapı
     * durumunu (hangi ortam değişkenleri tanımlı, sağlayıcı ping'leri)
     * okuyabiliyordu — gerekçe `lib/operator-access.ts`te.
     */
    const session = await auth();
    const karar = operatorVerdict(session?.user);
    if (!karar.ok) return NextResponse.json({ error: karar.error }, { status: karar.status });
  }

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
    /*
     * Zamanlanmış işlerin ikisi de buna bağlı ve ikisi de kapalı düşüyor:
     * yoksa hatırlatma postaları hiç gitmez, yedek hiç alınmaz — hiçbir hata
     * üretmeden. Sağlık yanıtında görünmesi, o sessizliği kıran tek işaret.
     */
    CRON_SECRET: !!secret,
    ...supabaseEnvPresence(),
    /*
     * Aynı sessizliğin posta tarafı: bu üçü eksikken hiçbir uç hata
     * döndürmüyor, yalnız posta gitmiyor. `EMAIL_REPLY_TO` ayrıca kendi
     * başına sessiz — gönderim çalışır, ailenin verdiği YANIT kaybolur.
     */
    ...emailEnvPresence(),
  };

  const aynaGerekli = isSupabaseConfigured();
  const emailAcik = isEmailConfigured();
  const healthy = blob.ok && cloudinary.ok && (!aynaGerekli || supabase.ok);
  return NextResponse.json(
    {
      healthy,
      checkedAt: new Date().toISOString(),
      services: {
        vercelBlob: blob, // veri deposu (JSON)
        cloudinary, // fotoğraf + ses
        // Postgres aynası — yapılandırılmışsa `healthy` hesabına KATILIYOR.
        supabase: { ...supabase, counted: aynaGerekli },
        /*
         * GİDEN POSTA — `healthy` hesabına katılmıyor ve PING de yok.
         *
         * Neden burada: anahtar düştüğünde hiçbir yerde alarm çalmıyor;
         * hatırlatma, davet ve şifre sıfırlama postaları hiç gitmiyor.
         * Yukarıdaki `CRON_SECRET` gerekçesinin aynısı.
         *
         * Neden PING YOK: Resend anahtarları izin kapsamlı — yalnız
         * "gönderim" yetkisi verilmiş bir anahtar `GET /domains` çağrısında
         * 401/403 döner, yani gönderim gayet çalışırken sağlık kırmızıya
         * düşerdi. Yanlış alarm, hiç bakmamaktan kötü: izleme aracı bir kez
         * boşuna öttükten sonra kimse ciddiye almıyor. Gerçekten
         * gönderebildiğimizi kanıtlamanın tek yolu posta ATMAK ve bir sağlık
         * ucu posta atmamalı.
         *
         * Neden `healthy` DEĞİŞMİYOR: kanal bilerek opsiyonel — anahtar
         * yokken uygulamanın geri kalanı çalışıyor (`isEmailConfigured()`
         * çağıranlara söylüyor). `counted: false` bunu yanıtın içinde de
         * yazıyor, ki okuyan "yeşil ama posta mı gitmiyor" diye şaşırmasın.
         */
        email: {
          ok: emailAcik,
          ...(emailAcik ? {} : { error: "env eksik" }),
          // false → gönderim çalışır, gelen yanıtlar hiçbir yere ulaşmaz.
          replyReachable: !!replyAddress(),
          counted: false,
        },
      },
      env: envPresent, // yalnız var/yok (değer değil)
    },
    { status: healthy ? 200 : 503 }
  );
}
