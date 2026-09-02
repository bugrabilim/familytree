# Yapılacaklar / Backlog

## Kalıcı kural

- **Her geliştirme/bug/değişikliğin İngilizcesi de yapılır** (i18n TR+EN),
  onay beklemeden. (Kullanıcı talebi, 2026-08-13.)

## Rekabet araştırması #2 (Eylül 2026) — aday işler

Geniş rekabet taraması: **`docs/REKABET-ARASTIRMASI-2.md`** (3 ajan, ~145 arama).
Öne çıkan sonuç: en savunulabilir farkımız soyağacı özellikleri değil, **kültürel
altyapı** (Türkçe akrabalık motoru, 1934 öncesi patronim, e-Devlet PDF, kirve/çevre,
alan bazında gizlilik). NVİ **mevzuat gereği yan soyu (kardeş/amca/dayı/hala/teyze)
veremez** → kalıcı boşluk. Konum: *"e-Devlet size atalarınızı verir. Ailenizi vermez."*

Aday işler (öncelik sırasıyla, hiçbiri onaylanmadı):

1. **Anma Takvimi + bildirim** — ölüm tarihinden 3/7/40/52. gece + sene-i devriye;
   Hicri/Miladi çift takvim; aileye göre açılıp kapanabilir. *(E-postaya bağlı.)*
2. **Aile Bülteni** — otomatik aylık özet e-postası (Trove modeli). *(E-postaya bağlı.)*
3. **Dışa dönük soru motoru + hikâye talebi** — girişsiz cevaplanan haftalık soru.
   *(E-postaya bağlı; `lib/reminders.ts` + `lib/email.ts` zaten hazır.)*
4. **e-Devlet PDF'ini birincil onboarding yapmak** + hemen yan soyu doldurmaya davet.
5. **"Yedi Göbek" tamamlanma ölçeri** — anneanne hattını ayrı puanlar (en çok
   şikâyet edilen e-Devlet eksiğini hedefler). Maliyet/etki oranı en yüksek fikir.
6. **Katkı verici rolü** (contributor ≠ editor) — sektörün en çok istenen özelliği.
7. **Kitapta sesi çalan QR** + mezar QR sayfası (Türkiye'de kurulu pazar).
8. **Osmanlı ↔ modern yer adı sözlüğü** + göç yolu katmanı. *(Index Anatolicus lisansı.)*
9. **Sesli Şecere** — yaşlıdan rehberli ses kaydı → Gemini deşifre → onaylı ağaç kaydı.
10. **Kalıtsal hastalık örüntüsü** görünümü. **Risk yüzdesi ASLA hesaplanmaz.**
11. GEDCOM 7 + **GEDZIP** dışa aktarım (5.5.1 varsayılan KALIR — Ancestry/FTM 5.5
    üstünü reddediyor).
12. Bağlantısız kişi + iki tıkla ebeveyn değiştirme (çok 1-yıldız üretiyor).

**Bilerek yapılmayacaklar:** DNA · kendi kayıt arşivi · ulusal aşiret dizini
(1934 Soyadı Kanunu bağlamı — nötr, kullanıcının yazdığı "sülale" alanı olur) ·
tam klinik genogram sembolojisi · risk skoru · mobilde web'i aynalamak.

## Bekleyen — E-posta altyapısı (sağlayıcı/anahtar kararı bekliyor)

- Doğum/ölüm/evlilik yıl dönümü **e-posta hatırlatmaları** ve üyelik/bildirim/
  paylaşım **işlemsel e-postaları**. Sağlayıcı (Resend/SendGrid/SES), gönderen
  alan adı ve ortam anahtarları kullanıcıdan gelince uygulanacak. Ayrıntı ve
  yapılacaklar: **`docs/EPOSTA-PLANI.md`**.

## Yapıldı — herkese açık salt-okunur paylaşım (üyeliksiz)

- Ağaç sahibi (admin) bir **bağlantı + kod + QR** üretir; bunu bilen herkes
  **üye olmadan** ağacı yalnızca görüntüler. `/g/<token>` (genel), `/g` (kod
  yapıştır). Sahip arayüzü: `ShareDialog` (aç/kapat, yenile, yaşayanları gizle).
- Salt-okunur + gizlilik `role=viewer`/`publicView` ile zorlanır; sunucu API'si
  zaten anonim ziyaretçiye yazma vermez (401). Jeton tahmin-edilemez bearer.
- QR sunucuda üretilir (`qrcode`), istemciye PNG data-URL olarak gider.

## Yapıldı — çok-biçimli aktarım + MyHeritage incelemesi

- MyHeritage incelemesi: `docs/MYHERITAGE-INCELEME.md`.
- İçe/dışa aktarım artık **GEDCOM + CSV + JSON** (`lib/import.ts`, biçim otomatik
  algılanır; CSV/JSON'da id/baba/anne/eş ile bağlar korunur). Testler:
  `tests/import.test.mts`.
- Sonraki fikir: GEDCOM dışa aktarımında fotoğraf URL'lerini `OBJE` olarak yaz
  (medya taşınsın).

## Bekleyen — Supabase Auth devamı (sonra yapılacak)

3b+3c PR #48'de. Bayrak (`SUPABASE_AUTH_LOGIN`) kullanıcı hazır olunca açılacak.
Sonraki adımlar (ayrı PR'lar):

- **Faz 3d — hesapsız (misafir) giriş:** Supabase Anonymous sign-in. Özellikle
  mobil için; kullanıcı kaydolmadan ağaç oluşturup gezebilir.
- **Faz 3e — gerçek e-posta ile bağlama:** sentetik iç e-postayı kullanıcının
  gerçek e-postasıyla değiştirip hesabı kalıcılaştırma (doğrulama + parola
  sıfırlama Supabase akışlarıyla).
- **Faz 4 — eski yolu kaldırma:** tüm hesaplar Auth'a taşınınca bcrypt yedeğini
  ve Blob `users.json` kimlik deposunu emekliye ayır.

Ayrıntı: `docs/SUPABASE-GECIS.md`.

### Not — e-posta bağlamak (2026-08-19 görüşmesi)

Uygulama e-posta olmadan tam çalışıyor: giriş = soyadı + şifre, kurtarma =
**kurtarma kodu**, davet/paylaşım = link/jeton. Şu an tek gerçek boşluk:
kullanıcı **hem şifresini hem kurtarma kodunu** kaybederse hesap kurtarılamıyor.

- **İsteğe bağlı e-posta ile şifre sıfırlama** eklenebilir (asıl fayda: kurtarma
  güvenlik ağı). Faz 3e ile örtüşür.
- Gerektirir: bir **e-posta sağlayıcısı** (Resend/Postmark/SMTP) + API anahtarı/env.
- Gizlilik: **isteğe bağlı ve gizli** tutulmalı; kullanıcının kişisel e-postası
  asla herkese açık yüzeyde gösterilmez.
- Karar: lansman için **şart değil**; ileride istenirse eklenecek.

---

## Bug listesi (kullanıcı bildirimi — TAMAMLANDI ✓, PR #48)

1. ✓ Panel özet rakamları tıklanabilir → ilgili kişileri alt pencerede listeler.
2. ✓ Panel: cinsiyet dağılımı donut (pasta) grafiği + tıklanabilir açıklama.
3. ✓ Liste gelişmiş filtre → Eğitim'e "Okul bilgisi yok" seçeneği.
4. ✓ Meslek: ağaçtaki mesleklerden datalist + Türkçe-duyarlı eşleşme
   (ogretmen → Öğretmen).
5. ✓ Zaman: yalnız dikey kaydırma; sağa kayma giderildi, yıllar üstte yapışık.
6. ✓ Panel: "Yaşayan en yaşlılar" ve "En gençler" kartları.
7. ✓ Panel: "En uzun yaşamışlar" (yaşayan/ölmüş, en yüksek yaş).
8. ✓ Panel: doğuştan/sonradan rahatsızlık, ölüm nedeni, cinsel yönelim,
   çok eşlilik, birden çok evlilik (yalnız veri varsa; maskeli; tıklanır).
9. ✓ Yelpaze: boş alana tıklayınca profil kapanır.
10. ✓ Yelpaze: dilimlerde yalnız isim (patronim/soyad değil).
11. ✓ "Torunlar" görünümü kaldırıldı.
12. ✓ İlk yüklemede profil paneli kendiliğinden açılmaz (demo dâhil).
13. ✓ Üç-nokta menüsü artık açık profilin üstünde (z-index).
14. ✓ Fotoğraf yoksa avatar her zaman otomatik üretilir.
15. ✓ Baba adı varsa soyad zorunlu değil.
16. ✓ Esnek tarih girişi ("01022022", / ve - ayraçları, AAYYYY, YYYY).
