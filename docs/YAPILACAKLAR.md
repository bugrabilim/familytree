# Yapılacaklar / Backlog

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

---

## Bug listesi (kullanıcı bildirimi — düzeltiliyor)

1. Panel: özet tablosundaki rakamlar tıklanabilir olsun (ilgili filtreye götürsün).
2. Panel: özet alanına görsel istatistik (ör. kadın/erkek pasta grafik).
3. Liste gelişmiş filtre: okul bölümüne "okul bilgisi yok" seçeneği ekle.
4. Meslek alanı: girilen verilerden türeyen çoktan-seçmeli; harf/normalizasyon
   toleransı (öğretmen=ogretmen).
5. Zaman sayfası: aşağı indikçe sağa kayma; ortaya gelince daha fazla kaymasın,
   yıllar yukarıdan kaysın.
6. Panel: "yaşayan en yaşlılar" ve "en gençler" alanları.
7. Panel: tüm zamanların (yaşamış/ölmüş dâhil) en yaşlıları.
8. Panel özet: hastalıktan ölenler, doğuştan engelliler, sonradan engelliler,
   LGBT, çok eşlilik, birden fazla evlilik vb. (veri modeli el verdiğince).
9. Yelpaze: boş/kök başındayken profil kapansın.
10. Yelpaze: "Osman oğlu Mehmed" gibi ad tanımlarında yelpazede yalnız isim
    gösterilsin (ön tanım/soyad değil).
11. Torunlar sayfası gereksiz → kaldır (ağaçtan zaten bulunuyor).
12. Demo hesaba girince profil sayfası açık gelmesin.
13. Profil açıkken sağ üstteki üç-nokta menüsü profilin altında kalıyor (z-index).
14. Fotoğraf yoksa avatar otomatik gelsin.
15. Yeni kişi: baba adı varsa soyad zorunluluğu kalksın.
16. Doğum tarihi: "01022022" gibi girişi kabul et / takvim seçici.
