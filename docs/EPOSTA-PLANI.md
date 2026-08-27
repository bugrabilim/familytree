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

## Kullanıcının istediği e-posta yetenekleri (2026-08 notu)

> "Eposta işleri yapılacaklar notlarında tut, sonra sorunca söylersin."
> **Aşağıdakiler henüz YAPILMADI** — anahtarlar geldiğinde sırayla ele alınacak.

1. **Bildirimler.** Ağaçta olan biten için e-posta: yeni kişi eklendi, biri
   profilini güncelledi, davet kabul edildi, paylaşım bağlantın görüntülendi.
   Sıklık ayarı: anında / günlük özet / haftalık özet.
2. **E-posta kutusu (uygulama içi).** Gönderilen bildirimlerin uygulama
   içinde de okunabildiği bir "gelen kutusu" — e-postayı kaçıranlar için.
3. **Üyelik için otomatik cevap.** Kayıt olunca hoş geldin e-postası: ağaç
   adı, ilk adımlar (e-Devlet yükle / kişi ekle), destek bağlantısı.
4. **Şifremi unuttum.** Tek kullanımlık, süreli sıfırlama bağlantısı.
   *Not:* giriş "soyadı + şifre" olduğundan, önce hesaba doğrulanmış bir
   e-posta bağlanmalı (Ayarlar'daki `notifyEmail` alanı bunun temeli).
5. **QR / bağlantı paylaşımı.** Paylaşım bağlantısını ve QR görselini
   doğrudan e-postayla gönder ("aileye yolla" düğmesi).

### Ek fikirler (hayal gücü)

- **Davet e-postası + tek tıkla katılım.** Üyeye özel bağlantı; tıklayınca
  ağaca doğrudan katılır.
- **Yıllık "aile albümü" e-postası.** Yıl sonunda: eklenen kişiler, doğanlar,
  kaybedilenler, en çok fotoğraf yükleyen — küçük bir yıllık özet.
- **Anma günü mektubu.** Vefat yıl dönümünde, o kişinin fotoğrafı ve
  anılarından bir alıntıyla sade bir anma e-postası.
- **"Bu kişiyi tanıyor musunuz?"** Eksik bilgili kişiler için aileye toplu
  soru; yanıtlar doğrudan kayda işlenir.
- **Yedek e-postası.** Aylık olarak ağacın GEDCOM/JSON yedeğini hesap
  sahibine ekli gönder (veri kaybına karşı güven).
- **Değişiklik özeti (digest).** "Bu hafta 12 güncelleme yapıldı" + geri alma
  bağlantısı — güncelleme günlüğüyle birleşir.
- **E-postayla içerik ekleme.** Aileye özel bir adrese fotoğraf/metin
  gönderilince ilgili kişiye anı olarak eklensin.
- **Paylaşım uyarısı.** Herkese açık bağlantı ilk kez görüntülendiğinde
  ya da süresi dolmak üzereyken sahibine bilgi ver.

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
