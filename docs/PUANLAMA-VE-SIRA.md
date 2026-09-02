# Puanlama ve Yapım Sırası

> ⚠️ **Bu belgedeki SIRA geçersizdir.** Sıranın tek kaynağı: **`docs/YAPIM-SIRASI.md`**
> (60 iş, 1'den 60'a, bozma riskine göre). Burada yalnız *puanlama gerekçesi* durur.
> Sebep: puan bir işin **değerini** ölçüyor, sıralama ise **riski** ile kurulmalı —
> ve bu tablonun kapsamı (21 yeni özellik) sıralamanın kapsamı değil (60 iş: teknik
> borç, göç fazları, elle testler ve mobil dâhil).

> Karar: **hepsi yapılacak.** Bu yüzden puan bir *eleme* aracı değil, **sıra**
> aracıdır. Amaç en iyi işi seçmek değil, doğru sırayla yapmak.
>
> **Hedef önceliği (kullanıcı, 2026-09-02):** 1) kendimizi tatmin etmek,
> 2) kullanıcıya değer, 3) para. Puanlama bu sıraya göre ağırlıklandırıldı —
> önceki rekabet raporunun gelir odaklı sıralaması burada geçerli değildir.

## Ölçütler

| Kod | Ölçüt | Ağırlık | Açıklama |
|---|---|---|---|
| **T** | Tatmin | ×3 | Yapması ve çalışırken görmesi keyifli mi? Zanaat değeri var mı? |
| **K** | Kültürel derinlik | ×3 | Yalnız bizim yapabileceğimiz iş mi? Türkçeye/Türkiye'ye ne kadar özgü? |
| **D** | Kullanıcı değeri | ×2 | Aileye gerçekte ne kazandırıyor? |
| **E** | Eforun tersi | ×2 | 5 = ucuz, 1 = çok iş. Var olan altyapı sayılır. |
| **B** | Bağımsızlık | ×2 | 5 = dış bağımlılık yok, 1 = sağlayıcı/lisans bekliyor |
| **P** | Para | ×1 | Kasıtlı olarak en düşük ağırlık |

Azami puan: **65**.

## Tablo (puana göre)

| # | İş | T | K | D | E | B | P | **Puan** |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| 1 | **"Yedi Göbek" tamamlanma ölçeri** | 4 | 5 | 4 | 5 | 5 | 2 | **57** |
| 2 | **e-Devlet PDF'i birincil onboarding** | 3 | 5 | 5 | 4 | 5 | 4 | **56** |
| 3 | **Anma Takvimi** (3/7/40/52. gece, sene-i devriye, Hicri/Miladi) | 5 | 5 | 5 | 3 | 3 | 3 | **55** |
| 4 | **Sesli Şecere** (rehberli kayıt → Gemini deşifre → onay) | 5 | 5 | 5 | 2 | 4 | 3 | **55** |
| 5 | **Kitapta sesi çalan QR + mezar QR sayfası** | 3 | 4 | 4 | 5 | 5 | 5 | **54** |
| 6 | Osmanlı ↔ modern yer adı sözlüğü + göç yolu | 5 | 5 | 4 | 2 | 1 | 2 | **46** |
| 7 | Genogram duygusal ilişki katmanı (5–6 tür) | 5 | 2 | 4 | 3 | 5 | 1 | **46** |
| 8 | Kalıtsal hastalık örüntüsü (risk yüzdesi YOK) | 4 | 2 | 4 | 4 | 5 | 2 | **46** |
| 9 | Tarihsel bağlam indeksi (mübadele, seferberlik, depremler) | 4 | 4 | 3 | 3 | 4 | 1 | **45** |
| 10 | Dışa dönük soru motoru + hikâye talebi *(Storyworth)* | 4 | 3 | 5 | 3 | 1 | 5 | **44** |
| 11 | Katkı verici rolü (contributor ≠ editor) | 3 | 1 | 5 | 4 | 5 | 4 | **44** |
| 12 | Gömülebilir ağaç + herkese açık okuma API'si | 4 | 1 | 3 | 4 | 5 | 3 | **42** |
| 13 | Zaman kilitli mektup | 4 | 2 | 3 | 4 | 4 | 2 | **42** |
| 14 | Bağlantısız kişi + iki tıkla ebeveyn değiştirme | 2 | 1 | 5 | 5 | 5 | 2 | **41** |
| 15 | Çevrimdışı yakalama + arka planda senkron | 4 | 3 | 4 | 1 | 4 | 2 | **41** |
| 16 | Aile etkinliği + RSVP (düğün, mevlit, bayram) | 2 | 3 | 4 | 4 | 4 | 2 | **41** |
| 17 | Aile Bülteni (otomatik aylık özet) | 3 | 3 | 4 | 4 | 1 | 3 | **39** |
| 18 | GEDCOM 7 + GEDZIP dışa aktarım | 3 | 1 | 3 | 4 | 5 | 1 | **37** |
| 19 | Yüz tanıma ile foto etiketleme | 4 | 1 | 4 | 2 | 3 | 2 | **35** |
| 20 | Araştırma görev yöneticisi | 2 | 1 | 3 | 4 | 5 | 1 | **34** |
| — | **E-posta altyapısı** *(kilit — aşağıya bak)* | 2 | 1 | 5 | 4 | 1 | 3 | **32** |
| 21 | Toplu fotoğraf tarama / restorasyon | 2 | 1 | 3 | 3 | 3 | 3 | **30** |

### Puanın yalan söylediği tek yer

**E-posta altyapısı 32 ile sondan ikinci** — ama tek başına **üç işi** (3, 10, 17)
kilitliyor. Kendi başına sıkıcı bir iş olduğu için düşük puan alıyor; sırada ise
yukarıda olmalı. Puan bir işin *değerini* ölçer, *kilit* olup olmadığını ölçmez.
Bu yüzden sıra, tablodan değil aşağıdaki dalgalardan okunur.

---

## Dalgalar (gerçek yapım sırası)

### Dalga 1 — Hemen. Dış bağımlılık yok, puanı yüksek.
1. **Yedi Göbek tamamlanma ölçeri** — kan derecesi motoru zaten var; en ucuz yüksek puan.
2. **Bağlantısız kişi + iki tıkla ebeveyn değiştirme** — küçük, ama en çok sürtünme üreten eksik. Dalga 1'in geri kalanını rahatlatır.
3. **e-Devlet PDF'i birincil onboarding** — boş ağaç sorununu kökten çözer.
4. **Anma Takvimi — uygulama içi kısım** (üretim + görünüm + Hicri/Miladi). *Bildirim kısmı Dalga 2'ye kalır; takvimin kendisi e-posta beklemez.*
5. **Kitapta sesi çalan QR + mezar QR sayfası** — QR üretimi ve ses kaydı zaten var.

### Dalga 2 — E-posta kilidi açılınca (üçü birden gelir)
6. **E-posta altyapısı** — sağlayıcı + gönderen alan adı + anahtar. Kod hazır.
7. **Anma Takvimi bildirimi** — Dalga 1'deki takvimin dışa dönük ucu.
8. **Dışa dönük soru motoru + hikâye talebi** — `Memory` modeli zaten var; eksik olan yalnız gönderim ve girişsiz yanıt.
9. **Aile Bülteni** — 7 ve 8 ile aynı boru hattını kullanır; ayrı iş değil, aynı işin üçüncü yüzü.

### Dalga 3 — Derin zanaat işleri (tatmin puanı en yüksek küme)
10. **Sesli Şecere** — Dalga 2'deki soru motorunun sesli hâli; ondan sonra gelmesi doğru.
11. **Genogram duygusal ilişki katmanı** — 5–6 tür, varsayılan kapalı, maskelenebilir.
12. **Kalıtsal hastalık örüntüsü** — 11'in veri modelini paylaşır. **Risk yüzdesi asla hesaplanmaz.**
13. **Tarihsel bağlam indeksi** — 14'ün (yer adları) hazırlığı; olayları dönemine oturtur.

### Dalga 4 — Ağacı dışarı açmak
14. **Katkı verici rolü** — 15'ten önce gelmeli; API'nin yetki modeli buna dayanacak.
15. **Gömülebilir ağaç + okuma API'si**
16. **Aile etkinliği + RSVP**
17. **Zaman kilitli mektup**

### Dalga 5 — Ağır ya da dışa bağımlı
18. **Osmanlı ↔ modern yer adı sözlüğü + göç yolu** — *lisans görüşmesi Dalga 1'de başlatılmalı*, iş Dalga 5'te yapılır. Puanı yüksek, bağımsızlığı düşük: bekleyen tek şey lisans olmasın.
19. **Çevrimdışı yakalama + senkron** — en zoru (çakışma çözümü). Sona bilerek bırakıldı.
20. **Yüz tanıma ile foto etiketleme**
21. **GEDCOM 7 + GEDZIP**
22. **Araştırma görev yöneticisi**
23. **Toplu fotoğraf restorasyon**

---

## Sıradaki iki hamle

1. **Yedi Göbek ölçeri** yazılmaya başlanabilir — hiçbir şey beklemiyor.
2. **İki dış bağımlılık paralelde başlatılmalı** (ikisi de bizden değil, karar/görüşme işi):
   e-posta sağlayıcısı seçimi ve Index Anatolicus lisans görüşmesi. Bunlar beklerken
   Dalga 1 tamamlanır.
