# Soy Ağacı Mobile

Expo tabanlı iOS/Android istemcisi. İlk sürüm mevcut Next.js uygulamasını
native WebView kabuğunda açar; böylece NextAuth oturumu, demo girişi, ağaç
ekranı, GEDCOM aktarımı ve mevcut yetki modeli aynen kullanılır.

## Kurulum

```bash
cd mobile
npm install
npm start
```

Uygulama ilk açılışta web uygulamasının adresini ister. Yerelde test ederken
telefonun bilgisayara ulaşabilmesi için `localhost` yerine bilgisayarın LAN IP
adresini kullan:

```text
http://192.168.1.42:3000
```

Varsayılan bir adresle derlemek istersen `src/config.ts` içindeki
`DEFAULT_SERVER_URL` değerini doldur.

## Kapsam

- iOS/Android için Expo SDK 57
- `react-native-webview` ile mevcut web uygulamasına bağlantı
- URL kaydını cihazda SecureStore ile saklama
- Geri/ileri/yenile/dış tarayıcıda aç kontrolleri
- Sunucu değiştirme ve bağlantı hatası ekranı

Native ekranlara geçiş için iyi sonraki adımlar: aile verisini okuyan
salt-okunur kişiler listesi, kişi detay ekranı ve sonra `/api/family/person`
ile kişi ekleme/düzenleme.
