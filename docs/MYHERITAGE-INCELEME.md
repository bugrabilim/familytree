# MyHeritage İncelemesi ve Bizim Uygulamaya Çıkarımlar

Kısa bir rekabet/özellik incelemesi: MyHeritage (myheritage.com) ne sunuyor,
biz neyi zaten yapıyoruz, neyi ödünç alabiliriz. Amaç yol haritasını beslemek.

## MyHeritage nedir?

Dünyanın en büyük soyağacı + DNA platformlarından biri. ~46 milyon aile ağacı
ve ~20 milyar tarihsel kayıt üzerinde çalışır. Üç ayak: (1) çevrimiçi ağaç,
(2) tarihsel kayıt eşleştirme, (3) DNA. Ayrıca güçlü fotoğraf/AI araçları.

## Öne çıkan özellikler

| Özellik | Ne yapar | Bizdeki durum |
|---|---|---|
| **Smart Matches™** | Kişini başka üyelerin ağaçlarındaki aynı kişiyle eşleştirir (yazım/dil/fonetik farklarına dayanıklı). | Yok (tek-ağaç uygulamasıyız; ileride ağaçlar-arası eşleştirme düşünülebilir). |
| **Record Matches** | Ağaçtaki kişiyi tarihsel kayıtlarla (nüfus, göç…) eşler. | Yok (kayıt veritabanımız yok). |
| **Theory of Family Relativity™** | DNA eşleşmesiyle nasıl akraba olduğunu ağaç+kayıt verisinden tahmin eder. | Yok (DNA yok). Ama bizde **akrabalık hesaplayıcı** (iki kişi arası yol) zaten var. |
| **PedigreeMap™** | Ağaçtaki yer bilgilerini dünya haritasına döker. | **Var** — `PlacesMap` / harita görünümü. |
| **Deep Nostalgia / Photo Enhancer / In Color** | Eski fotoğrafları canlandırma, netleştirme, renklendirme. | Kısmen: Cloudinary'de fotoğraf/galeri var; canlandırma/renklendirme yok. |
| **AI Time Machine™** | Kişiyi tarihsel figür olarak üretir. | İlgisiz — ayrıca **Ocak 2026'da kapatıldı**. |
| **Family Tree Builder** (masaüstü) | Çevrimdışı ağaç kurma, GEDCOM al/ver. | Bizde web + Blob/Postgres; GEDCOM al/ver var. |
| **DNA** | DNA testi + başka firmalardan ham DNA yükleme. | Kapsam dışı. |

## Dosya biçimleri (bizim için en pratik kısım)

- **GEDCOM** evrensel değişim standardı (5.5 / 5.5.1). MyHeritage dâhil tüm
  ciddi yazılımlar GEDCOM al/ver eder. **Bizde zaten var.**
- **GEDCOM medya taşımaz**: fotoğraflar yalnızca URL olarak referanslanırsa
  taşınır; gömülü dosyalar aktarılmaz. (Bizde medya Cloudinary URL'leri → GEDCOM
  ile URL taşınabilir; **`OBJE/FILE` eşlemesi yapıldı** — `lib/gedcom.ts`.)
- **DNA ham verisi** ayrı bir yükleme türü (bizde kapsam dışı).
- MyHeritage'ın kendi `.ftb` (Family Tree Builder) biçimi tescillidir; dışarıya
  **GEDCOM** ile çıkılır. Yani bir MyHeritage ağacını bize almanın yolu:
  MyHeritage → GEDCOM dışa aktar → bizde içe aktar. **Bu yol artık destekli.**

## Bizim için çıkarımlar / öneriler

1. **Çok-biçimli içe/dışa aktarım** (bu turda yapıldı): GEDCOM'a ek olarak CSV
   ve JSON. MyHeritage/Ancestry/FamilySearch hepsi GEDCOM verdiği için asıl
   köprü GEDCOM'dur; CSV ise elektronik tablodan hızlı veri girişini açar.
2. ✅ **GEDCOM medya (URL) eşlemesi yapıldı**: dışa aktarımda fotoğraf URL'leri
   `OBJE`/`FILE` olarak yazılıyor → MyHeritage'a taşındığında görseller de gidiyor.
   Test: `tests/gedcom-media.test.mts`.
3. **Fotoğraf zenginleştirme**: renklendirme/netleştirme, Cloudinary'nin hazır
   dönüşümleriyle düşük maliyetle denenebilir (Deep Nostalgia'nın hafif hâli).
4. **Harita**: PedigreeMap'e benzer şekilde bizde harita var; zaman kaydırıcısı
   / kuşak filtreleri eklenerek güçlendirilebilir.
5. **Ağaçlar-arası eşleştirme / DNA**: büyük altyapı ister; şimdilik kapsam dışı.

## Kaynaklar

- [Import your family tree to MyHeritage (blog)](https://blog.myheritage.com/2024/04/import-your-family-tree-to-uncover-your-global-roots/)
- [Why upload a GEDCOM to MyHeritage](https://education.myheritage.com/article/why-upload-a-gedcom-to-myheritage/)
- [What is a GEDCOM file](https://education.myheritage.com/article/what-is-a-gedcom-file-and-how-does-it-help-in-genealogy/)
- [Smart Matching](https://www.myheritage.com/help/en/articles/12852418-what-is-myheritage-smart-matching-and-how-do-i-use-it)
- [Theory of Family Relativity](https://education.myheritage.com/article/the-theory-of-family-relativity-for-dna-matches/)
- [PedigreeMap](https://education.myheritage.com/article/how-to-use-pedigreemap/)
- [MyHeritage photo features](https://education.myheritage.com/article/myheritage-photo-features/)
- [AI Time Machine (kapatıldı, Ocak 2026)](https://blog.myheritage.com/2022/11/introducing-ai-time-machine-transform-yourself-into-a-historical-figure-using-everyday-photos/)
