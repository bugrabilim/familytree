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
- Ayrıntı: `docs/YEDEKLEME.md`.

## 7) Yayın sonrası duman testi

- [ ] Kayıt ol → kurtarma kodu → ağaca giriş.
- [ ] Kişi ekle/düzenle, fotoğraf yükle (Cloudinary), harita, kitap, yazdır.
- [ ] AI özellikleri (anahtar varsa): dosyadan içe aktarma + sohbet.
- [ ] Paylaşım linki + salt-okunur görünüm.
- [ ] `/robots.txt`, `/sitemap.xml`, `/manifest.webmanifest`, `/opengraph-image.png` açılıyor.

## Gelecek (opsiyonel)

- E-posta ile hesap kurtarma; Supabase Auth göçünün devamı (Faz 3d/3e/4);
  Sentry benzeri hata izleme. Bkz. `docs/YAPILACAKLAR.md`.
