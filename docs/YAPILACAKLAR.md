# Yapılacaklar / Backlog

## Kalıcı kural

- **Her geliştirme/bug/değişikliğin İngilizcesi de yapılır** (i18n TR+EN),
  onay beklemeden. (Kullanıcı talebi, 2026-08-13.)

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
