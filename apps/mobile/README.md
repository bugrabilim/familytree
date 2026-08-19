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
  - `(app)/home.tsx` — kişi listesi + arama (ana ekran)
  - `(app)/person/[id].tsx` — kişi profili (bilgiler + ebeveyn/eş/çocuk bağları)
  - `(app)/menu.tsx` — hesap/ağaç bilgisi + çıkış
- `src/lib/`
  - `config.ts` — API kök adresi
  - `api.ts` — Bearer'lı fetch istemcisi + kimlik uçları
  - `auth.tsx` — jeton bağlamı (SecureStore ile kalıcı)
  - `family.tsx` — ağaç verisini bir kez çekip tüm ekranlara veren bağlam
  - `types.ts` / `format.ts` — Person tipi + isim/tarih/kimlik biçimlendirme
  - `theme.ts` / `styles.ts` / `BrandMark.tsx` — tasarım
- `src/components/PersonAvatar.tsx` — fotoğraf ya da baş harfli avatar

## Durum
- ✅ Aşama 0 (temel) + Aşama 1 (kimlik: giriş/kayıt/kurtarma kodu, jeton depolama).
- ✅ Aşama 2 (kişi listesi + isim/yıl/yer araması, pull-to-refresh, gökkuşağı kartlar).
- ✅ Aşama 3 (kişi profili: bilgiler + ebeveyn/eş/çocuk bağları arasında gezinme).
- ⏭️ Sonraki: kişi ekle/düzenle (native kamera + harita) → ağaç görünümü → harita
  → kitap. Bkz. `docs/MOBIL-NATIVE-PLAN.md`.

## Not
Bu paket web derlemesinden ayrıdır; kök `tsconfig`/eslint `apps/` klasörünü hariç
tutar. Cihazda çalıştırma ve mağaza gönderimi Mac + Xcode/Android Studio ve
Apple/Google hesaplarıyla senin makinende yapılır.
