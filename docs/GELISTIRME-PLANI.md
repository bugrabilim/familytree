# Soy Ağacı — Geliştirme Planı & Pazar Analizi

> Bu doküman, mevcut uygulamayı global soy ağacı platformları ve açık kaynak
> projelerle karşılaştırır, iç görüler çıkarır ve önceliklendirilmiş bir yol
> haritası önerir. **Hiçbir özellik hemen eklenmek zorunda değil** — bu bir
> tartışma ve referans belgesidir.
>
> Tarih: 2026-08 · Durum: Kademe 1 tamamlandı, Kademe 2 kısmen
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
- **Çift yönlü şecere (Soy)** — merkez kişi ortada, atalar yukarı, torunlar
  aşağı; özyinelemeli kum saati yerleşimi, seçilen kuşak kadar iki yön.
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

### ❌ Eksik olan (piyasa standardı)
- Yaşayan kişi gizliliği
- Yaşam olayı zaman çizelgesi (doğum/ölüm dışı olaylar)
- Kaynak/atıf & çoklu medya galerisi
- Rol ayrımı (görüntüleyen vs düzenleyen)
- Harita üzerinde doğum yerleri
- Yelpaze (fan) grafiği

---

## 5. Önceliklendirilmiş Yol Haritası

Efor/getiri dengesine göre kademeler. Bir kademe komple yapılmak zorunda değil.

### 🟢 Kademe 1 — Yüksek getiri, makul efor
1. ~~**GEDCOM import/export**~~ ✅ `lib/gedcom.ts` — 5.5.1 uyumlu ayrıştırıcı
   ve üretici, `/api/family/export` ve `/api/family/import`.
2. **Yaşayan kişi gizliliği** — Kişiye `isLiving` / `deathDate` mantığı; yaşayan
   kişilerin detayını isteğe bağlı gizle. KVKK açısından da doğru. *(sıradaki)*
3. **Yaşam olayı zaman çizelgesi** — Profile serbest olay listesi (yıl + tür +
   açıklama): evlilik, mezuniyet, göç, iş… Veri modeline `events[]` alanı.

### 🟡 Kademe 2 — Deneyimi zenginleştirir
4. ~~**İlişki hesaplayıcı**~~ ✅ `lib/relations.ts` — BFS + Türkçe akrabalık
   terimleri ve ek çekimi. Panel görünümünde ve kişi panelinde.
5. **Çoklu medya galerisi** — Kişi başına birden çok foto/belge (şu an tek
   avatar). Cloudinary zaten hazır.
6. ~~**Yaklaşan olaylar paneli**~~ ✅ Panel görünümünde 60 günlük doğum günü akışı.
7. ~~**Alternatif grafik**~~ ✅ Soy (pedigree) tablosu eklendi. Fan chart hâlâ açık.

### 🔵 Kademe 3 — Olgunlaşma
8. **Rol ayrımı** — Aile hesabı içinde "düzenleyen" vs "görüntüleyen" davetleri.
9. **Kaynak/atıf** — Bilgilere belge bağlama.
10. **Harita** — Doğum yerlerini haritada gösterme.

### ⛔ Kapsam dışı (bilinçli)
- **DNA eşleştirme** ve **kayıt arşivi** — Devlerin işi, bizim alanımız değil.

---

## 6. Teknik Borç & Risk Notları

Yeni özelliklerden bağımsız, mevcut mimaride dikkat edilmesi gerekenler:

- **Eşzamanlı yazma riski (önemli).** Veri akışı `oku → değiştir → yaz`
  (`getFamilyData` → `saveFamilyData`) ve kilitleme yok. "Giriş yapan herkes
  düzenler" olduğundan, iki kişi aynı anda düzenlerse biri diğerinin
  değişikliğini eziyor (last-write-wins). Küçük ailede nadir, ama büyüdükçe
  gerçek veri kaybı. Çözüm seçenekleri: optimistic locking (`updatedAt`
  kontrolü), alan-bazlı güncelleme, ya da ileride gerçek bir DB (Postgres).

- **Tüm veri tek JSON.** Küçük aileler için mükemmel; yüzlerce kişi + medyada
  her istekte tüm dosyayı okuma/yazma verimsizleşir. GEDCOM'a geçiş, ileride
  daha yapılandırılmış bir modele (ör. Vercel Postgres / SQLite) doğal köprü.

- **`main` geçmişi squash edildi.** Yeni iş her zaman güncel `main`'den
  dallanmalı (süreç zaten böyle işliyor, not olarak).

- **Kuzen evliliği + büyük ağaç = düzen bozulması.** Kuzen evliliği grafta
  döngü yaratır: kişi hem kendi ata zincirine hem eşinin zincirine bağlıdır.
  300 kişilik "herkes" görünümünde dagre bu döngüyü çiftleri (hatta kardeşleri)
  ayırarak çözüyor. Kenar ağırlığını yükseltmek işe yaramadı — katmanlı
  yerleşimin yapısal sınırı. Odaklı görünümlerde (2/3/4 kuşak) düzen doğru;
  varsayılan da bu. Kalıcı çözüm için birlik düğümlerini aynı sıraya sabitleyen
  bir yerleşim (ör. ELK ya da elle sıralama) gerekir.

- **Giriş kimliği artık "ağaç adı".** Soyadıyla giriş yanlış bir varsayımdı:
  kadınların soyadı değişir, 1934 öncesinde soyad yoktur, aynı ağaçta onlarca
  soyadı bulunur. Alan adı (`familyName`) geriye dönük uyumluluk için korundu,
  yalnızca arayüzdeki anlatım değişti.

- **Ağaç ölçeklenmesi.** Dagre yerleşimi 172 kişide çok geniş bir tuval üretiyor;
  tamamı tek ekranda okunmuyor. Çözüm olarak odak kişinin çevresinde kum saati
  (N kuşak ata + N kuşak soy + eşler + kardeşler) filtresi eklendi. Daha büyük
  ağaçlarda sanallaştırma (viewport dışı düğümleri render etmeme) gerekebilir.

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

GEDCOM ve akrabalık hesaplayıcı tamamlandı; arayüz sektör liderleri seviyesine
çekildi. Sıradaki tek adım için önerim:

> **Yaşayan kişi gizliliği** + **yaşam olayı zaman çizelgesi**.

Birincisi KVKK/GDPR açısından doğru olan, ikincisi "kuru veri"yi hikâyeye
çeviren adım. Gerisi talep geldikçe eklenebilir.

---

### Kaynaklar
- Genealogy site karşılaştırmaları — Family Tree Magazine, YourRoots (2025)
- Açık kaynak alternatifler — Ithy, awesome-selfhosted, opensource.com
- webtrees özellik listesi — webtrees.net/features
- GEDCOM standardı — gedcom.org, FamilySearch Wiki, Wikipedia
- Görselleştirme — donatso/family-chart, magicsunday/webtrees-fan-chart, d3-dag
