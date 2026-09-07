# Soy Ağacı — Native Mobil (Expo / React Native)

Gerçek native iOS/Android uygulaması. Backend (web'deki Next.js API'leri) aynen
kullanılır; kimlik **jeton (JWT)** ile taşınır (`/api/mobile/login|register`).

## Kurulum ve çalıştırma
```bash
cd apps/mobile
npm install
# Sürümleri Expo SDK ile hizala (önerilir):
npx expo install --fix

# Backend adresini ver (üretim ya da yerel bilgisayarının IP'si):
#   üretim:  app.json > expo.extra.apiBaseUrl  (ya da)
#   env:     EXPO_PUBLIC_API_URL=https://alanadin.com
# Yerel test: EXPO_PUBLIC_API_URL=http://<bilgisayar-ip>:3000 npx expo start

npx expo start          # QR ile Expo Go / dev client
npx expo run:ios        # iOS (Mac + Xcode)
npx expo run:android    # Android (Android Studio)
```

## Yapı
- `app/` — expo-router ekranları
  - `_layout.tsx` — SafeArea + AuthProvider + Stack
  - `index.tsx` — açılış yönlendirmesi (jeton varsa uygulama, yoksa giriş)
  - `(auth)/login.tsx`, `(auth)/register.tsx` — kimlik
  - `(app)/home.tsx` — kişi listesi + arama (ana ekran) + kişi ekle FAB
  - `(app)/person/[id].tsx` — kişi profili (bilgiler + bağlar + "ağaçta gör")
  - `(app)/person/new.tsx` — yeni kişi (isteğe bağlı ilişki bağı ile)
  - `(app)/person/edit/[id].tsx` — kişi düzenle/sil
  - `(app)/tree.tsx` — gezilebilir ağaç (odak kişi çevresinde)
  - `(app)/map.tsx` — yerler (doğum/defin) → Google Maps
  - `(app)/book.tsx` — aile kitabı (yatay kaydırmalı sayfalar)
  - `(app)/ai.tsx` — yapay zekâ soru-cevap
  - `(app)/menu.tsx` — hesap bilgisi + gezinme + paylaş + çıkış
- `src/lib/`
  - `config.ts` — API kök adresi (`https://soylus.com`)
  - `roles.ts` — ROL KURALININ TEK YERİ (eski rol adlarını çevirir; her yetki
    kararı buradan geçer)
  - `api.ts` — Bearer'lı fetch istemcisi + kimlik/CRUD/AI/upload uçları
  - `auth.tsx` — jeton bağlamı (SecureStore ile kalıcı)
  - `family.tsx` — ağaç verisini bir kez çekip tüm ekranlara veren bağlam
  - `types.ts` / `format.ts` / `places.ts` — Person tipi + biçimlendirme + harita bağlantısı
  - `theme.ts` / `styles.ts` / `BrandMark.tsx` — tasarım
- `src/components/` — `PersonAvatar`, `PhotoPicker`, `PersonForm`

## Durum
- ✅ Aşama 0–1 (temel + kimlik: giriş/kayıt/kurtarma kodu, jeton).
- ✅ Aşama 2 (kişi listesi + isim/yıl/yer araması, pull-to-refresh, gökkuşağı kartlar).
- ✅ Aşama 3 (kişi profili: bilgiler + ebeveyn/eş/çocuk bağları arasında gezinme).
- ✅ Aşama 4 (kişi ekle/düzenle/sil + native kamera/galeri fotoğrafı → Cloudinary).
- ✅ Aşama 5 (gezilebilir ağaç görünümü).
- ✅ Aşama 6 (yerler ekranı → Google Maps).
- ✅ Aşama 7 (aile kitabı — yatay sayfalar).
- ✅ Aşama 8 (yapay zekâ soru-cevap).
- ⚠️ "Ağacı paylaş" **gerçek paylaşım bağlantısı üretmiyor**: sistem paylaşım
  sayfasına yalnız sitenin kök adresini gönderiyor. `/api/tree/share` (ve
  `/g/<jeton>` bağlantısı, kapsam seçimi) mobilde henüz yok.
- ⏭️ Aşama 9 (mağaza derlemesi + push): aşağıya bakın. Bkz. `docs/MOBIL-NATIVE-PLAN.md`.

## Mağaza derlemesi (EAS)
`eas.json` hazır. Gerçek `.ipa`/`.aab` üretmek ve mağazaya göndermek için (kendi
makinende, Expo/Apple/Google hesaplarıyla):
```bash
npm i -g eas-cli
eas login
eas build:configure
eas build --platform ios        # App Store için .ipa
eas build --platform android    # Play Store için .aab
eas submit --platform ios       # App Store Connect'e gönder
eas submit --platform android   # Play Console'a gönder
```
Üretim API adresi `eas.json`un ÜÇ profilinde de (`development`/`preview`/
`production`) `EXPO_PUBLIC_API_URL` olarak yazılı, ayrıca `app.json >
expo.extra.apiBaseUrl` ve `src/lib/config.ts` içinde. Beşi de `https://soylus.com`
olmalı; biri unutulursa hangi profille derlendiğine bağlı olarak uygulama
açılışta "Bağlantı kurulamadı" der.

## Roller ve katkı akışı
İki kademe var (`lib/roles.ts` — sunucudaki `types/user.ts` + `lib/roles.ts`
ile birebir aynı olmak zorunda):

- **yonetici** — doğrudan yazar (kişi ekle/düzenle/sil, yapay zekâ).
- **uye** — okur ve **önerir**. Formda "Kaydet" yerine "Öneri gönder" çıkar;
  istek `POST /api/family/proposals`a gider ve yönetici onaylayınca ağaca
  işlenir. Kişi uçları (`POST/PUT/DELETE /api/family/person`) üyeye 403 döner.

Telefonda saklı rol **bayat olabilir** (jeton 60 gün geçerli, rolü tazeleyen uç
yok). O yüzden okunan rol her zaman `roles.ts` üzerinden normalleştirilir:
eski adlar (`admin/editor/contributor/viewer`) bugünkü kademeye çevrilir.

## Eşzamanlılık ve oturum
- Yazma istekleri `x-base-version` başlığını taşır (`GET /api/family` →
  `updatedAt`). Sunucu bu başlık **yoksa** çakışma denetimini hiç yapmaz, yani
  başlığı düşürmek sessiz veri kaybı demektir. 409 gelirse form kırmızı bir
  uyarı ve "Yenile" düğmesi gösterir.
- Sunucudan **401** gelen her jetonlu istek oturumu temizler ve kullanıcıyı
  giriş ekranına atar (sebebi orada yazar). Hesabı silinmiş ya da ağaçtan
  çıkarılmış kullanıcı sonsuz "Unauthorized" ekranında kalmasın diye.

## Bilinen sonraki adımlar
- **GEDCOM dışa aktarma:** `/api/family/export` Bearer ile çekilip cihazda
  dosyaya yazılıp paylaşılabilir (`expo-file-system` + `expo-sharing` gerekir).
- **Öneri kuyruğu ekranı:** üye kendi önerilerini (`GET /api/family/proposals`)
  ve durumlarını mobilde göremiyor; gönderdikten sonra sonucu ancak ağaç
  değişince anlıyor. Geri çekme (`/proposals/withdraw`) da yok.
- **Gizlilik ("view") katmanı:** `GET /api/family` HAM veri döndürüyor ve
  maskeleme web'de istemci tarafında yapılıyor (`lib/privacy.ts`). Mobilde
  karşılığı yok — üye, gizli/yaşayan kişilerin tüm alanlarını görüyor.
- **Hesabı geri getirme:** web'de girişte "hesabını geri getir" kutusu var
  (`POST /api/account/restore`); mobilde yok.
- **Çoklu ağaç:** `apiFetch` `x-tree-id` başlığını destekliyor ama hiçbir çağrı
  yerinde verilmiyor; kurucu mobilde hep ana ağacını görüyor.
- **Push bildirimleri:** doğum günü/yıldönümü bildirimleri için `expo-notifications`
  + sunucuda cihaz-jetonu deposu ve gönderim işi gerekir (backend işi).

## Not
Bu paket web derlemesinden ayrıdır; kök `tsconfig`/eslint `apps/` klasörünü hariç
tutar. Cihazda çalıştırma ve mağaza gönderimi Mac + Xcode/Android Studio ve
Apple/Google hesaplarıyla senin makinende yapılır.
