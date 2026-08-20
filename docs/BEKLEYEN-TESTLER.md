# Bekleyen kullanıcı testleri / notlar

Bu dosya, kullanıcının "sonra test edeceğim / sorunca hatırlat" dediği maddeleri tutar.

## Kullanıcının sonra test edeceği özellikler

- **Üyeler ve davetler** (⋮ → Paylaş → "Üyeler ve davetler"): davet oluşturma,
  üye rolleri, katılım akışı (`/join/[token]`). Kullanıcı henüz test etmedi.
- **Bağlı ağaçlar (eşleştirme)** (⋮ → Paylaş → "Bağlı ağaçlar"): iki ağacı
  eşleştirme, karşılaştırma (`/pair/...`). Kullanıcı henüz test etmedi.

Kullanıcı bu başlıkları sorduğunda yukarıdaki akışları birlikte gözden geçir.

## Herkese açık paylaşım — mevcut durum (madde 7)

İstenen (QR + şifresiz giriş + yalnız görüntüleme) **zaten mevcut**:
⋮ → Paylaş → "Paylaş (herkese açık)" bir bağlantı + **QR kod** üretir. Bağlantı
`/g/<token>` sayfasını açar; **şifre istemez** ve `publicView` ile **salt-okunur**
gelir (düzenleme kapalı). Ayrıca yaşayanları gizleme sahibin tercihine kilitlenir.
