# Soy Ağacı

Ailenin hikâyesini kuşaklar boyu tutan, Türkçe bir soy ağacı uygulaması.

## Ne yapar

**Tek bir çalışma alanı, dört görünüm.** Sayfa değiştirmeden aynı veriye dört
farklı açıdan bakarsın:

| Görünüm | Ne gösterir |
|---|---|
| **Ağaç** | Seçili kişinin çevresi; eşler yan yana, çocuklar altta (dagre + birlik düğümü). Kuşak derinliği 0–8 ya da tümü; **tık** ile gezin/merkeze al, **çift tık** ile detay aç, yakınlaştırınca gizlenen bilgiler geri gelir |
| **Soy** | Seçilen kişi **merkezde**; solda atalar, sağda torunlar — yatay kum saati şeceresi (seçilen kuşak kadar geri ve ileri) |
| **Liste** | Herkes; arama, sıralama ve "yaşayan / vefat / bağsız" süzgeçleri |
| **Panel** | Genişletilmiş istatistikler, yaklaşan doğum günleri, akrabalık hesaplayıcı ve "kişinin tüm akrabaları" bulucu (ör. birinin halası kim) |

**Akrabalık ağaç üzerinden kurulur.** Kişi ekleyip sonra kutucuk işaretlemek
yerine, kartın kenarındaki `+` düğmesine basıp doğrudan "anne ekle", "eş ekle",
"çocuk ekle" dersin. Bağlar iki yönlü olarak kendiliğinden kurulur.

**Türkçe akrabalık hesabı.** Amca mı dayı mı, hala mı teyze mi, babaanne mi
anneanne mi — uygulama iki kişi arasındaki en kısa yolu bulup doğru terimi
üretir; iyelik ve ilgi ekleriyle birlikte: *"Deniz'in büyük halası"*. Panelde
bir kişiyi seçip "hala" yazarak o kişinin bütün halalarını tek tıkla
bulabilirsin.

**Verin sende kalır.** GEDCOM (`.ged`) ile içe/dışa aktarım — MyHeritage,
Ancestry, FamilySearch, Gramps ve diğerleriyle uyumlu.

**Gerçek hayat karmaşıktır.** Çok eşlilik, boşanma, akraba evliliği, evlat
edinme, koruyucu aile, evlatlıktan reddetme, ikili olmayan cinsiyet
kimlikleri, erken yaşta ebeveynlik ve bilinmeyen tarihler veri modelinde
yerini bulur — hepsi zorlama olmadan. Kopan ilişkiler bağı silmez; ağaçta
durur, yalnızca not düşülür. Soyadı da tek kalıba sığmaz: kadın kızlık
soyadını sürdürebilir, eşine kendi soyadını verebilir ya da çift soyad
kullanabilir. Sağlık alanları ayrışmıştır — **doğuştan durum**, **yaşarken
edinilen rahatsızlık** ve **ölüm nedeni** ayrı ayrı tutulur ve listede
süzgeç olarak kullanılır; kişiyi tanımlayan değil, hakkında bilinen sade
birer satır.

Ayrıca: koyu/açık tema, `⌘K` ile anlık arama, mobilde alttan açılan paneller,
Türkçe tarih girişi (`GG.AA.YYYY` ya da sadece `YYYY`) ve otomatik yaş hesabı.

## Demo

Giriş ekranındaki **"Demo ağacını şifresiz incele"** düğmesi, 16 kuşaklık
örnek bir aileyle doğrudan uygulamaya sokar: 1521'den bugüne **300'ü aşkın
kişi**. Hesap herkese açık ve ortaktır; her girişte ağaç baştan yüklendiği
için serbestçe kurcalanabilir.

Kendi hesabına yüklemek istersen: menüden **GEDCOM aktar / al → Demo ağacını
yükle**.

İçinde neler var: Osmanlı klasik çağından tahrir defteri kayıtları; Soyadı
Kanunu öncesi kuşaklar soyadsız — baba adıyla ("Turgud oğlu Mehmed") ve
lakapla ("Topal Süleyman", "Avcı Hüseyin") anılır; 1934'te farklı soyadı
seçen kardeşler; aynı anda iki hayat arkadaşıyla yaşayan bir kadın;
evlenmeden çocuğu olup sonra evlenen, boşanan ve ilk eşiyle yeniden evlenen
biri; torununun torununun çocuğunu gören 107 yaşında bir nine (beş canlı
kuşak); dört ve üç
eşli iki kuşak başı; altı kez evlenip beşinden boşanan biri ve beş evlilik
yapan bir kadın; birinci, ikinci ve üçüncü dereceden kuzen evlilikleri; savaş
ve deprem yetimi evlat edinmeleri; tarihsel "evlatlık" kurumu; evlatlıktan
reddedilenler ve ebeveynini reddedenler; Çanakkale ve Sakarya kayıpları;
Selanik ve Filibe'den muhacirlik; Almanya'ya işçi göçü; **Somali, Venezuela
ve Gana'dan düzensiz göçle gelenler ve memleketteki aileleri**; eşcinsel ve
biseksüel hayatlar; interseks, trans ve ikili olmayan bireyler; bebek
ölümleri; kızlık soyadını koruyan, eşine soyadını veren ve çift soyad taşıyan
kadınlar; Down sendromu, doğuştan görme ve işitme engeli, uzuv eksikliği,
çocuk felci ve otizm gibi durumlarla yaşayanlar; on dörtlü yaşlarda anne
olanlar; ve insanın karanlık gerçeklerinden biri — evlilik dışı, çok küçük
yaşta annelik — sükûnetle, gerçeğe sadık kalınarak.

Herkesin bir hikâyesi, herkesin bir avatarı ve **6 haneli benzersiz bir kimlik
kodu** var (289 ile başlar; kartta görünür, aramada kullanılır). Avatarlar
gömülü SVG olarak üretilir — dış servise bağımlılık yok.

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
  relations.ts            Akrabalık hesabı + Türkçe ek çekimi + istatistik
  name.ts                 Ad gösterimi (lakap + patronim + soyad)
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
