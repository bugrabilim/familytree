# Yapım Sırası — 64 iş, bende kolaydan → sende bitene

> **Sıralama ekseni:** *Claude'un tek başına ne kadar kolay yapabildiği.* En başta
> benim hiç dış girdi olmadan yazıp test edebildiğim işler; sonra giderek zorlaşan,
> senin gözden geçirmeni gerektiren işler; en sonda **ben yapamadığım, senin yapman
> gereken** işler.
>
> Önceki sürüm "bozma riski" eksenindeydi. O eksen hâlâ değerli olduğu için her satırda
> **kademe** sütunu olarak duruyor (A=kod yok · B=izole saf lib · C=yeni rota/bileşen ·
> D=`Person` alanı ekleme · E=çekirdek). İki okuma da mümkün.
>
> **64 iş** — önceki 60'tan 4 fazla, çünkü dört işin *hesap* kısmı ile *görünüm* kısmı
> bu eksende farklı bantlara düşüyor (Yedi Göbek, kalıtsal hastalık, anma takvimi,
> soyadı haritası). Hesap kısmı bende en kolay bant, görünüm kısmı bir üst bant.

## Bantlar

| Bant | Kim yapar | Sıra |
|---|---|---|
| **K1** | Ben — saf mantık + test, dış girdi yok, `npm test` ile doğrularım | 1–11 |
| **K2** | Ben — yeni görünüm/rota, mevcut arayüze dokunmuyor, tarayıcıda doğrularım | 12–25 |
| **K3** | Ben — mevcut koda dokunuyor, mekanik ama geniş | 26–32 |
| **K4** | Ben yazarım, **senin gözden geçirmen gerekir** — çekirdek/riskli | 33–45 |
| **K5** | **Ortak** — kodu ben yazarım, anahtarı/hesabı sen verirsin | 46–53 |
| **K6** | **Sen** — ben yapamam | 54–64 |

---

## K1 — Bende en kolay: saf mantık + test (1–11)

Hepsi yeni ve izole. Mevcut hiçbir dosya değişmiyor, arayüz yok, dış servis yok.

| # | İş | Kademe | Çıktı |
|---|---|:-:|---|
| 1 | Belge düzeltmesi — GEDCOM `OBJE` bitmiş, mobil Aşama 0–8 bitmiş | A | `docs/YAPILACAKLAR.md` | ✅
| 2 | **Çift takvim (Hicri/Miladi)** | B | yeni `lib/hijri.ts` + `tests/hijri.test.mts` | ✅
| 3 | Rehberli soru bankası | B | yeni `lib/prompts.ts` — 45, 49, 50'nin ortak tabanı | ✅
| 4 | "Yedi Göbek" **hesabı** | B | yeni `lib/completeness.ts` + test | ✅
| 5 | Referans bütünlüğü süpürücüsü | B | sarkan `associations[].personId` / `parentLinks` / `spouseIds` denetimi | ✅
| 6 | Tarihsel bağlam indeksi | B | yeni `lib/era.ts` — **yalnız zaman ekseni**, yer eşlemesi 43'e bırakılır | ✅
| 7 | Soyadı yaygınlık **toplayıcısı** | B | saf toplayıcı (`aggregatePlaces` kalıbı) | ✅
| 8 | Kalıtsal hastalık **türeticisi** | B | saf; alanlar zaten var. **Risk yüzdesi asla hesaplanmaz** | ✅
| 9 | Anma Takvimi **üreticisi** (3/7/40/52. gece + sene-i devriye) | B | saf; 2'ye bağlı | ✅
| 10 | **`view()` kaçağı testi + lint kuralı** | C | 31 ve 34'ten önce şart: tek satır kaçak tüm gizlilik katmanını boşa çıkarır | ✅
| 11 | Mobil CI tip denetimi | C | ayrı `tsc --noEmit` adımı; `apps/` bugün denetimsiz | ✅

## K2 — Bende kolay: yeni görünüm/rota (12–25)

Mevcut arayüzü değiştirmiyor; Playwright ile ekran görüntüsü alıp doğrularım.

| # | İş | Kademe | Not |
|---|---|:-:|---|
| 12 | Yedi Göbek **kartı** | B | 4'ün görünümü; anneanne hattı ayrı puanlanır | ✅
| 13 | Kalıtsal hastalık **görünümü** | B | 8'in görünümü; `view()`'dan geçer | ✅
| 14 | Anma Takvimi **görünümü** | B | 9'un görünümü, `CalendarView.tsx` | ✅
| 15 | Soyadı yaygınlık **haritası** | B | 7'nin katmanı | ✅
| 16 | Genel rota izin listesini merkezîleştir | C | `proxy.ts` elle yazılmış `if`; 17, 24, 36, 45 buraya dört yeni yüzey ekleyecek | ✅
| 17 | Mezar QR sayfası | C | `/g/<token>` kalıbının tek kişiye daraltılmışı | ✅
| 18 | Kitapta sesi çalan QR | C | `qrcode` + `Memory.audio` hazır | ✅
| 19 | Haritaya zaman kaydırıcısı + kuşak filtresi | C | tek dosya, salt görüntü durumu | ✅
| 20 | Göç yolu katmanı | C | kullanıcı metni + `birthCoords`/`burialCoords` ile; 43 sonradan zenginleştirir | ✅
| 21 | GEDCOM 7 + GEDZIP | C | 5.5.1 varsayılan **kalır** → mevcut yol hiç değişmez |
| 22 | Araştırma görev yöneticisi | C | `consistency.ts` + `RecordHints` zaten iş üretiyor |
| 23 | Aile tarifleri | C | **ayrı koleksiyon**; `Person`'a alan olarak eklenirse K3'e düşer |
| 24 | Zaman kilitli mektup | C | içerik istemciye **asla** erken gitmez: API seviyesinde kapı + testi |
| 25 | Taziye / vefat duyurusu nesnesi | C | kültürel olarak en hassas yüzey; ayrı nesne, `Person`'a dokunmaz |

## K3 — Bende orta: mevcut koda dokunuyor (26–32)

| # | İş | Kademe | Neden zorlaşıyor |
|---|---|:-:|---|
| 26 | **`Person` alan kayıt defteri** | D | Geniş ama tamamen mekanik. Bugün bir alan 5 yeri güncelliyor (`types/family.ts` + `PersonForm` 1637 sr + iki API rotası + `PersonDrawer` 951 sr + `i18n-dict` 2731 sr). **Sonraki tüm alan işlerini bir bant ucuzlatır** → 27 ve 28'den önce. |
| 27 | Nötr **"sülale"** alanı | D | Kanonik alan-ekleme işi. Asla hazır taksonomi, asla soyaddan çıkarım |
| 28 | Genogram duygusal ilişki katmanı | D | İki uçlu **kenar listesi** = yeni birinci sınıf veri türü. 5–6 tür, varsayılan kapalı |
| 29 | `lib/history.ts` fark tabanlı yeniden yazım | E | Her kaydetmede tüm kişi listesini kopyalıyor; `people-diff.ts` zaten var. 44'ün ön koşulu |
| 30 | Sesli Şecere | C | `AudioRecorder` + Gemini hattı hazır; ses akışı doğrulaması bende zor kısım. 3'e bağlı |
| 31 | Gömülebilir ağaç `/embed/<token>` | C | Riski rota değil, **global güvenlik ayarı**: `X-Frame-Options: DENY` yalnız burada gevşer. 10'a bağlı |
| 32 | Tuval üstü ebeveyn değiştirme | C | Çekirdek etkileşim dosyası; yanlış bırakma = sessiz veri bozulması |

## K4 — Yazarım, senin gözden geçirmen gerekir (33–45)

Buradan sonrası canlı veriye, kimliğe veya göç yoluna dokunuyor. Kodu ben yazarım
ama **canlıya almadan önce senin bakman** doğru olur.

| # | İş | Kademe | Neden |
|---|---|:-:|---|
| 33 | Paylaşımlı oran sınırı | C | `rate-limit.ts` örnek-içi bellekte — sunucusuzda gerçek sınır değil. Supabase tablosuyla yapılır (yeni hesap gerekmez). 34 ve 36'dan önce |
| 34 | Herkese açık okuma API'si `/api/v1/public/tree` | C | 10 ve 33 olmadan yapılmaz. Sürümleme baştan `/v1` |
| 35 | Katkı verici rolü | E | `ORDER = ["viewer","editor","admin"]` dizisine kademe sokmak = **her yetki kapısını** yeniden değerlendirmek. **55'e bağlı** |
| 36 | Aile etkinliği + RSVP | C | **anonim yazma yüzeyi** açıyor |
| 37 | Osmanlı ↔ modern yer adı sözlüğü | C | `resolvePlace` **ortak çözüm yolunu** değiştiriyor → mevcut pinleri kaydırabilir. **58'e (lisans) bağlı** |
| 38 | Yerleşim arama: modern + tarihî | C | 37'nin verisini tüketir |
| 39 | Storyworth için ayrı giriş kapısı | E | "Ağaçsız hesap", `accountId === treeId` **değişmezini** kırıyor |
| 40 | **e-Devlet PDF'ini birincil onboarding yapmak** | E | Ayrıştırıcı zaten çalışıyor → bu yeni yetenek değil, **canlı ilk-temas akışının yeniden yazımı**. "Bozarsan herkes görür" katsayısı en yüksek iş |
| 41 | Supabase Faz 3d — misafir giriş | E | Kimliksiz hesap türü `isFounder`/`treeId` çözümünün her dalını etkiler |
| 42 | Supabase Faz 3e — e-posta ile kalıcılaştırma | E | Çalışan hesapların kimlik anahtarını yerinde değiştirmek |
| 43 | Blob ↔ Supabase kayma denetimi | E | İki kaynağın ayrışmadığını gösteren araç yok. **45'in gerçek ön koşulu** |
| 44 | Çevrimdışı yakalama + senkron | E | **Yalnız mobilde.** İyimser kilitle (`x-base-version`) çakışıyor. 29'a bağlı |
| 45 | Supabase Faz 4 — bcrypt + `users.json` emekliye | E | **Tek geri dönüşü olmayan iş.** 43, 46 ve 51 olmadan yapılmaz |

## K5 — Ortak: kod bende, anahtar sende (46–53)

Her satırda **ben ne teslim ederim** ve **senden ne gerekir** ayrı yazıldı.

| # | İş | Ben teslim ederim | Senden gereken |
|---|---|---|---|
| 46 | Otomatik zamanlanmış yedek | cron rotası + yedek hedefi | `CRON_SECRET`, hedef karar |
| 47 | Otomatik aile bülteni | cron + şablon (`reminders` kalıbı hazır) | **e-posta anahtarı (54)** |
| 48 | Anma Takvimi bildirimi | mevcut cron rotasına ek | **e-posta anahtarı (54)** |
| 49 | Dışa dönük soru/istem motoru | gönderim + girişsiz yanıt + **onay kuyruğu** | **e-posta anahtarı (54)** |
| 50 | Hikâye talebi | 49'un ikinci yüzü, aynı boru hattı | **e-posta anahtarı (54)** |
| 51 | E-posta ile şifre sıfırlama | akış + jeton + test | **e-posta anahtarı (54)** |
| 52 | Fotoğraf zenginleştirme | yalnız deterministik dönüşüm (`e_improve`/`e_sharpen`/`e_upscale`) | Cloudinary eklenti/kota kararı |
| 53 | Toplu fotoğraf tarama/restorasyon | toplu yükleme hattı | kota/maliyet onayı |

**Kural (49 için):** girişsiz yanıt kayda **doğrudan yazmaz**, jeton başına sınırlı bir
**onay kuyruğuna** düşer. Bu karar verilmezse iş bir bant yukarı çıkar.

## K6 — Senin işin, ben yapamam (54–64)

| # | İş | Neden bende değil |
|---|---|---|
| 54 | **E-posta sağlayıcısı hesabı + gönderen alan adı + API anahtarı** | Hesap açma, alan adı doğrulama, ödeme. Kod zaten yazılı. **8 işi açıyor (47–51 dâhil)** |
| 55 | **Elle test: üyeler ve davetler** (`/join`, roller) | Gerçek hesap, gerçek davet, iki tarayıcı. **35'ten önce olmalı** |
| 56 | **Elle test: bağlı ağaçlar** (pairing, `/pair`) | İki gerçek hesap gerekiyor. En karmaşık yazma yolu, hiç elle koşulmamış |
| 57 | **Mobil Aşama 9** — mağaza derlemesi + imzalama + push sertifikaları | Apple/Google geliştirici hesabı, imzalama anahtarları, senin makinen. Aşama 0–8 bitmiş |
| 58 | **Index Anatolicus lisans görüşmesi** | Kurumsal görüşme; **aylar sürebilir**. 37 ve 38'i açıyor |
| 59 | Karar: aile meclisi / fon kapsamı | Para hareketi = finansal düzenleme. Öneri: **hayır** |
| 60 | Karar: telefonla hikâye kaydı (BTK/operatör) | Numara tahsisi araştırması. Öneri: **hayır** — 30 aynı ihtiyacı karşılıyor |
| 61 | Karar: kuşak adı/rütbesi terminolojisi | Türkçede karşılığı var mı? Öneri: **yok, alan eklenmesin** — 27'ye erir |
| 62 | Karar: tek seferlik kalıcı arşiv (ürün/hukuk/ödeme) | Süre taahhüdü + saklama garantisi. Öneri: "sonsuza dek" yerine **"X yıl + her an tam dışa aktarım"** |
| 63 | Karar: yüz tanıma (KVKK) | Yüz verisi **özel nitelikli kişisel veri**. Öneri: **yapılmasın** |
| 64 | Karar: şifreli belge kasası | Anahtar kaybı = kalıcı veri kaybı. Öneri: yerine **imzalı, süreli erişim** |

---

## Sonradan eklenenler — burç ve yükselen (kullanıcı isteği, 2026-09-02)

> Mevcut 1–64 numaraları **değişmedi**; commit ve PR'larda onlara atıf yapıldı.
> Yeni işler 65'ten devam ediyor, ama her biri **hangi banda ait olduğu** ve
> **sırada nerede koşacağı** ile yazıldı.

| # | İş | Bant | Koşma yeri | Durum |
|---|---|:-:|---|---|
| **65** | **Burç (güneş burcu)** — `lib/zodiac.ts` | K1 | — | ✅ **yapıldı** |
| **66** | **`birthTime` alanı + yükselen burç** | K3 | 26'dan (alan kayıt defteri) **sonra** | ⛔ alan yok |
| **67** | **Burç karakteristik özellikleri** | K1 | 65'in yanına | ✅ **yapıldı** |

### 65 — Burç ✅

Yalnız doğum tarihinden hesaplanıyor, yeni alan gerekmiyor. Element (ateş/toprak/
hava/su) da veriliyor. `PersonDrawer`'da doğum tarihinin hemen altında görünüyor.

**Sabit tarih tablosu (kullanıcı kararı, 2026-09-02).** Burç tarihleri her yıl
aynıdır — Koç 21 Mart, Boğa 20 Nisan, ve devamı. Önce "sınırdasın" uyarısı
eklemiştim; kaldırıldı. Yaygın burç tabloları sabit tarih verir, insanlar öyle
bilir, ürün de öyle davranır.

*(Olgusal not, kayda geçsin diye: Güneş'in burca giriş **anı** yıldan yıla birkaç
saat oynar ve ekinoks 19–21 Mart arasında değişir. Ama bu ürünün kullandığı
sözleşme sabit tablodur; ikisi farklı şeylerdir ve karıştırılmamalı.)*

**Gizlilik:** burç, maskelenmiş kişide görünmez. Doğum tarihinin ~1 aylık
aralığını ele verdiği için bu bilinçli — `PersonDrawer` burcu `view()`'dan geçmiş
kişiden hesaplıyor, maskeli kişide `birthDate` taşınmadığından kendiliğinden boş
kalıyor. Testi var.

### 66 — `birthTime` + yükselen ⛔

Yükselen burç, doğum **anının** ve **yerinin** ikisini birden ister:

- **Saat:** `birthTime` alanı **yok**, eklenmeli → kanonik D bandı işi
  (`types/family.ts` + `PersonForm` + iki API rotası + `PersonDrawer` + i18n).
  Bu yüzden **26'dan (alan kayıt defteri) sonra** yapılmalı; o iş bunu bir bant
  ucuzlatıyor.
- **Yer:** `birthCoords` **zaten var** (harita işinde eklenmişti) — enlem/boylam
  hazır.
- **Hesap:** yerel yıldız zamanı + ekliptik eğimi + enlemden yükselen derecesi.
  Gerçek gökbilim; Hicri takvimde olduğu gibi **doğrulama çıpası** gerekiyor,
  yoksa sessizce yanlış sonuç üretir. Çıpa bulunmadan yazılmamalı.

`birthTime` ayrıca burç dışında da işe yarar: nüfus kayıtlarında doğum saati
geçer ve bazı aileler bunu tutar.

### 67 — Burç karakteristik özellikleri ✅

**Düzeltme (kullanıcı, 2026-09-02):** Bunu önce yanlış anlamıştım. Kastedilen
kişiye özel bir yorum değil — **her burcun genel karakteristik özellikleri**.

| Yanlış anladığım | Kastedilen |
|---|---|
| Kişi hakkında iddia ("Dedeniz muhtemelen inatçıydı") | Burç hakkında bilgi ("Boğa inatçılıkla anılır") |
| Kaynaksız, kişiye özel, uydurulmuş | Statik, genel, ansiklopedik |
| `Source` disiplinini bozar | Bozmaz — kişi kaydına hiçbir iddia girmez |
| YZ gerekir | YZ gerekmez |

Yapıldı: `ZODIAC_TRAITS` her burç için dört özellik taşıyor, metinler
`lib/i18n-dict.ts`'te TR ve EN. Arayüzde burcun altında rozet olarak duruyor ve
yanında *"Burcun genel özellikleri; kişi hakkında bir kayıt değildir."* notu var —
ayrım kullanıcıya da görünür.

## ⚠️ Bu sıralamanın tek kusuru

Sen "senin işler sonda olsun" dedin ve liste öyle kuruldu — ama **K6'daki iki madde
blokaj.** Sonda bırakılırsa 10 iş askıda kalır:

| Madde | Kilitlediği işler |
|---|---|
| **54 — e-posta anahtarı** | 47, 48, 49, 50, 51 · dolaylı olarak 45 |
| **58 — Index Anatolicus lisansı** | 37, 38 |
| **55 — üyeler/davet elle testi** | 35 |

**Öneri:** 54, 58 ve 55 sırada sonda dursun ama **takvimde bugün başlasın.** Üçü de
oturup yapılacak iş değil — biri hesap açma, biri e-posta yazıp beklemek, biri yarım
saatlik test. Ben 1'den başlayıp 32'ye kadar sana hiç ihtiyaç duymadan ilerlerim; o
sırada bu üçü tamamlanmış olur ve K4/K5 açık bulunur.

## Şimdi

**Sıra 1–11 tamamen bende ve hiçbiri seni beklemiyor.** İlk kod: **2 — `lib/hijri.ts`**,
kendi testiyle gelir ve 9 ile 14'ü açar.
