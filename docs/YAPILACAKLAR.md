# Yapılacaklar / Backlog

## Kalıcı kural

- **Her geliştirme/bug/değişikliğin İngilizcesi de yapılır** (i18n TR+EN),
  onay beklemeden. (Kullanıcı talebi, 2026-08-13.)

## Araştırma özeti (hepsi tek sayfada)

Üç turun birleşik sentezi: **`docs/ARASTIRMA-OZETI.md`** — envanter, yedi bulgu,
savunma hattı, eksikler, karar tablosu, fiyatlama ilkesi ve nihai konumlandırma.
Kaynak belgeler: `GELISTIRME-PLANI.md` §2–3, `MYHERITAGE-INCELEME.md`,
`REKABET-ARASTIRMASI-2.md`.

## SIRA — `docs/YAPIM-SIRASI.md` (tek kaynak)

**60 iş, 1'den 60'a, beraberlik yok.** Sıralama ekseni puan değil **bozma riski**:
A) hiç kod yok → B) izole saf lib → C) yeni rota/bileşen → D) `Person` alanı ekleme
→ E) çekirdek (kimlik, depolama, senkron). Kendi değerlendirmem + bağımsız bir ajanın
kod okuyarak yaptığı ikinci değerlendirme birleştirildi.

### Düzeltmeler (bu belge yanlıştı)

- **GEDCOM medya (`OBJE`) eşlemesi ZATEN YAPILMIŞ** — `lib/gedcom.ts:159-166`,
  `tests/gedcom-media.test.mts`. Aşağıdaki "sonraki fikir" notu geçersiz.
- **Mobil uygulama "yalnız login/register" DEĞİL** — Aşama 0–8 bitmiş
  (liste, profil, ekle/düzenle, ağaç, harita, kitap, AI, paylaşım).
  Kalan yalnız **Aşama 9**: mağaza derlemesi + push.
- **"Bağlantısız kişi ekleme" büyük ölçüde var** — `PersonForm`'daki "Aile bağları"
  bölümü mevcut kişide ebeveyn/eş değiştiriyor. Kalan eksik yalnız **tuval üstü**
  sürükle/iki-tık ebeveyn değiştirme.

## Karar — hepsi yapılacak, sıra belli (2026-09-02)

**Hedef önceliği (kullanıcı):** 1) kendimizi tatmin etmek, 2) kullanıcıya değer,
3) para. Rekabet raporunun gelir odaklı sıralaması bu yüzden **geçersiz**; puanlama
yeniden yapıldı.

Puanlama, dalgalar ve gerçek yapım sırası: **`docs/PUANLAMA-VE-SIRA.md`**.
21 iş puanlandı (T×3 tatmin + K×3 kültürel derinlik + D×2 değer + E×2 ucuzluk +
B×2 bağımsızlık + P×1 para, azami 65) ve 5 dalgaya bölündü.

- **Dalga 1 (hemen, dış bağımlılık yok):** Yedi Göbek ölçeri · bağlantısız kişi +
  ebeveyn değiştirme · e-Devlet birincil onboarding · Anma Takvimi'nin uygulama içi
  kısmı · kitap/mezar QR.
- **Dalga 2:** e-posta altyapısı ve ona bağlı üç iş birlikte.
- **Dalga 3:** Sesli Şecere · genogram duygusal katman · kalıtsal hastalık · tarihsel bağlam.
- **Dalga 4:** katkı verici rolü · gömme + API · etkinlik/RSVP · zaman kilitli mektup.
- **Dalga 5:** Osmanlı yer adları (lisans) · çevrimdışı · yüz tanıma · GEDCOM 7 · vb.

**Paralelde hemen başlatılacak iki dış görüşme:** e-posta sağlayıcısı seçimi ve
Index Anatolicus lisansı. İkisi de bizim yazacağımız kod değil, karar/görüşme işi;
Dalga 1 bunlar beklerken tamamlanır.

## Yeni — Genogram duygusal ilişki katmanı (Dalga 3)

Elimizde genogram'ın **yapısal** katmanı (evlilik, boşanma, `formerSpouseIds`,
`parentLinks.kind` = evlat edinen/üvey/koruyucu) ve **tıbbi** katmanı (rahatsızlık,
ölüm nedeni) büyük ölçüde var. Eksik olan **duygusal ilişki katmanı**: iki kişi
*arasındaki* bağın niteliği, kişi üstünde bir alan değil, **iki uçlu bir kenar**.

Şu an yalnız `estranged` var ve o da kişiye/ebeveyn bağına iliştirilmiş durumda —
genel bir kenar değil. Yapılacak: `{ aId, bId, type, since?, note? }` biçiminde
ayrı bir kenar listesi.

**Yalnız 5–6 tür:** yakın · mesafeli · çatışmalı · kopuk · barışmış · bakım veren.
Tam klinik sembolojiye (kaynağa göre ~25–40 tür, ikiz/düşük/gebelik sembolleri)
**girilmez** — farklı alıcıya (terapist/genetik danışman) hitap eder ve kartlarımızı
okunmaz yapar. Varsayılan **kapalı**, `privateFields` ile maskelenebilir.

## Bekleyen — Gömülebilir ağaç + herkese açık API (kullanıcı isteği, 2026-09-02)

> "Kullanıcılar API ile kendi uygulamalarına gömebilsinler."

**İki ayrı yüzey — karıştırılmamalı:**

- **(A) Gömme (embed)** — *görsel*. `/embed/<token>` üst bar/menü olmayan salt-okunur
  ağaç; kullanıcı `<iframe>` ile kendi sayfasına koyar. Parametreler:
  `?view=agac|soy|yelpaze`, `?focus=<personId>`, `?theme=light|dark`, `?lang=tr|en`.
- **(B) API** — *veri*. `GET /api/v1/public/tree` → maskelenmiş JSON; tüketici kendi
  arayüzünü çizer.

**Elimizde zaten olan (bu yüzden ucuz):**

- Paylaşım jetonu zaten `<treeId>.<secret>` biçiminde bir **bearer**; `findValidShare()`
  doğruluyor, süre dolumu / iptal / ziyaret sayacı hazır (`lib/members.ts`).
- `resolveActiveTree()` hem çerezi hem `Authorization: Bearer` başlığını çözüyor →
  **rota başına değişiklik gerekmez** (mobil için yapılan iş burada da işe yarıyor).
- Gizlilik maskesi `lib/privacy.ts` `view()`; `hideLiving` zaten **paylaşım başına** ayarlı.
- Oran sınırlama `lib/rate-limit.ts`; genel rota izin listesi `proxy.ts`.

**Yapılacaklar:**

1. `/embed/<token>` rotası + `proxy.ts` izin listesine ekleme. `Workspace`'i
   `publicView` + `role="viewer"` ile, kabuk (TopBar/menü) olmadan render et.
2. **Çerçeveleme izni YALNIZ bu rotada.** Uygulamanın geri kalanı
   `X-Frame-Options: DENY` kalmalı (clickjacking). `/embed/*` için
   `Content-Security-Policy: frame-ancestors` — varsayılan `*`, isteğe bağlı olarak
   paylaşım başına alan adı listesi.
3. `GET /api/v1/public/tree` — jeton `Authorization: Bearer` ya da `?token=`;
   yanıt **her zaman** `view()`'dan geçer. CORS başlıkları + `OPTIONS` ön uçuşu.
4. Jeton başına oran sınırı. Paylaşımın `views` sayacı API çağrılarıyla şişmemeli —
   **ayrı sayaç** tut (ziyaret istatistiği insan ziyaretini ölçüyor).
5. **Sürümleme: `/api/v1/...`.** Üçüncü taraf tüketici olduğu an kırıcı değişiklik
   yapma hakkımızı kaybederiz; yolu baştan sürümle.
6. `ShareDialog`'a **kopyalanabilir gömme kodu** + canlı önizleme
   (`<iframe src="…" width="100%" height="600" style="border:0">`).
7. Belge: `docs/API.md` — uçlar, dönen alanlar, maskeleme kuralı, sınırlar, örnekler.
8. i18n TR + EN (kalıcı kural).

**Kararlar ve riskler:**

- **Yazma API'si şimdilik YOK — yalnız okuma.** Yazma; kimlik, rol, çakışma
  (`x-base-version`) ve kötüye kullanım yüzeyini birden büyütür. İstenirse ayrı iş.
- Maskelenmemiş veri API'den **asla** çıkmamalı. `view()`'u atlayan tek bir uç, tüm
  gizlilik katmanını boşa çıkarır → bunun için **test yazılmalı**.
- Gömülü ağaç fotoğrafları Cloudinary'den çeker; tüketicinin sayfa CSP'si engelleyebilir.
  Belgede uyarı + gerekli alan adları listelensin.
- **Konumlandırmayla uyumlu:** "veriniz sizin, kilitlenme yok" duruşunun en güçlü hâli;
  "dışa aktarım her zaman açık" ilkesinin doğal devamı.
- **Ücretlendirme:** gömme *ücretsiz* kademede kalmalı (yayılma etkisi — her gömülü ağaç
  bir tanıtım yüzeyi). **API kotası** ücretli kademeye konabilir.
- Rekabet araştırmasında bu başlık taranmadı; rakiplerde gömme/API var mı ayrıca
  bakılmalı (iddiada bulunulmadı).

## Rekabet araştırması #2 (Eylül 2026) — aday işler

Geniş rekabet taraması: **`docs/REKABET-ARASTIRMASI-2.md`** (3 ajan, ~145 arama).
Öne çıkan sonuç: en savunulabilir farkımız soyağacı özellikleri değil, **kültürel
altyapı** (Türkçe akrabalık motoru, 1934 öncesi patronim, e-Devlet PDF, kirve/çevre,
alan bazında gizlilik). NVİ **mevzuat gereği yan soyu (kardeş/amca/dayı/hala/teyze)
veremez** → kalıcı boşluk. Konum: *"e-Devlet size atalarınızı verir. Ailenizi vermez."*

Aday işler (öncelik sırasıyla, hiçbiri onaylanmadı):

1. **Anma Takvimi + bildirim** — ölüm tarihinden 3/7/40/52. gece + sene-i devriye;
   Hicri/Miladi çift takvim; aileye göre açılıp kapanabilir. *(E-postaya bağlı.)*
2. **Aile Bülteni** — otomatik aylık özet e-postası (Trove modeli). *(E-postaya bağlı.)*
3. **Dışa dönük soru motoru + hikâye talebi** — girişsiz cevaplanan haftalık soru.
   *(E-postaya bağlı; `lib/reminders.ts` + `lib/email.ts` zaten hazır.)*
4. **e-Devlet PDF'ini birincil onboarding yapmak** + hemen yan soyu doldurmaya davet.
5. **"Yedi Göbek" tamamlanma ölçeri** — anneanne hattını ayrı puanlar (en çok
   şikâyet edilen e-Devlet eksiğini hedefler). Maliyet/etki oranı en yüksek fikir.
6. **Katkı verici rolü** (contributor ≠ editor) — sektörün en çok istenen özelliği.
7. **Kitapta sesi çalan QR** + mezar QR sayfası (Türkiye'de kurulu pazar).
8. **Osmanlı ↔ modern yer adı sözlüğü** + göç yolu katmanı. *(Index Anatolicus lisansı.)*
9. **Sesli Şecere** — yaşlıdan rehberli ses kaydı → Gemini deşifre → onaylı ağaç kaydı.
10. **Kalıtsal hastalık örüntüsü** görünümü. **Risk yüzdesi ASLA hesaplanmaz.**
11. GEDCOM 7 + **GEDZIP** dışa aktarım (5.5.1 varsayılan KALIR — Ancestry/FTM 5.5
    üstünü reddediyor).
12. Bağlantısız kişi + iki tıkla ebeveyn değiştirme (çok 1-yıldız üretiyor).

**Bilerek yapılmayacaklar:** DNA · kendi kayıt arşivi · ulusal aşiret dizini
(1934 Soyadı Kanunu bağlamı — nötr, kullanıcının yazdığı "sülale" alanı olur) ·
tam klinik genogram sembolojisi · risk skoru · mobilde web'i aynalamak.

## Bekleyen — E-posta altyapısı (sağlayıcı/anahtar kararı bekliyor)

- Doğum/ölüm/evlilik yıl dönümü **e-posta hatırlatmaları** ve üyelik/bildirim/
  paylaşım **işlemsel e-postaları**. Sağlayıcı (Resend/SendGrid/SES), gönderen
  alan adı ve ortam anahtarları kullanıcıdan gelince uygulanacak. Ayrıntı ve
  yapılacaklar: **`docs/EPOSTA-PLANI.md`**.

## Yapıldı — herkese açık salt-okunur paylaşım (üyeliksiz)

- Ağaç sahibi (admin) bir **bağlantı + kod + QR** üretir; bunu bilen herkes
  **üye olmadan** ağacı yalnızca görüntüler. `/g/<token>` (genel), `/g` (kod
  yapıştır). Sahip arayüzü: `ShareDialog` (aç/kapat, yenile, yaşayanları gizle).
- Salt-okunur + gizlilik `role=viewer`/`publicView` ile zorlanır; sunucu API'si
  zaten anonim ziyaretçiye yazma vermez (401). Jeton tahmin-edilemez bearer.
- QR sunucuda üretilir (`qrcode`), istemciye PNG data-URL olarak gider.

## Yapıldı — çok-biçimli aktarım + MyHeritage incelemesi

- MyHeritage incelemesi: `docs/MYHERITAGE-INCELEME.md`.
- İçe/dışa aktarım artık **GEDCOM + CSV + JSON** (`lib/import.ts`, biçim otomatik
  algılanır; CSV/JSON'da id/baba/anne/eş ile bağlar korunur). Testler:
  `tests/import.test.mts`.
- Sonraki fikir: GEDCOM dışa aktarımında fotoğraf URL'lerini `OBJE` olarak yaz
  (medya taşınsın).

## Bekleyen — Supabase Auth devamı (sonra yapılacak)

3b+3c PR #48'de. Bayrak (`SUPABASE_AUTH_LOGIN`) kullanıcı hazır olunca açılacak.
Sonraki adımlar (ayrı PR'lar):

- **Faz 3d — hesapsız (misafir) giriş:** Supabase Anonymous sign-in. Özellikle
  mobil için; kullanıcı kaydolmadan ağaç oluşturup gezebilir.
- **Faz 3e — gerçek e-posta ile bağlama:** sentetik iç e-postayı kullanıcının
  gerçek e-postasıyla değiştirip hesabı kalıcılaştırma (doğrulama + parola
  sıfırlama Supabase akışlarıyla).
- **Faz 4 — eski yolu kaldırma:** tüm hesaplar Auth'a taşınınca bcrypt yedeğini
  ve Blob `users.json` kimlik deposunu emekliye ayır.

Ayrıntı: `docs/SUPABASE-GECIS.md`.

### Not — e-posta bağlamak (2026-08-19 görüşmesi)

Uygulama e-posta olmadan tam çalışıyor: giriş = soyadı + şifre, kurtarma =
**kurtarma kodu**, davet/paylaşım = link/jeton. Şu an tek gerçek boşluk:
kullanıcı **hem şifresini hem kurtarma kodunu** kaybederse hesap kurtarılamıyor.

- **İsteğe bağlı e-posta ile şifre sıfırlama** eklenebilir (asıl fayda: kurtarma
  güvenlik ağı). Faz 3e ile örtüşür.
- Gerektirir: bir **e-posta sağlayıcısı** (Resend/Postmark/SMTP) + API anahtarı/env.
- Gizlilik: **isteğe bağlı ve gizli** tutulmalı; kullanıcının kişisel e-postası
  asla herkese açık yüzeyde gösterilmez.
- Karar: lansman için **şart değil**; ileride istenirse eklenecek.

---

## Bug listesi (kullanıcı bildirimi — TAMAMLANDI ✓, PR #48)

1. ✓ Panel özet rakamları tıklanabilir → ilgili kişileri alt pencerede listeler.
2. ✓ Panel: cinsiyet dağılımı donut (pasta) grafiği + tıklanabilir açıklama.
3. ✓ Liste gelişmiş filtre → Eğitim'e "Okul bilgisi yok" seçeneği.
4. ✓ Meslek: ağaçtaki mesleklerden datalist + Türkçe-duyarlı eşleşme
   (ogretmen → Öğretmen).
5. ✓ Zaman: yalnız dikey kaydırma; sağa kayma giderildi, yıllar üstte yapışık.
6. ✓ Panel: "Yaşayan en yaşlılar" ve "En gençler" kartları.
7. ✓ Panel: "En uzun yaşamışlar" (yaşayan/ölmüş, en yüksek yaş).
8. ✓ Panel: doğuştan/sonradan rahatsızlık, ölüm nedeni, cinsel yönelim,
   çok eşlilik, birden çok evlilik (yalnız veri varsa; maskeli; tıklanır).
9. ✓ Yelpaze: boş alana tıklayınca profil kapanır.
10. ✓ Yelpaze: dilimlerde yalnız isim (patronim/soyad değil).
11. ✓ "Torunlar" görünümü kaldırıldı.
12. ✓ İlk yüklemede profil paneli kendiliğinden açılmaz (demo dâhil).
13. ✓ Üç-nokta menüsü artık açık profilin üstünde (z-index).
14. ✓ Fotoğraf yoksa avatar her zaman otomatik üretilir.
15. ✓ Baba adı varsa soyad zorunlu değil.
16. ✓ Esnek tarih girişi ("01022022", / ve - ayraçları, AAYYYY, YYYY).
