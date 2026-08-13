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
