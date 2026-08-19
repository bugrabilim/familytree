# iOS & Android — Capacitor ile mağaza uygulaması

Uygulama sunucu-taraflı bir Next.js sitesidir. Capacitor kabuğu, üretimdeki
siteyi bir WebView'de yükler (`server.url`) ve üstüne native yetenekler
(durum çubuğu, splash, klavye; ileride kamera/paylaş) ekler. Tek kod tabanı,
iki mağaza.

## Önkoşullar
- **iOS**: macOS + Xcode + bir Apple Developer hesabı (yıllık ücretli).
- **Android**: Android Studio + JDK + bir Google Play Developer hesabı (tek
  seferlik ücret).
- Node 20+ ve bu repo (bağımlılıklar kurulu).

## 1) Alan adını ayarla
`capacitor.config.ts` içindeki `SERVER_URL` varsayılanı `https://soyagaci.app`.
Kendi üretim alan adını ver:
- ya `capacitor.config.ts`'te `SERVER_URL` değerini düzenle,
- ya da ortamdan: `CAP_SERVER_URL=https://alanadin.com npm run cap:sync`.

> `appId` şu an `com.bumbateknoloji.soyagaci`. Mağaza kimliğin farklıysa değiştir
> (bir daha değiştirmesi zordur; baştan doğru seç).

## 2) Native projeleri oluştur (tek sefer)
```bash
npm install
npx cap add ios
npx cap add android
```
Bu `ios/` ve `android/` klasörlerini üretir (repoda `.gitignore`'da; istersen
commit'leyebilirsin).

## 3) İkon ve splash üret
Kaynak görseller `resources/icon.png` (1024²) ve `resources/splash.png` (2732²).
```bash
npm run cap:assets
```
Tüm boyutları iki platform için üretir.

## 4) Senkronize et ve aç
```bash
npm run cap:ios       # Xcode'da açar
npm run cap:android   # Android Studio'da açar
```
Xcode/Android Studio'da bir cihaz/simülatörde çalıştır.

## 5) Native değeri güçlendir (App Store 4.2 için önerilir)
Salt "web sitesi" kabuğu Apple tarafından reddedilebilir. Değer katan eklentiler:
- **Kamera** (`@capacitor/camera`) — kişi fotoğrafını çekip yüklemek.
- **Paylaş** (`@capacitor/share`), **Haptics**, **Push Notifications** (ileride).
- Durum çubuğu + splash zaten yapılandırıldı.
Bunları web tarafında köprüleyerek (fotoğraf yükleme akışına kamera seçeneği)
"gerçek uygulama" hissini artır.

## 6) Güvenli alan (çentik)
`ios.contentInset: "always"` iOS'ta içeriği durum çubuğunun altına iter.
Cihazda çakışma görürsen ilgili sabit başlıklara `env(safe-area-inset-*)`
dolgusu ekle.

## 7) Mağaza gönderimi
- **iOS**: Xcode > Product > Archive > Distribute > App Store Connect. Uygulama
  gizlilik "nutrition label"ını doldur (bu app hassas veri de tutabilir; bkz.
  Gizlilik Politikası).
- **Android**: Android Studio > Build > Generate Signed Bundle (AAB) > Play
  Console'a yükle. Data safety formunu doldur.
- Her iki mağaza için: ekran görüntüleri, açıklama, gizlilik politikası URL'i
  (`/privacy`), destek iletişimi gerekir.

## Güncellemeler
Web tarafı (site) her deploy'da anında güncellenir — kabuk aynı URL'i yüklediği
için mağaza güncellemesi GEREKMEZ. Yalnız native katman (eklenti/ikon/config)
değişince yeni bir mağaza sürümü gönderilir.

## Notlar
- Çevrimdışı: ağ yokken `mobile-shell/index.html` yedek ekranı görünür.
- Derleme/gönderim adımları bu repoda otomatikleştirilemez (Xcode/Android SDK +
  imzalama sertifikaları senin makinende olmalı).
