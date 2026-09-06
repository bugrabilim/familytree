# Bekleyen kullanıcı testleri / notlar

Bu dosya, kullanıcının "sonra test edeceğim / sorunca hatırlat" dediği maddeleri tutar.

## Kullanıcının sonra test edeceği özellikler

- **Üyeler ve davetler** (⋮ → Paylaş → "Üyeler ve davetler"): davet oluşturma,
  üye rolleri, katılım akışı (`/join/[token]`). Kullanıcı henüz test etmedi.
- **Bağlı ağaçlar (eşleştirme)** (⋮ → Paylaş → "Bağlı ağaçlar"): iki ağacı
  eşleştirme, karşılaştırma (`/pair/...`). Kullanıcı henüz test etmedi.

Kullanıcı bu başlıkları sorduğunda yukarıdaki akışları birlikte gözden geçir.

## Hesap silme kodunun ilk gerçek denemesi (2026-09-06)

Supabase'de kaldırılmış misafir giriş özelliğinden kalma bir kayıt duruyor ve
ürün sahibinin kararıyla ELLE SİLİNMEDİ:

- hesap `7b37a143-e9a9-4d5b-9d3f-9135ea46debb` — "Misafir ağacı 7b37a143"
- 1 ağaç (ana ağaç) + 7 kişi kaydı; oluşturma 2026-09-05
- Blob tarafında da `family-data-7b37a143….json` beklenir

Neden duruyor: hesap silme özelliği bitince **onun üzerinde denenecek**.
Elle silinseydi, kodun gerçekten HER yeri temizlediğini doğrulayacak gerçek
bir örnek kalmazdı — yazdığımız silme yolunun tek sınavı yine kendi
testlerimiz olurdu.

Nasıl ulaşılamaz hâle geldi (silme tasarımını ilgilendiriyor): misafir giriş
kaldırılınca hesaba girmenin yolu kalmadı, ve tek ağacı ANA ağacı olduğu için
"ana ağaç silinemez" kuralı yüzünden ağaç silme de onu alamıyordu. Yani
uygulama hesap oluşturabiliyor ama silemiyordu.

Doğrulama listesi (özellik bitince): `accounts`, `trees`, `people`,
`tree_members`, `tree_invites` satırları gitti mi; Blob'daki ağaç dosyaları
gitti mi; Supabase Auth kullanıcısı gitti mi; geriye yetim satır kaldı mı.

## Herkese açık paylaşım — mevcut durum (madde 7)

İstenen (QR + şifresiz giriş + yalnız görüntüleme) **zaten mevcut**:
⋮ → Paylaş → "Paylaş (herkese açık)" bir bağlantı + **QR kod** üretir. Bağlantı
`/g/<token>` sayfasını açar; **şifre istemez** ve `publicView` ile **salt-okunur**
gelir (düzenleme kapalı). Ayrıca yaşayanları gizleme sahibin tercihine kilitlenir.
