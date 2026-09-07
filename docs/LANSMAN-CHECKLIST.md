# Lansman Checklist

Yayına almadan önce sırayla kontrol edin. (Kod tarafı hazır; bunlar çoğunlukla
ortam/ayar işleri.)

## 1) Ortam değişkenleri (Vercel > Settings > Environment Variables)

Zorunlu:
- [ ] `AUTH_SECRET` — `openssl rand -hex 32`
- [ ] `BLOB_READ_WRITE_TOKEN` — Vercel Blob
- [ ] `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- [ ] Supabase: `SUPABASE_URL` (ya da `NEXT_PUBLIC_SUPABASE_URL`),
      `SUPABASE_SERVICE_ROLE_KEY` (ya da `SUPABASE_SECRET_KEY`),
      `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `CRON_SECRET` — `openssl rand -hex 32`. **İki zamanlanmış iş de buna
      bağlı** (`/api/cron/reminders`, `/api/cron/backup`) ve ikisi de kapalı
      düşüyor: değişken yoksa istek 401 alır, yani günlük hatırlatma
      postaları HİÇ gitmez ve günlük yedek HİÇ alınmaz. Kapalı düşmek
      bilinçli (bu uçlar bütün depoyu okuyup yazıyor), ama sessiz: dışarıdan
      bakınca uygulama sorunsuz çalışıyor görünür. Ayarlandıktan sonra
      **7) duman testi**ndeki cron satırıyla doğrula.

Önerilen:
- [ ] `NEXT_PUBLIC_SITE_URL` — gerçek alan adı (OG/sitemap/robots mutlak URL).
- [ ] `GEMINI_API_KEY` (+ ops. `GEMINI_MODEL`) — AI özellikleri için.

E-posta (gönderim):
- [ ] `RESEND_API_KEY`, `EMAIL_FROM` — ikisi de yoksa hiçbir posta gönderilmez
      (sessiz değil: `isEmailConfigured()` çağıranlara söyler).
- [ ] `EMAIL_REPLY_TO` — yanıtların döneceği adres.

E-posta (gelen posta, `bilgi@soylus.com`) — **ortam değişkeni gerektirmez**,
hepsi DNS ve Gmail tarafında:
- [ ] `soylus.com` **MX** kayıtları ImprovMX'e bakıyor: `mx1.improvmx.com` (10)
      ve `mx2.improvmx.com` (20), Name boş.
- [ ] Kök **SPF (TXT)**: `v=spf1 include:spf.improvmx.com include:amazonses.com ~all`.
      İkisi birden şart — yalnız ImprovMX yazılırsa uygulamanın Resend'den
      giden postaları yetkisiz görünür.
- [ ] `send` altındaki TXT/MX ve `resend._domainkey` **duruyor**. Bunlar giden
      postanın SPF/DKIM'i; silinirse hatırlatmalar spam'e düşer.
- [ ] ImprovMX'te alias **`bilgi`** (catch-all `*` DEĞİL — `*`, botların
      rastgele adres denemesini kutuya taşır).
- [ ] Gmail'de filtre: `to:bilgi@soylus.com` → "Hiçbir zaman Spam'e gönderme"
      + `Soylus` etiketi. Yönlendirilen posta kimlik doğrulamasını doğal
      olarak zedeler ve bu filtre olmadan Spam'e düşer.
- [ ] Gmail → Hesaplar → "Şu adresten e-posta gönder": `bilgi@soylus.com`,
      SMTP `smtp.resend.com:465`, kullanıcı adı düz `resend`, parola bir
      Resend API anahtarı (yalnız *Sending access* yeter).
- [ ] Aynı sayfada **"Yanıtlarken, iletinin gönderildiği adresten yanıtla"**
      seçili. Olmazsa yanıtlar kişisel Gmail adresinden gider.

Tam liste ve açıklamalar: `.env.local.example`.

## 2) Alan adı ve URL

- [ ] Vercel'de üretim alan adını bağla (DNS).
- [ ] `NEXT_PUBLIC_SITE_URL`'i bu alan adına ayarla.
- [ ] Landing tarayıcı-çerçeve mockup'ındaki metni ("soylus.com") gerçek alan
      adıyla güncelle (isteğe bağlı, `components/Landing.tsx`).

## 3) Analytics

- [ ] Vercel panel > Analytics: **Web Analytics** ve **Speed Insights** aç.
      (Kod zaten `<Analytics/>` + `<SpeedInsights/>` içeriyor.)

## 4) SEO / paylaşım

- [x] favicon, apple-icon, OG/Twitter kartı, manifest, robots, sitemap (kodda).
- [ ] Paylaşım önizlemesini doğrula (ör. Twitter/LinkedIn/WhatsApp'ta linki test et).
- [ ] Yayından sonra `sitemap.xml`'i Google Search Console'a gönder.

## 5) Hukuki

- [ ] Gizlilik Politikası ve Kullanım Şartları'nı bir hukukçuya gözden geçirt.
- [x] Kayıtta açık rıza onay kutusu (kodda).
- [ ] İşletmeci bilgisi ("Bumba Teknoloji") ve iletişim kanalı doğru mu?

## 6) Yedekleme

- [ ] `scripts/backup.mjs` çalıştığını doğrula; günlük yedeği planla.
- [ ] Supabase otomatik yedeği açık mı (plan gerektirir).
- [x] **Harici hedef kararı verildi — hedef açılmayacak** (2026-09-07, ürün
      sahibi). Ayrı bir S3/R2 kovası yerine **kullanıcının kendi cihazındaki
      tek dosyalık HTML yedeği** (#318) geçti. Gerekçe: kova kiralamak bir
      kimlik bilgisi daha yönetmek demek ve deponun tamamı gitse bile veriyi
      elinde tutan kişi ailenin kendisi olduğunda koruma daha sağlam.
- [ ] **Geri yükleme tatbikatı — kapsamı 5 senaryodan 1'e indi.** "Yanlış ağacı
      sildim / yanlış kişiyi sildim / hesabımı sildim / kendi kopyamı istiyorum"
      senaryolarının dördü de uygulamanın kendi düğmeleriyle deneniyor, betik
      ya da kimlik bilgisi istemiyor. Tatbikat yükümlülüğü yalnız **"deponun
      tamamı gitti"** satırı için anlamlı. Tablo: `docs/YEDEKLEME.md` > "Tatbikat".
- [ ] `/api/health` bir izleme aracına bağlandı mı?
      `curl -H "Authorization: Bearer $CRON_SECRET" https://<alan>/api/health`
      → 200 ve `"healthy": true`. Oturum gerektirmeyen tek yol bu.
- Ayrıntı: `docs/YEDEKLEME.md`.

## 7) Yayın sonrası duman testi

- [ ] Kayıt ol → kurtarma kodu → ağaca giriş.
- [ ] Kişi ekle/düzenle, fotoğraf yükle (Cloudinary), harita, kitap, yazdır.
- [ ] AI özellikleri (anahtar varsa): dosyadan içe aktarma + sohbet.
- [ ] Paylaşım linki + salt-okunur görünüm.
- [ ] `/robots.txt`, `/sitemap.xml`, `/manifest.webmanifest`, `/opengraph-image.png` açılıyor.
- [ ] **Zamanlanmış işler gerçekten koşuyor mu?** Vercel > Logs'ta ertesi gün
      `[yedek] …` ve `[hatirlatma] …` satırlarını ara. İkisi de her koşuda tek
      satır yazıyor; satır YOKSA iş hiç koşmamıştır (çoğu zaman `CRON_SECRET`
      eksiktir) ve bu, hiçbir hata üretmeyen bir arıza türüdür. Elle tetiklemek
      için: `curl -H "Authorization: Bearer $CRON_SECRET" https://<alan>/api/cron/backup`
- [ ] `[yedek]` satırında **kopyalanan 0** yazmıyor. Yazıyorsa iş koştu ama
      hiçbir dosya yedeklenmedi — 200 yanıtın içinde saklı bir başarısızlık.
      (Bu tam olarak bir kez oldu: depo `private` olduğu hâlde blob URL'ine düz
      `fetch` atılıyordu.)

## 8) Mağazaya mobil derleme çıkmadan önce

- [ ] **API adresi doğru mu?** `apps/mobile/src/lib/config.ts`, `app.json` ve
      `eas.json` (üç profil) aynı alan adını göstermeli ve o alan adı canlıda
      olmalı. Bu satır bir bulgudan doğdu: mağaza yapılandırması aylarca
      `soyagaci.app`ı gösterdi, oysa doğrulanmış alan adı `soylus.com`.
      Üretim derlemesi açılışta "Bağlantı kurulamadı" ile ölürdü ve bunu
      hiçbir test yakalayamazdı — `apps/` kök tsconfig ve eslint dışında.
- [ ] Bir KURUCU hesabıyla giriş: kişi ekle/düzenle/sil çalışıyor mu?
- [ ] Bir ÜYE hesabıyla giriş: düğmeler "Öneri gönder" diyor mu, gönderilen
      öneri web'deki kuyrukta görünüyor mu?
- [ ] Ağacı web'de değiştirip mobilde bayat ekrandan kaydetmeyi dene:
      "ağaç başka bir yerde değişti" uyarısı çıkmalı (`x-base-version`).

## Gelecek (opsiyonel)

- E-posta ile hesap kurtarma; Supabase Auth göçünün devamı (Faz 3d/3e/4);
  Sentry benzeri hata izleme. Bkz. `docs/YAPILACAKLAR.md`.
