# Soy Ağacı

Ailenin hikâyesini kuşaklar boyu tutan, Türkçe bir soy ağacı uygulaması.

## Ne yapar

**Tek bir çalışma alanı, dört görünüm.** Sayfa değiştirmeden aynı veriye dört
farklı açıdan bakarsın:

| Görünüm | Ne gösterir |
|---|---|
| **Ağaç** | Tüm aile; eşler yan yana, çocuklar altta (dagre + birlik düğümü yerleşimi) |
| **Soy** | Seçilen kişinin doğrudan ata çizgisi, klasik şecere tablosu (2–6 kuşak) |
| **Liste** | Herkes; arama, sıralama ve "yaşayan / vefat / bağsız" süzgeçleri |
| **Panel** | Özet sayılar, yaklaşan doğum günleri, akrabalık hesaplayıcı |

**Akrabalık ağaç üzerinden kurulur.** Kişi ekleyip sonra kutucuk işaretlemek
yerine, kartın kenarındaki `+` düğmesine basıp doğrudan "anne ekle", "eş ekle",
"çocuk ekle" dersin. Bağlar iki yönlü olarak kendiliğinden kurulur.

**Türkçe akrabalık hesabı.** Amca mı dayı mı, hala mı teyze mi, babaanne mi
anneanne mi — uygulama iki kişi arasındaki en kısa yolu bulup doğru terimi
üretir; iyelik ve ilgi ekleriyle birlikte: *"Deniz'in büyük halası"*.

**Verin sende kalır.** GEDCOM (`.ged`) ile içe/dışa aktarım — MyHeritage,
Ancestry, FamilySearch, Gramps ve diğerleriyle uyumlu.

**Gerçek hayat karmaşıktır.** Çok eşlilik, boşanma, akraba evliliği, evlat
edinme, koruyucu aile, evlatlıktan reddetme, ikili olmayan cinsiyet
kimlikleri ve bilinmeyen tarihler veri modelinde yerini bulur — hepsi
zorlama olmadan. Kopan ilişkiler bağı silmez; ağaçta durur, yalnızca not
düşülür.

Ayrıca: koyu/açık tema, `⌘K` ile anlık arama, mobilde alttan açılan paneller,
Türkçe tarih girişi (`GG.AA.YYYY` ya da sadece `YYYY`) ve otomatik yaş hesabı.

## Demo

Giriş ekranındaki **"Demo ağacını şifresiz incele"** düğmesi, 11 kuşaklık
örnek bir aileyle doğrudan uygulamaya sokar: 1730'lardan bugüne **194 kişi**.
Hesap herkese açık ve ortaktır; her girişte ağaç baştan yüklendiği için
serbestçe kurcalanabilir.

Kendi hesabına yüklemek istersen: menüden **GEDCOM aktar / al → Demo ağacını
yükle**.

İçinde neler var: Soyadı Kanunu öncesi lakaplar ve 1934'te farklı soyadı seçen
kardeşler; dört ve üç eşli iki kuşak başı; altı kez evlenip beşinden boşanan
biri ve beş evlilik yapan bir kadın; birinci, ikinci ve üçüncü dereceden kuzen
evlilikleri; savaş yetimi ve deprem yetimi evlat edinmeleri; tarihsel
"evlatlık" kurumu; evlatlıktan reddedilenler ve ebeveynini reddedenler;
Çanakkale ve Sakarya kayıpları; Selanik ve Filibe'den muhacirlik; Almanya'ya
işçi göçü; bebek ölümleri; interseks, trans ve ikili olmayan bireyler.

Avatarlar gömülü SVG olarak üretilir — dış servise bağımlılık yok.

## Teknoloji

- **Next.js 16** (App Router) + TypeScript + Tailwind v4
- **NextAuth v5** — aile soyadı + şifre, kurtarma kodlu sıfırlama
- **Vercel Blob** — aile verisi (özel erişim, JSON)
- **Cloudinary** — fotoğraflar
- **@xyflow/react + dagre** — ağaç görselleştirme

## Kurulum

```bash
npm install
cp .env.local.example .env.local   # değerleri doldur
npm run dev
```

Gerekli ortam değişkenleri için `.env.local.example` dosyasına bak.

## Proje yapısı

```
app/
  tree/Workspace.tsx      Çalışma alanı — görünümler, paneller, kısayollar
  api/family/…            Kişi CRUD, GEDCOM aktar/al
components/
  FamilyTree.tsx          Ağaç tuvali (birlik düğümlü yerleşim)
  PedigreeView.tsx        Şecere tablosu
  ListView.tsx            Liste + süzgeçler
  PanelView.tsx           Özet ve akrabalık hesaplayıcı
  PersonDrawer.tsx        Kişi ayrıntı paneli
  PersonForm.tsx          Ekleme / düzenleme formu
  ui/                     Avatar, Button, Modal
lib/
  relations.ts            Akrabalık hesabı + Türkçe ek çekimi
  date.ts                 Türkçe tarih ayrıştırma / doğrulama / yaş
  gedcom.ts               GEDCOM ayrıştırıcı ve üretici
  actions.ts              İstemci API sarmalayıcıları
  demo-data.ts            11 kuşaklık demo ağacı + avatar üretici
  demo-account.ts         Şifresiz demo hesabı
  useEscapeKey.ts         Katmanlı ESC yönetimi
tests/                    node --experimental-strip-types ile çalışır
```

## Test

```bash
npm test
```

Akrabalık terimleri, Türkçe ek çekimi, GEDCOM gidiş-dönüşü ve demo verisinin
bütünlüğü (referanslar, tarih tutarlılığı, döngü kontrolü) doğrulanır.

Yol haritası ve pazar analizi: [`docs/GELISTIRME-PLANI.md`](docs/GELISTIRME-PLANI.md)
