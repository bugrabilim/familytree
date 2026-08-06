# Soy Ağacı — Geliştirme Planı & Pazar Analizi

> Bu doküman, mevcut uygulamayı global soy ağacı platformları ve açık kaynak
> projelerle karşılaştırır, iç görüler çıkarır ve önceliklendirilmiş bir yol
> haritası önerir. **Hiçbir özellik hemen eklenmek zorunda değil** — bu bir
> tartışma ve referans belgesidir.
>
> Tarih: 2026-08 · Durum: Taslak / tartışma

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
- İnteraktif ağaç (React Flow + dagre), zoom/pan/minimap
- Kişi profili: fotoğraf, biyografi, doğum/ölüm, yer
- İlişkiler: ebeveyn, eş, çocuk, kardeş (çift yönlü senkron)
- CRUD + isim/yer/tarih araması
- Cloudinary foto, Vercel Blob (JSON) depolama

### ❌ Eksik olan (piyasa standardı)
- GEDCOM import/export
- Yaşayan kişi gizliliği
- Alternatif grafik türleri (fan, pedigree, timeline)
- Yaşam olayı zaman çizelgesi (doğum/ölüm dışı olaylar)
- Kaynak/atıf & çoklu medya galerisi
- İlişki hesaplayıcı
- Yaklaşan olaylar / doğum günü bildirimleri
- Rol ayrımı (görüntüleyen vs düzenleyen)
- Harita üzerinde doğum yerleri

---

## 5. Önceliklendirilmiş Yol Haritası

Efor/getiri dengesine göre kademeler. Bir kademe komple yapılmak zorunda değil.

### 🟢 Kademe 1 — Yüksek getiri, makul efor
1. **GEDCOM import/export** — En değerli tek ekleme. `gedcom` npm parser'ı ile
   `.ged` → `Person[]` dönüşümü; export tersi. Onboarding + veri sahipliği.
2. **Yaşayan kişi gizliliği** — Kişiye `isLiving` / `deathDate` mantığı; yaşayan
   kişilerin detayını isteğe bağlı gizle. KVKK açısından da doğru.
3. **Yaşam olayı zaman çizelgesi** — Profile serbest olay listesi (yıl + tür +
   açıklama): evlilik, mezuniyet, göç, iş… Veri modeline `events[]` alanı.

### 🟡 Kademe 2 — Deneyimi zenginleştirir
4. **İlişki hesaplayıcı** — İki kişi arası en kısa yol / ortak ata (BFS).
   Saf hesaplama, ek altyapı gerektirmez.
5. **Çoklu medya galerisi** — Kişi başına birden çok foto/belge (şu an tek
   avatar). Cloudinary zaten hazır.
6. **Yaklaşan olaylar paneli** — Ana sayfada doğum günü/yıldönümü akışı.
7. **Alternatif grafik: zaman çizelgesi veya fan chart** — Aynı veriye ikinci
   bir bakış.

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

---

## 7. Öneri / Karar

Uygulama **şu hâliyle amacına uygun ve tamamlanmış** durumda. Bir sonraki tek
bir adım seçilecekse önerim:

> **GEDCOM import/export** + **yaşayan kişi gizliliği**.

İkisi birlikte, uygulamayı "kişisel proje"den "ciddi aile aracı"na taşıyan,
göreli düşük eforlu ve yüksek getirili çift. Gerisi talep geldikçe eklenebilir.

---

### Kaynaklar
- Genealogy site karşılaştırmaları — Family Tree Magazine, YourRoots (2025)
- Açık kaynak alternatifler — Ithy, awesome-selfhosted, opensource.com
- webtrees özellik listesi — webtrees.net/features
- GEDCOM standardı — gedcom.org, FamilySearch Wiki, Wikipedia
- Görselleştirme — donatso/family-chart, magicsunday/webtrees-fan-chart, d3-dag
