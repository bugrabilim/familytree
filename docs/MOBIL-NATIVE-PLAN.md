# Native Mobil Uygulama Planı (iOS + Android)

> **Durum (güncel):** Capacitor (WebView) kaldırıldı. Backend jeton (JWT) kimliği eklendi (PR: mobil altyapı). Expo uygulaması `apps/mobile/` altında kuruldu — **Aşama 0 (temel) + Aşama 1 (giriş/kayıt/kurtarma kodu)** hazır. Çalıştırma: `apps/mobile/README.md`.

> Karar: **gerçek native uygulama** (WebView değil). Yaklaşım: **Expo / React
> Native**. Backend (Next.js API'leri + Supabase) aynen kalır; yalnız arayüz
> native olarak yeniden yazılır. Bu doküman plandır — henüz kod yok.

## 1) Neden Expo (React Native)?
- Tek dil (TS), iki platform; native bileşenler (WebView yok).
- Harita **native** (Apple/Google Maps), kamera/galeri, push, biyometrik giriş.
- Mevcut **saf mantık** (types, ilişki/tarih/isim/harita-projeksiyon/dagre
  yerleşimi, i18n sözlüğü) paylaşılabilir → yeniden yazılan yalnız arayüz.
- Alternatif "tam native (Swift+Kotlin)" iki ayrı kod tabanı; bu boyutta gereksiz.

## 2) Mimari
- **Yeni kod tabanı**: repoda `apps/mobile/` (monorepo) ya da ayrı repo. Öneri:
  aynı repoda `apps/` altında; ortak saf mantık `packages/core`'a taşınır.
- **Yeniden KULLANILAN (yazılmaz)**: `types/family.ts`, `lib/relations`,
  `lib/date`, `lib/name`, `lib/siblings`, `lib/fan`, `lib/roles`, `lib/places`
  (projeksiyon), `lib/tree-layout` (dagre — saf JS), `lib/i18n-dict`.
- **YENİDEN yazılan (arayüz)**: tüm ekranlar/bileşenler (React DOM + Tailwind →
  RN + NativeWind/StyleSheet).
- **Backend değişikliği (kritik)**: bugün giriş **NextAuth çerezi** ile. Native
  için **jeton (JWT) tabanlı** bir yol gerekir:
  - Yeni `/api/mobile/login` (soyadı+şifre → imzalı JWT), `/api/mobile/register`.
  - API rotaları `Authorization: Bearer` jetonunu da kabul etsin (çerez YA DA jeton).
  - Jeton cihazda **SecureStore**'da saklanır.
- **Veri**: RN'de bir API istemcisi (fetch + Bearer). Mevcut uçlar: aile CRUD,
  upload (Cloudinary), ai, gedcom, paylaşım.

## 3) Ekranlar ve aşamalar

| Aşama | Kapsam | Tahmini emek |
|---|---|---|
| 0 — Temel | Expo projesi, expo-router, tema (globals renk token'ları), i18n, API istemcisi, jeton auth + SecureStore | 3–5 gün |
| 1 — Kimlik | Giriş, kayıt (+kurtarma kodu), açılış/onboarding | 3–5 gün (backend jeton auth dâhil) |
| 2 — Veri + liste | Aile verisini yükle, kişi listesi, arama | 3–4 gün |
| 3 — Profil | Kişi profili (drawer→ekran), akraba gezinme | 3–4 gün |
| 4 — Ekle/düzenle | Büyük form, native kamera/galeri→Cloudinary, defin yeri native harita seçimi | 5–7 gün |
| 5 — Ağaç görselleştirme | Native pan/zoom tuval (react-native-skia veya svg+reanimated+gesture-handler) + dagre yerleşimi; soy & yelpaze | 7–12 gün (en zor) |
| 6 — Harita | react-native-maps (native), doğum yerleri + göç | 2–3 gün |
| 7 — Aile kitabı | Native sayfalı/flipbook görünüm | 3–5 gün |
| 8 — AI + paylaşım | AI sohbet/içe aktarma, paylaşım, GEDCOM dışa aktarım | 4–6 gün |
| 9 — Bitiş | Push bildirim, cila, mağaza görselleri, gönderim | 4–6 gün |

**Toplam kabaca ~37–57 iş günü** odaklı çalışma (yinelemeli; kesin değil).

## 4) MVP (ilk yayınlanabilir sürüm)
Aşama 0–4 + **sadeleştirilmiş** bir ağaç görünümü (liste/temel şecere). Böylece
giriş → ağacı gör → kişi ekle/düzenle → fotoğraf çalışır. Ağır tam-etkileşimli
ağaç/kitap sonraki sürümlere. MVP ~ 3–4 hafta odaklı çalışma.

## 5) Ben ne yaparım / sen ne yaparsın
- **Ben (bu repoda)**: proje kurulumu, ortak `packages/core`, tüm ekranlar,
  API istemcisi, backend jeton-auth ekleme, tema/i18n, ekran ekran ilerleme.
- **Sen (makinende)**: `npx expo run:ios` / `run:android` ile cihaz/simülatörde
  çalıştırma; imzalama; App Store / Play Store gönderimi. (Native'de derleme
  her zaman geliştiricinin Mac/Android SDK'sında olur.)
- **Ön koşullar**: Mac + Xcode, Android Studio, Apple Developer (yıllık),
  Google Play (tek sefer).

## 6) Açık kararlar (başlamadan önce netleşmeli)
1. **Kod yeri**: aynı repoda `apps/mobile` (monorepo) mu, ayrı repo mu?
2. **Stil**: NativeWind (Tailwind benzeri) mi, düz StyleSheet mi?
3. **Ağaç görselleştirme hedefi**: tam etkileşimli mi, mobil-öncelikli sade mi
   (MVP için sade önerilir)?
4. **Backend jeton auth**: mevcut backend'e ekleme yapmam onaylanıyor mu?
5. **Capacitor iskelesi**: native'e geçince **kaldırılsın** mı (öneri: evet),
   yoksa geçici mağaza seçeneği olarak dursun mu?
6. **Çevrimdışı**: ne kadar? (MVP'de çevrimiçi; sonra önbellek/senkron.)

## 7) Riskler
- **Ağaç/kitap görselleştirme** en büyük emek; web'deki React Flow/DOM hileleri
  native'de yeniden çözülür. MVP'de sadeleştirerek riski düşürürüz.
- **Auth göçü**: jeton yolu dikkatli yapılmalı (mevcut çerez yolu bozulmadan).
- İki platformun mağaza politikaları (gizlilik formları, hassas veri beyanı).
