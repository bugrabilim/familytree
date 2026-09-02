# Araştırma Özeti — Üç Turun Birleşik Sonucu

> Bu belge, projede bugüne kadar yapılmış **tüm** rekabet/pazar araştırmasının
> tek sayfalık sentezidir. Kaynak belgeler yerinde duruyor; burada tekrar
> edilmez, **birleştirilir ve karara bağlanır**.

## Envanter — ne, ne zaman, nerede

| # | Tur | Tarih | Kapsam | Belge |
|---|---|---|---|---|
| 1 | **Pazar manzarası** | 2026-08 | Ancestry · MyHeritage · FamilySearch · webtrees · Gramps · görselleştirme kütüphaneleri (family-chart, fan-chart, d3-dag) | `GELISTIRME-PLANI.md` §2–3 |
| 2 | **MyHeritage derin inceleme** | 2026-08 | Smart Matches · Record Matches · Theory of Family Relativity · PedigreeMap · foto AI · GEDCOM gerçekleri | `MYHERITAGE-INCELEME.md` |
| 3 | **Geniş tarama** | 2026-09 | 3 paralel ajan, ~145 arama; 30+ ürün, 12+ ülke; SaaS/startup/mobil/açık kaynak/**dolaylı** rakipler | `REKABET-ARASTIRMASI-2.md` |

Toplam taranan: **~40 ürün, 12+ ülke** (TR, US, UK, DE, FR, RU, KZ, SA/Körfez, CN, KR, JP, IN, IL, Afrika).

**Metodoloji uyarısı:** Tur 3'te WebFetch ağ ilkesiyle kapalıydı; fiyat ve indirme
sayıları arama sonucu özetlerinden derlenmiş anlık görüntülerdir. Karara esas
alınmadan doğrulanmalı.

---

## Bir sayfada: yedi bulgu

### 1. Ağaç kurmak para kazandırmıyor — kayıt arşivi kazandırıyor
Ancestry ~60 bin indirme/ay → **~900 bin $/ay**. MyHeritage ~90 bin indirme/ay →
**~300 bin $/ay**. Üçte iki indirmeyle 4,5 katı gelir; fark tamamen arşiv erişiminde.
Arşivimiz yok ve **olmayacak** (Ancestry'nin 60 milyar kaydıyla yarışılmaz).
→ Gelir **baskı, depolama ve tek seferlik kalıcılık**tan gelmeli, arşiv aboneliğinden değil.

### 2. Soyağacı ürünleri elde tutmaz — çünkü içerik kendiliğinden üremiyor
Kategorinin yıldızı Storyworth bile aylık açılan bir ürün değil, **yılda bir dönüşen
bir hediye** (63 bin Trustpilot yorumunun çoğu kullanım değil hediye yorumu; en sık
şikâyet: "bir yıl boyunca tek soru cevaplamadı"). Buna karşılık Tinybeans **%93 elde
tutma** — çünkü çocuk var olduğu sürece içerik kendiliğinden üretiliyor.
→ Elde tutan tek model, içeriği kendiliğinden üreyen modeldir.

### 3. Bizim kendiliğinden üreyen içeriğimiz "ölülerin takvimi"
40+ kişilik her ailede neredeyse her ay bir anma, yıldönümü, mevlit veya bayram
mezar ziyareti var. **Bunu bilen tek yazılım biziz.** İsrail'de Geni çift takvimi
shipleyemediği için Hebcal Yahrzeit ayrı bir araç olarak bu boşluğu almış — kanıt burada.

### 4. Türkiye'de kalıcı ve **yasal** bir boşluk var
NVİ mevzuat gereği yalnız **alt soy ve üst soyu** verir. **Yan soy — kardeş, amca,
dayı, hala, teyze, kuzen — tasarım gereği hariçtir** (resmî gerekçe: kardeşin "sizin
var olmanızda payı olmadığı"). Türkçe akrabalık dili ise neredeyse tamamen yanaldır.
e-Devlet'in en çok şikâyet edilen tarafı **anne tarafının kesilmesi** (Şikayetvar'da
ayrı şikâyet kümeleri, Ekşi'de 200+ sayfa başlık).

> **"e-Devlet size atalarınızı verir. Ailenizi vermez."**

### 5. En savunulabilir farkımız soyağacı özelliği değil — kültürel altyapı
Türkçe akrabalık motoru (amca/dayı, hala/teyze + ek çekimi), 1934 öncesi patronim,
e-Devlet PDF içe aktarımı, kirve/çevre kavramı, alan bazında gizlilik. Bunların
hiçbiri lokalizasyonla elde edilemez; **hepsi zaten kodumuzda.**

### 6. AI sohbet artık masa payı
2026'da MyHeritage (GAIA), Ancestry (AncestryAI) ve FamilySearch hepsini çıkardı.
Ağaç/soy/yelpaze görünümleri, GEDCOM, yaşayanları gizleme, doğum günü hatırlatması,
harita, kitap çıktısı — **hiçbiri artık farklılaştırıcı değil.**

### 7. Rakiplerin en zayıf karnı faturalama; gerçek tehdit ise soyağacı ürünü değil
Ancestry **1,6/5** (637 yorum), MyHeritage **1,9/5** (%79 olumsuz). Neredeyse tamamı
faturalama. → *"Ayrılmayı kolaylaştırıyoruz" bu kategoride bir pazarlama varlığıdır.*
Asıl tehdit ise **Google/Apple Photos + aile WhatsApp grubu**: ücretsiz, zaten kurulu,
medyayı zaten tutuyor. Onların ilgilenmediği yer bizim alanımız: **atalar, mezarlar,
anma günleri, çok kuşaklı yapı.**

---

## Savunma hattımız — bizde olup rakiplerde olmayan

| Özellik | Kod | Neden savunulabilir |
|---|---|---|
| e-Devlet Alt-Üst Soy PDF içe aktarımı | `lib/edevlet.ts` | Yakınlık Derecesi zincirinden ağaç kurar; küresel oyuncunun yapması anlamsız |
| Türkçe akrabalık motoru | `lib/relations.ts` | amca/dayı, babaanne/anneanne + ek çekimi. Çeviriyle elde edilemez |
| 1934 öncesi patronim | `lib/name.ts` | "Bali oğlu Kasım" dönemi; Arap dünyasıyla yapısal olarak aynı |
| Çevre / aile dışı yakınlar | `lib/associates.ts` | Kirve, komşu, vasi, öğretmen. Hiçbir Batılı üründe yok |
| Alan bazında gizlilik | `lib/privacy.ts` | Rakiplerde gizlilik *engelleyici*, bizde *maske* |
| Çapraz ilişki tablosu | `lib/relation-matrix.ts` | Herkes × herkes matrisi. Nadir |
| Görsel yakınlık derecesi | `PanelView` halkalar | Kan derecesini görselleştiren tüketici ürünü yok |
| Defin yeri + koordinat katmanı | `PlacesMap` | Haritada doğum *ve* mezar. Rakiplerde yok |
| Ağaçlar arası eşleştirme + dal aşılama | `crossmatch` / `graft` | Smart Matches'ın ince dilimi, arşiv sahibi olmadan |
| Kopukluk (`estranged`) alanı | `types/family.ts` | Genogram dünyasının "cutoff"u; tüketici soyağacında kimse yapmıyor |
| LGBT+ göstergesi | `lib/identity.ts` | Kategorinin muhafazakâr ürünlerinde yok |
| Geri alma / sürüm geçmişi | `lib/history.ts` | Veri kaybı bu pazarın travması; bizde 15 anlık görüntü |
| **Sınırsız kişi (ücretsiz)** | — | Kategorinin en nefret edilen duvarı (MyHeritage 250, Geni 250, Android 150) |

## Eksiklerimiz — rakiplerde olup bizde olmayan

**Yüksek etkili:** ① dışa dönük soru/istem motoru (Storyworth, Remento) · ② otomatik
aile bülteni (Trove) · ③ hikâye talebi (Simirity) · ④ kitapta sesi çalan QR (Remento) ·
⑤ **katkı verici rolü** (contributor ≠ editor — sektörün #1 karşılanmamış talebi) ·
⑥ çevrimdışı yakalama + arka planda senkron · ⑦ toplu foto restorasyon

**Orta etkili:** yüz tanıma etiketleme (Gramps Web) · araştırma görev yöneticisi ·
GEDCOM 7 + GEDZIP · tarihsel bağlam indeksi (Heredis 2026) · zaman kilitli içerik ·
aile etkinliği + RSVP · çift takvim (Hicri/Miladi)

---

## Karar tablosu — sırayla yapılacaklar

| Kademe | İş | Durum |
|---|---|---|
| **1** | Anma Takvimi + bildirim (3/7/40/52. gece + sene-i devriye, Hicri/Miladi) | ⛔ e-postaya bağlı |
| **1** | Aile Bülteni — otomatik aylık özet e-postası | ⛔ e-postaya bağlı |
| **1** | Dışa dönük soru motoru + hikâye talebi | ⛔ e-postaya bağlı · kod hazır |
| **2** | e-Devlet PDF'ini **birincil onboarding** yapmak | ✅ yapılabilir |
| **2** | **"Yedi Göbek" tamamlanma ölçeri** (anneanne hattı ayrı puanlanır) | ✅ **maliyet/etki en yüksek** |
| **2** | Osmanlı ↔ modern yer adı sözlüğü + göç yolu katmanı | ⚠️ Index Anatolicus lisansı |
| **2** | Sesli Şecere (rehberli kayıt → Gemini deşifre → onaylı kayıt) | ✅ yapılabilir |
| **3** | Kitapta sesi çalan QR + mezar QR sayfası | ✅ yapılabilir |
| **3** | Kalıtsal hastalık örüntüsü (**risk yüzdesi ASLA yok**) | ✅ yapılabilir |
| **3** | Katkı verici rolü | ✅ mimari zaten uygun |
| **4** | Bağlantısız kişi + iki tıkla ebeveyn değiştirme · GEDCOM 7/GEDZIP · RSVP · zaman kilitli mektup | ✅ ucuz |

**Bilerek yapılmayacaklar:** DNA · kendi kayıt arşivi · ulusal aşiret dizini
(1934 Soyadı Kanunu bağlamı → nötr, kullanıcının yazdığı "sülale" alanı) · tam klinik
genogram sembolojisi · risk skoru · GEDCOM 7'yi tek dışa aktarım yapmak (5.5.1 varsayılan
kalır) · FamilySearch API · mobilde web'i aynalamak.

---

## Fiyatlama ilkesi

**Kişi sayısını ASLA satma.** Blob'da JSON olarak bize maliyeti yok; rakipler
çekirdek fiyatlamasını bozmadan eşleyemez. Satılacaklar: **medya depolama, AI kotası,
ek ağaç, baskı kitap.**

Türkiye gerçeği: kişi başı yıllık toplam uygulama harcaması **14,6 $**; 19,99 $
abonelik ≈ medyan net gelirin **%3'ü** (ABD'de %0,4). USD kanonik tutulur, TL **PPP
indirimiyle** türetilir ve aylık gözden geçirilir. **Dürüst risk:** Türkiye'de soyağacına
ödeme isteği kanıtlanmamış (AkrabaOnline 2009'dan beri premium satıyor, ölçeklenememiş).
→ TL'yi **pazar kazanmak** için fiyatla; geliri **diasporadan** (DE/NL/FR/US Türkleri)
ve **baskı kitaptan** bekle.

---

## Nihai cevap: "Biz neyi farklı veya daha iyi yapabiliriz?"

> **1. Devletin veremediğini veriyoruz.** e-Devlet atalarınızı verir; kardeşinizi,
> amcanızı, teyzenizi **mevzuat gereği** veremez. PDF'inizi yükleyin, ailenizi
> birlikte tamamlayın.
>
> **2. Gidenlerin hâlâ var olduğu tek yer biziz.** Fotoğraf uygulamaları yalnız
> yaşayan, yakın ve çocuk merkezli içerikle ilgilenir. **"Bugün kimin günü olduğunu
> size biz söyleriz — ve gönderecek bir şey de veririz."**
>
> **3. Türkçe konuşuyoruz — çeviriyle değil.** amca/dayı, kirve, sülale, mevlit,
> sene-i devriye, 1934 öncesi patronim, mübadil hattı, Osmanlı yer adları.

**Bizi aylık açtıracak tek şey, ailenin zaten var olan ritmine (anma, yıldönümü,
bayram, buluşma) yazılım takmaktır.** O ritim Türkiye'de zaten güçlü ve şu an
hiçbir yazılımı yok.

---

## Tek darboğaz

**E-posta sağlayıcısı.** Kademe 1'in üç maddesi de buna bağlı; `lib/reminders.ts` +
`lib/email.ts` + `api/cron/reminders` **zaten yazılmış** durumda. Sağlayıcı
(Resend/Postmark/SES) + gönderen alan adı + API anahtarı geldiği anda kategorinin en
güçlü elde tutma mekanizması bizde çalışır hâle gelir. Ayrıntı: `docs/EPOSTA-PLANI.md`.

Bu beklerken yapılabilecek en yüksek getirili iş: **"Yedi Göbek" tamamlanma ölçeri** —
dış bağımlılığı yok, kan derecesi motorumuzu bir hedefe çevirir ve en büyük e-Devlet
şikâyetini (anne tarafı) kullanıcının kendi kelimeleriyle cevaplar.
