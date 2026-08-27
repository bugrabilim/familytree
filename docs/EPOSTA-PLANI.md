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

## Durum — altyapı kuruldu, anahtar bekliyor (2026-08)

Aşağıdakiler **kodlandı ve no-op-güvenli** (anahtar yoksa hiçbir şey gitmez):

- [x] `lib/email.ts` — sağlayıcıdan bağımsız `sendEmail({to,subject,html,text})`
      (Resend REST). `RESEND_API_KEY`+`EMAIL_FROM` yoksa no-op döner.
- [x] `lib/reminders.ts` — o güne denk gelen doğum günü/anma/evlilik yıl dönümü
      olaylarını üreten saf çekirdek (+ testler).
- [x] Hesap ayarı: **bildirim e-posta adresi + hatırlatma onayı (opt-in)**;
      `User.notifyEmail`/`notifyReminders`, `/api/account/notify`, Ayarlar arayüzü
      (yalnız hesap sahibi). Giriş surname+şifre olduğundan e-posta yalnız burada
      açık onayla saklanır.
- [x] **Günlük Cron** `/api/cron/reminders` (`vercel.json`, her gün 06:00 UTC).
      `CRON_SECRET` ile korunur; opt-in hesaplara o günün özetini gönderir.

**Çalışması için (kullanıcı) — Vercel ortam değişkenleri:**

- `RESEND_API_KEY` — Resend panelinden.
- `EMAIL_FROM` — ör. `Soylus <bilgi@soylus.com>` (alan adı Resend'de doğrulanmış).
- `CRON_SECRET` — rastgele bir dize (Vercel cron isteklerini doğrulamak için).

Bunlar eklenince hatırlatmalar kendiliğinden çalışmaya başlar; kod değişikliği
gerekmez.

## Kalan (isteğe bağlı, sonraki adım)

- [ ] İşlemsel akışlar: davet/doğrulama/şifre sıfırlama ve paylaşım bağlantısı/
      QR e-postayla gönderme uçları aynı `lib/email.ts` üzerinden.
- [ ] i18n (TR+EN) zengin HTML e-posta şablonları; abonelikten çıkma (unsubscribe)
      bağlantısı.
- [ ] Çoklu ağaç: kurucunun sahip olduğu tüm ağaçlar için hatırlatma (şu an yalnız
      ana/ev ağacı).
- [ ] KVKK/GDPR: açık rıza metni, kolay çıkış, gönderen kimliği.

## Notlar

- Takvim hatırlatması (ayrı, tamamlandı): kullanıcı doğum günü vb. olayları
  Google/Apple(.ics)/Yahoo/Outlook takvimine ekleyebiliyor (`lib/calendar.ts`).
  E-posta hatırlatması bundan bağımsız bir kanaldır.
