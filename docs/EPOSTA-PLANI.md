# E-posta altyapısı — geliştirme planı (backlog)

Kullanıcı talebi (2026-08): Uygulama **e-posta gönderebilmeli**. İki başlık:

1. **Hatırlatmalar (#3):** Doğum günü / ölüm yıl dönümü / evlilik yıl dönümü
   gibi günlerde ilgili kullanıcıya e-posta hatırlatması.
2. **İşlemsel e-postalar (#4):** Üyelik/giriş (davet, doğrulama, şifre
   sıfırlama), bildirimler ve QR/bağlantı paylaşımı e-postayla gönderme.

## Neden henüz yapılmadı — dışarıdan karar/gizli anahtar gerekiyor

E-posta göndermek bir **sağlayıcı hesabı + API anahtarı + doğrulanmış gönderen
alan adı** ister; bunlar kod içinde üretilemez, kullanıcı tarafından
sağlanmalıdır. Karar bekleyenler:

- **Sağlayıcı:** Resend (en basit, öneri) / SendGrid / Amazon SES.
- **Gönderen adresi + alan adı:** ör. `noreply@<alanadi>.com` — sağlayıcıda
  SPF/DKIM ile doğrulanmalı.
- **Ortam değişkenleri (Vercel):** ör. `RESEND_API_KEY`, `EMAIL_FROM`.

## Yapılacaklar (anahtar gelince uygulanacak)

- [ ] `lib/email.ts` — sağlayıcıdan bağımsız ince soyutlama (`sendEmail({to,
      subject, html})`). Anahtar yoksa no-op + günlükleme (geliştirmede güvenli).
- [ ] Hesap ayarı: **bildirim e-posta adresi + onay (opt-in)** ve hangi
      hatırlatmaların isteneceği. Depolama: kullanıcı kaydı (Blob/Supabase).
- [ ] **Günlük zamanlanmış iş** (Vercel Cron `vercel.json`) — o gün olan
      doğum/ölüm/evlilik yıl dönümlerini bulup opt-in kullanıcılara özet e-posta.
      Gizlilik: yaşayan kişilerin verisi maskeleme/izinlere uygun ele alınmalı.
- [ ] İşlemsel akışlar: davet/doğrulama/şifre sıfırlama ve paylaşım bağlantısı/
      QR e-postayla gönderme uçları aynı `lib/email.ts` üzerinden.
- [ ] i18n (TR+EN) e-posta şablonları; abonelikten çıkma (unsubscribe) bağlantısı.
- [ ] KVKK/GDPR: açık rıza, kolay çıkış, gönderen kimliği.

## Notlar

- Takvim hatırlatması (ayrı, tamamlandı): kullanıcı doğum günü vb. olayları
  Google/Apple(.ics)/Yahoo/Outlook takvimine ekleyebiliyor (`lib/calendar.ts`).
  E-posta hatırlatması bundan bağımsız bir kanaldır.
