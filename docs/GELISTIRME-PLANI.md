# Soy Ağacı — Geliştirme Planı & Pazar Analizi

> Bu doküman, mevcut uygulamayı global soy ağacı platformları ve açık kaynak
> projelerle karşılaştırır, iç görüler çıkarır ve önceliklendirilmiş bir yol
> haritası önerir. **Hiçbir özellik hemen eklenmek zorunda değil** — bu bir
> tartışma ve referans belgesidir.
>
> Tarih: 2026-08 · Durum: Kademe 1–5 tamamlandı; çoklu ağaç (auth) + gerçek harita tile / DB-ELK ertelendi · Gelecek notları: §8 (mobil app, hesapsız→e-posta giriş, kardeş sıralama)
>
> **Güncelleme (2026-08):** Uygulama arayüzü sektör liderleri (MyHeritage,
> Ancestry, FamilySearch) örnek alınarak baştan tasarlandı. Aşağıdaki bölüm 4
> ve 5 bu doğrultuda güncellendi.

---

## 1. Amaç

Elimizde çalışan, sade, çok kullanıcılı bir soy ağacı uygulaması var. Bu
belgede "acaba neyi kaçırıyoruz, nereye gidebiliriz?" sorusunu piyasadaki
büyük oyuncular ve olgun açık kaynak projeler üzerinden yanıtlıyoruz.

---

## 2. Pazar Manzarası

### Ticari devler

| Platform | Güçlü yanı | Kayıt sayısı | Öne çıkan |
|---|---|---|---|
| **Ancestry** | Kayıt + DNA kralı, web-first | ~60 milyar | Otomatik "ipucu" (hint) sistemi, DNA eşleştirme |
| **MyHeritage** | Uluslararası, çok dilli | ~32 milyar | Avrupa/Doğu Avrupa kayıtları, foto renklendirme/animasyon |
| **FamilySearch** | Tamamen ücretsiz, işbirlikçi | ~66 milyar | Tek ortak "dünya ağacı", ücretsiz erişim |

**Çıkarım:** Bu platformların asıl değeri *devasa kayıt arşivleri* ve *DNA*.
Bizim bunlarla rekabet etmemiz ne mümkün ne de amaç. Onların zayıf olduğu yer:
kişisel, özel, sade bir *aile* deneyimi. Bizim alanımız tam da bu.

### Açık kaynak / self-hosted

| Proje | Yapı | Notlar |
|---|---|---|
| **webtrees** | PHP, self-hosted | En olgun. ~12 çeşit grafik, ince gizlilik kontrolü, GEDCOM, medya, kaynak/atıf. Referans alınacak özellik seti burada. |
| **Gramps Web** | Python, self-hosted | Masaüstü Gramps ile tam uyumlu, güçlü analiz araçları. |
| **Liberu / MGeurts** | PHP | Modern, ölçeklenebilir alternatifler. |

**Çıkarım:** webtrees fiilî bir "özellik sözlüğü". Bir özelliğin gerekliliğini
tartışırken "webtrees bunu nasıl yapıyor?" iyi bir pusula.

### Görselleştirme kütüphaneleri (bizim alanımız)

- **donatso/family-chart** (D3, MIT) — zoom/pan, HTML+SVG kart, `EditTree`
  form API'si, gerçek zamanlı güncelleme. Bizim React Flow yaklaşımımıza en
  yakın modern alternatif.
- **magicsunday/webtrees-fan-chart** — 10 nesle kadar yelpaze (fan) grafiği.
- **d3-dag / d3-pedigree-tree** — kardeş gruplama + kenar kesişimini azaltan
  yerleşim algoritmaları.

---

## 3. İç Görüler (Insights)

1. **GEDCOM her yerde.** `.ged` dosyası sektörün ortak dili — her ciddi
   uygulama import/export destekler. Bu hem *onboarding* (kullanıcı başka
   yerdeki ağacını getirir) hem *veri sahipliği* (kilitlenme yok) demek.
   Küçük bir aile uygulaması için bile en yüksek getirili tek eklenti bu.

2. **Yaşayan kişilerin gizliliği ayrı ele alınıyor.** Tüm olgun araçlar
   "yaşayan kişi" bilgisini gizleme/kısıtlama seçeneği sunar. Türkiye'de KVKK,
   AB'de GDPR açısından da doğru olan bu. Bizde şu an herkes her şeyi görüyor.

3. **Tek tip grafik yetmiyor.** Kullanıcılar aynı veriyi farklı biçimlerde
   görmek istiyor: soy (pedigree), yelpaze (fan), kum saati (hourglass),
   torunlar (descendancy), zaman çizelgesi. Biz şu an tek bir dagre yerleşimi
   sunuyoruz.

4. **Bağlanmayı sağlayan şey "hikâye", kuru veri değil.** Öne çıkan mobil
   uygulamalar yaşam olayı zaman çizelgesi, rehberli anı soruları, hatta sesli
   anı kaydı sunuyor. Doğum-ölüm tarihinden fazlası.

5. **Yaklaşan olaylar etkileşimi artırıyor.** "Önümüzdeki 60 gün: doğum
   günleri, yıldönümleri, anma günleri" gibi bir akış, insanları geri
   getiriyor.

6. **İlişki hesaplayıcı beklenen bir araç.** "X ile Y nasıl akraba?" —
   ortak ata / akrabalık derecesi bulan bir yardımcı neredeyse standart.

7. **Kaynak/atıf ciddiyeti ayırıyor.** "Bu bilgiyi nereden biliyoruz?" —
   belge, sertifika, fotoğraf bağlama. Hobi ile arşiv arasındaki fark.

8. **Rol ayrımı (görüntüleyen / düzenleyen).** Olgun araçlarda herkes
   düzenleyemez; yönetici kimin ne yapabileceğini belirler. Bizim "giriş yapan
   herkes düzenler" modelimiz küçük aileler için tamam, ama büyüdükçe risk.

---

## 4. Mevcut Durumumuz vs. Piyasa (Boşluk Analizi)

### ✅ Elimizde olan
- Çok kullanıcılı kayıt + kurtarma kodu ile şifre sıfırlama
- Cloudinary foto, Vercel Blob (JSON) depolama
- **Tek çalışma alanı, dört görünüm:** ağaç, soy (pedigree), liste, panel
- **Ağaç üzerinden akraba ekleme** — kartın kenarındaki `+` ile doğrudan
  anne/baba/eş/çocuk/kardeş; bağlar çift yönlü kurulur
- **Birlik (union) düğümlü yerleşim** — eşler yan yana, çocuklar ortak
  ebeveyn noktasından dallanır
- **Türkçe akrabalık hesaplayıcı** — amca/dayı, hala/teyze, babaanne/anneanne
  ayrımı; iyelik ve ilgi eki çekimiyle ("Deniz'in büyük halası")
- **GEDCOM import/export** — tam tarih/yıl-ay/yıl, çok satırlı not, evlilik ve
  ebeveyn bağları
- Kişi ayrıntı paneli (sayfa değişimi yok), `⌘K` anlık arama
- Koyu/açık tema, mobilde alttan açılan paneller
- Türkçe tarih girişi (GG.AA.YYYY / YYYY) + doğrulama + otomatik yaş
- Yaklaşan doğum günleri paneli, aile istatistikleri

- **Gerçek dünya karmaşıklığı:** çok eşlilik, boşanma (`formerSpouseIds`),
  akraba evliliği, evlat edinme, ikili olmayan cinsiyet (`gender: "other"`),
  bilinmeyen tarih ve cinsiyet, erken yaşta ebeveynlik
- **Soyadı çeşitliliği:** demo, kadının kızlık soyadını sürdürmesini, eşine
  kendi soyadını vermesini ve çift soyad kullanmasını içerir. (Not: soyadın
  kimden geldiği veri modelinde ayrı tutulmaz, biyografide anlatılır — GEDCOM
  uyumu için `lastName` tek alan olarak kalır.)
- **Ayrışmış sağlık alanları** — `congenitalCondition` (doğuştan),
  `healthCondition` (yaşarken edinilen) ve `deathCause` (ölüm nedeni) ayrı
  tutulur; eski tek alan `healthNote` yalnızca geriye dönük okuma için
  bırakıldı. Üçü de listede süzgeç olarak var. Demo Down sendromu, doğuştan
  görme/işitme engeli, uzuv eksikliği, çocuk felci ve otizm içerir. **Ölüm
  nedeni GEDCOM'a `DEAT.CAUS` ile yazılır ve içe aktarımda geri okunur**
  (5.5.1 standardı). Doğuştan/yaşarken durumlar GEDCOM'da standart bir
  karşılığı olmadığından dışa aktarılmaz — din/dil/etnik/uyruk gibi.
- **Ayarlanabilir kuşak derinliği** — ağaçta 2'den 8'e kadar kuşak, "tüm
  akrabalar" ve "herkes"; dar ekranda yatay kaydırılır.
- **Belirgin cinsiyet renkleri** — kadın/erkek/diğer/bilinmiyor açık ve koyu
  temada net ayrışır; karttaki cinsiyet şeridi genişletildi.
- **Seçili kart ortalanır** — ağaçta bir kart seçilince görünür alanın
  (detay paneli hariç) ortasına kayar; boşluğa tıklayınca seçim kalkar.
- **Ayrıntı düzeyine göre kart** — ağaçta kuşak/kalabalık arttıkça kartlar
  kademeli sadeleşir (önce yaş, sonra şehir çıkar, sonra kutu/çizgi küçülür),
  böylece derin ağaçlarda okunur kalır.
- **Nötr soybağı / sıcak evlilik çizgileri** — ağaç bağlantıları iki temada
  da net; kendine ait renk belirteçleriyle (yeşil/soluk karmaşası giderildi).
- **Çift yönlü yatay şecere (Soy)** — merkez kişi ortada, atalar solda,
  torunlar sağda; özyinelemeli kum saati, seçilen kuşak kadar iki yön.
- **Ağaçta gezinme** — tek tık merkeze alır (panel açılmaz), çift tık detay
  açar; kuşak derinliği 0'dan başlar; yakınlaştırma gizlenen bilgiyi geri
  getirir; "Merkeze al" artık Soy'a atlamaz, olduğun görünümde merkezler.
- **Benzersiz kimlik kodu** — her kişiye 6 haneli, 289 ile başlayan kalıcı
  kod; kartlarda görünür, aramada kullanılır (`lib/code.ts`).
- **Panelde en yeni kayıtlar** ve "kişinin akrabaları" listesinde **en yakın
  akraba en üstte** (yol uzunluğuna göre).
- **Kuşak görüntüleyici** — kişi + kuşak numarası seçilir; o kişiden tam N
  kuşak uzaktaki herkes (yukarı atalar ve aşağı torunlar) tek listede.
- **Yakınlık derecesi** — kişi + derece seçilir; medeni hukuk kan hısımlığı
  derecesine göre (1° anne/çocuk, 2° kardeş/dede, 4° birinci kuzen…) herkes
  listelenir (`bloodDegrees`, kan bağı BFS'i).
- **Ad gösterimi** — soyadsız eski kayıtlarda baba adı adın önünde:
  "Turgud oğlu Mehmed", "Bali kızı Rabia".
- **Ayrışmış cinsiyet renkleri** — kadın/erkek/diğer/bilinmiyor iki temada net.
- **Lakap + patronim + cinsel yönelim alanları** — Soyadı Kanunu öncesi
  kuşaklar soyadsız gösterilir, baba adından türetilen patronim ve lakapla
  anılır; cinsel yönelim isteğe bağlı kaydedilir ve LGBT+ süzgeciyle bulunur.
- **Genişletilmiş panel** — kadın/erkek, evlilik/boşanma, ortalama ömür, en
  yaşlı yaşayan, en sık doğum yeri, en kalabalık kardeş grubu; ayrıca
  "kişinin tüm akrabaları" bulucu (Türkçe terimle süzülür).
- **Ağaçta kuşak derinliği denetimi** — yüzlerce kişilik ağaçlarda okunabilirlik
- **Evlat edinme / koruyucu aile / üvey bağ ayrımı** ve **kopan ilişkiler**
  (`parentLinks`): evlatlıktan reddetme ve ebeveyni reddetme bağı silmez,
  yalnızca not düşer. Evlat edinme GEDCOM'a `FAMC`/`PEDI` ile yazılır.
- **Din / mezhep / ana dil / etnik köken / uyruk alanları** — soy ağaçlarında
  yaygın olarak kaydedilen bilgiler; "ırk" yerine "etnik köken" terimi
- **Otomatik avatar** — fotoğrafı olmayan hiçbir kart boş kalmaz; formda
  24 alternatif arasından seçilebilir
- **16 kuşaklık demo ağacı** (300'ü aşkın kişi, 1521'den bugüne)
- **Ağaçta kapsam denetimi** — 2/3/4 kuşak · kişinin tüm akrabaları · herkes
- **Şifresiz demo girişi** — ayrı bir NextAuth sağlayıcısı; her girişte
  ortak demo ağacı sıfırlanır

### ✅ Sonradan kapatılan eksikler (2026-08 güncellemesi)
İlk boşluk analizindeki 6 eksik madde artık tamamlandı: yaşayan kişi gizliliği,
yaşam-olayı zaman çizelgesi, kaynak/atıf, çoklu medya galerisi, rol ayrımı
(görüntüleyen/düzenleyen), doğum yeri haritası ve yelpaze grafiği. Ayrıca:
İngilizce (i18n), meslek, eğitim seviyesi, eşzamanlı yazma koruması, blob
önbelleği, yerleşim iyileştirmesi ve büyük ağaç sanallaştırması eklendi.

### ✅ Yüksek getiri — tamamlandı (Kademe 4)
- ~~**Rapor / yazdırma / PDF**~~ ✅ Aile kitabı + açık görünüm (ağaç/harita/soy/
  panel) yazdırma (`PrintView`, `@media print`).
- ~~**Rehberli anı + sözlü/sesli hikâye**~~ ✅ `memories[]` + rehberli sorular +
  `AudioRecorder` (Cloudinary).
- ~~**Gerçek rol/davet sistemi**~~ ✅ Görüntüleyen/editör/yönetici + tokenli davet
  bağlantısı; sunucu-taraflı yetki (`lib/roles.ts`, `lib/members.ts`).

### ✅ Olgunlaştırır — büyük ölçüde tamamlandı
- ~~**Ek grafik türleri**~~ ✅ Torunlar (descendancy) + aile geneli zaman
  çizelgesi eklendi; 8 görünüm (ağaç/soy/torunlar/yelpaze/zaman/liste/harita/panel).
- ~~**İnce ayrımlı gizlilik**~~ ✅ Role-bazlı (viewer'da zorunlu maske) + alan-bazlı
  (`privateFields` grupları) + kayıt-bazlı `confidential`.
- ~~**Gelişmiş arama/filtre**~~ ✅ Liste görünümünde birleştirilebilir alan süzgeci
  (cinsiyet/yıl aralığı/yer/meslek/eğitim) — `lib/search.ts`.
- **Çoklu ağaç** — ⏸️ ertelendi. Giriş "ağaç adı + şifre" temelli olduğundan
  bir hesabın çok ağaç yönetmesi auth yeniden mimarisi ister; talep gelince.

**Bilinçli sınırlı / kapsam dışı:**
- Gezilebilir gerçek harita (tile) — CSP/çevrimdışı nedeniyle bilinçli olarak yok
  (elle sözlük + gömülü SVG dünya sınırlarıyla zoom/pan var).
- Gerçek DB'ye geçiş + ELK ile tam yerleşim — teknik borç, ertelendi.
- DNA eşleştirme ve devasa kayıt arşivi — devlerin işi, kapsam dışı.

**Gelecek notları (bkz. §8):** native mobil uygulama · hesapsız giriş +
e-posta ile bağlama · manuel kardeş sıralaması · cihaz-arası/offline paylaşım.

---

## 5. Önceliklendirilmiş Yol Haritası

Efor/getiri dengesine göre kademeler. Bir kademe komple yapılmak zorunda değil.

### 🟢 Kademe 1 — Yüksek getiri, makul efor ✅ tamamlandı
1. ~~**GEDCOM import/export**~~ ✅ `lib/gedcom.ts` — 5.5.1 uyumlu.
2. ~~**Yaşayan kişi gizliliği**~~ ✅ `lib/privacy.ts` + `PrivacyContext`.
3. ~~**Yaşam olayı zaman çizelgesi**~~ ✅ `events[]` + kişi panelinde zaman çizelgesi.

### 🟡 Kademe 2 — Deneyimi zenginleştirir ✅ tamamlandı
4. ~~**İlişki hesaplayıcı**~~ ✅ `lib/relations.ts`.
5. ~~**Çoklu medya galerisi**~~ ✅ `photos[]` galeri.
6. ~~**Yaklaşan olaylar paneli**~~ ✅ 30 günlük akış (doğum günü + yıldönümü + anma).
7. ~~**Alternatif grafik**~~ ✅ Soy (pedigree) + yelpaze (fan) grafiği.

### 🔵 Kademe 3 — Olgunlaşma ✅ tamamlandı
8. ~~**Rol ayrımı (görüntüleme modu)**~~ ✅ `ReadOnlyContext` (istemci anahtarı).
9. ~~**Kaynak/atıf**~~ ✅ `sources[]`.
10. ~~**Harita**~~ ✅ `PlacesMap` + gerçek kara zemini (`lib/world-map.ts`).

### 🟣 Kademe 4 — Olgunlaşma ✅ tamamlandı
11. ~~**Rapor / yazdırma / PDF**~~ ✅ `PrintView` (aile kitabı) + açık görünüm
    yazdırma; `@media print` + `window.print()`.
12. ~~**Rehberli anı + sesli hikâye**~~ ✅ `memories[]` + `AudioRecorder`.
13. ~~**Gerçek rol/davet sistemi**~~ ✅ Roller + tokenli davet + sunucu yetkisi.

### 🟤 Kademe 5 — Olgunlaştırma (bu döngü)
14. ~~**Ek grafik türleri**~~ ✅ Torunlar + Zaman çizelgesi (`lib/timeline.ts`).
15. ~~**İnce ayrımlı gizlilik**~~ ✅ Role-bazlı + alan-bazlı (`privateFields`).
16. ~~**Gelişmiş arama/filtre**~~ ✅ Faceted süzgeç (`lib/search.ts`).
17. **Çoklu ağaç** — ⏸️ ertelendi (auth yeniden mimarisi gerektirir).

### ⛔ Kapsam dışı (bilinçli)
- **DNA eşleştirme** ve **kayıt arşivi** — Devlerin işi, bizim alanımız değil.

---

## 6. Teknik Borç & Risk Notları

Yeni özelliklerden bağımsız, mevcut mimaride dikkat edilmesi gerekenler:

- ~~**Eşzamanlı yazma riski (önemli).**~~ ✅ **İyimser kilitleme eklendi.**
  İstemci, düzenlemeye başladığı sürümü (`updatedAt`) `x-base-version`
  başlığıyla gönderir; sunucudaki güncel sürümle uyuşmuyorsa yazma 409 ile
  reddedilir ve kullanıcıdan sayfayı yenilemesi istenir (`lib/blob.ts`
  `versionMismatch`, POST/PUT/DELETE rotaları, `lib/actions.ts`). Böylece iki
  kişi aynı anda düzenlese de biri diğerinin değişikliğini sessizce ezmez.

- ~~**Tüm veri tek JSON.**~~ ⚠️ **Kod içi ölçekleme iyileştirmeleri.** Gerçek
  DB'ye geçiş ileriye kaldı; bu arada `lib/blob.ts` kısa ömürlü (4 sn) bellek
  içi önbellek tutuyor (sıcak örnekte ardışık okumalar dosyayı tekrar
  indirmiyor; yazma yolları `skipCache` ile taze okur), `/api/family` ise
  koşullu istek (ETag / `If-None-Match` → 304) destekliyor. Yüzlerce kişilik
  ağaçta yapılandırılmış bir modele (Postgres / SQLite) geçiş yine de doğal
  bir sonraki adım.

- **`main` geçmişi squash edildi.** Yeni iş her zaman güncel `main`'den
  dallanmalı (süreç zaten böyle işliyor, not olarak).

- ~~**Kuzen evliliği + büyük ağaç = düzen bozulması.**~~ ⚠️ **Bileşik graf
  kümelemesiyle iyileştirildi.** Kenar ağırlığını yükseltmek işe yaramamıştı
  (katmanlı yerleşimin yapısal sınırı). Bunun yerine dagre'nin bileşik
  (compound) grafını kullanıyoruz: her tek-evlilikli çiftin iki eşi bir üst
  "küme"ye konur, dagre küme üyelerini bitişik tutar (`lib/tree-layout.ts`).
  346 kişilik demo ağacında bitişik çift sayısı ölçümle 47/105 → 92/105'e
  çıktı, tuval yalnızca ~%18 genişledi; çakışma yok (`tests/tree-layout.test.mts`).
  Çok eşli / yeniden evli düğümler kümelenmez (kümeler örtüşemez). Tam çözüm
  (ELK ya da elle sıralama) hâlâ açık, ama gözle görülür iyileşme sağlandı.

- **Giriş kimliği artık "ağaç adı".** Soyadıyla giriş yanlış bir varsayımdı:
  kadınların soyadı değişir, 1934 öncesinde soyad yoktur, aynı ağaçta onlarca
  soyadı bulunur. Alan adı (`familyName`) geriye dönük uyumluluk için korundu,
  yalnızca arayüzdeki anlatım değişti.

- **Ağaç ölçeklenmesi.** Dagre yerleşimi 172 kişide çok geniş bir tuval üretiyor;
  tamamı tek ekranda okunmuyor. Çözüm olarak odak kişinin çevresinde kum saati
  (N kuşak ata + N kuşak soy + eşler + kardeşler) filtresi eklendi. ✅ Ayrıca
  büyük ağaçlarda (>150 kişi) React Flow `onlyRenderVisibleElements` ile
  sanallaştırma açıldı — yalnızca görünür alandaki düğüm/kenarlar render edilir;
  küçük ağaçlarda kapalı tutulur (mount/fitView davranışı değişmesin diye).

- **`fitView` zamanlaması.** Düğümler mount sonrası bir effect ile yerleştiği
  için `onInit` içindeki tek `fitView` eksik bir kümeyi ölçüyordu; görünür kişi
  sayısı değiştikçe yeniden sığdırmak gerekiyor.

- **`parentLinks` GEDCOM'da kısmen taşınır.** Evlat edinme/koruyucu/üvey
  bağları `FAMC`/`PEDI` ile yazılıp okunuyor, ama ilişki kopukluğunun
  (`estranged`) GEDCOM 5.5.1'de karşılığı yok — dışa aktarımda kayboluyor.
  Uygulamaya özel veri olarak kalıyor.

- **Ortak demo hesabı.** Şifresiz demo tek bir hesabı paylaşır ve her girişte
  sıfırlanır. Aynı anda iki ziyaretçi girerse biri diğerinin değişikliklerini
  görebilir; ziyaretçi başına ayrı hesap açmak depolamayı büyütürdü.

- **Katmanlı ESC yönetimi.** `keydown` React'te senkron flush eden bir olay
  olduğu için, her katman kendi `document` dinleyicisini kaydettiğinde alttaki
  katman state'i güncelleyince üstteki katman dinleyicisini olay dağıtımının
  ortasında kaldırıp ESC'yi kaçırıyordu. `lib/useEscapeKey.ts` tek dinleyici +
  katman yığını ile bunu çözüyor — yeni bir kaplama eklerken bu hook kullanılmalı.

---

## 7. Öneri / Karar

Kademe 1–3 tamamlandı; arayüz sektör liderleri seviyesinde. Sıradaki üçlü
(Kademe 4) için önerim, getiri sırasıyla:

> **(11) Rapor/PDF · (12) Rehberli + sesli hikâye · (13) Gerçek rol/davet.**

Birincisi evrensel beklenen ve bağımlılıksız; ikincisi ürünü "aile hikâyesi"ne
dönüştürür; üçüncüsü çok kullanıcılı olgunluğu getirir. Sırayla ele alınıyor.

---

## 8. Gelecek Notları & Rakip Analizi (2026-08)

> Bu bölüm, ileride ele alınacak fikirleri **not** olarak tutar; hiçbiri şu an
> uygulanmıyor. Kaynak: **Quick Family Tree — Digital Gene** (mobil-öncelikli,
> hesapsız, ücretsiz) uygulamasının incelemesinden çıkan farklar.

### 📱 Mobil uygulama (planlandı)
- **Gelecekte native mobil uygulama (Android/iOS) yapılacak.** Şu an responsive
  web var; mağaza uygulaması, ana ekrana kurulum ve tam çevrimdışı deneyim yok.
- Rakip mobil-native ve "tek dokunuşla ekleme/sadeleştirme" hissi güçlü; mobil
  sürümde bu akıcılık hedeflenmeli.

### 🚪 Hesapsız giriş + e-posta ile bağlama (onboarding) — İPTAL
> Bu bölümdeki "hesapsız başlama" fikri `lib/guest.ts` + `/api/guest` olarak
> uygulanmıştı (Supabase Faz 3d, `docs/YAPIM-SIRASI.md` madde 41). Ürün sahibi
> özelliği istemedi ve tamamen kaldırıldı — burada yalnız tarihçe olarak kalsın
> diye siliniyor, yeniden yapılmasın diye bırakılıyor.
- ~~**Hesapsız başlama:** ziyaretçi kayıt olmadan hemen kendi ağacını kurabilsin
  (yalnızca ortak/sıfırlanan demo değil — kişiye özel geçici/yerel ağaç).~~
- ~~**E-posta ile kendine bağlama:** isterse veriyi kaybetmemek için ağacı bir
  e-postaya bağlayıp kalıcılaştırabilsin (guest → hesap dönüşümü).~~
- **Sonraki girişler hesaplı olsun.** Hesaplı giriş (ağaç adı + şifre + roller/
  davet) **zaten var ve DEĞİŞMEYECEK**; yukarıdaki hesapsız-başlangıç katmanı
  olmadan da geçerliliğini koruyor.

### 🌿 Rakipten çıkan diğer farklar (bizde eksik / kısıtlı)
- **Manuel kardeş sıralaması** — kardeşlerin görüntü sırasını sürükle-bırak ile
  elle değiştirme. Bizde sıra tamamen dagre'ye bağlı (en düşük eforlu kazanç).
- **Çoklu ağaç** — bir kişinin birden çok (ör. tarihsel) ağaç tutması. Auth
  yeniden mimarisi gerektirdiğinden ertelendi (bkz. §5-madde 17).
- **Cihaz-arası / offline-first paylaşım** — telefondan telefona doğrudan
  aktarım / çevrimdışı yerel kayıt. Bizimki sunucu + roller/davet + GEDCOM.

---

### Kaynaklar
- Rakip inceleme — Quick Family Tree (digital-gene.com), Google Play (2026)
- Genealogy site karşılaştırmaları — Family Tree Magazine, YourRoots (2025)
- Açık kaynak alternatifler — Ithy, awesome-selfhosted, opensource.com
- webtrees özellik listesi — webtrees.net/features
- GEDCOM standardı — gedcom.org, FamilySearch Wiki, Wikipedia
- Görselleştirme — donatso/family-chart, magicsunday/webtrees-fan-chart, d3-dag
