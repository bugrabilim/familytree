# Yapım Sırası — 60 iş, 1'den 60'a

> **Bu belge sıranın tek kaynağıdır.** `docs/PUANLAMA-VE-SIRA.md` puanlama
> gerekçesini tutar ama sırası **geçersizdir**; sıra buradan okunur.
>
> **Karar:** hepsi yapılacak. Eleme yok, beraberlik yok — her işin tek numarası var.
>
> **Sıralama ekseni:** puan değil, **bozma riski.** Hiç kod değiştirmeyen işler başta;
> mevcut veri modelini, kimlik doğrulamayı ve çekirdek akışları değiştiren işler sonda.
> Aynı kademe içinde basitten zora.
>
> **Yöntem:** kendi değerlendirmem + bağımsız bir ajanın kod tabanını okuyarak yaptığı
> ikinci değerlendirme birleştirildi. Ajanın itirazlarının tamamı kodda doğrulandı ve
> çoğu kabul edildi (bkz. §4).

## Kademeler

| Kademe | Ne demek | Sıra |
|---|---|---|
| **A** | Hiç kod yok — karar, görüşme, lisans, elle test, belge | 1–9 |
| **B** | Salt ekleme, izole saf `lib` + yeni görünüm; mevcut dosya değişmiyor | 10–17 |
| **C** | Yeni rota / yeni bileşen / tek mevcut görünüme ek; tip sistemi değişmiyor | 18–42 |
| **D** | `types/family.ts`'e alan ekleme — bu projede 5 yeri birden günceller | 43–49 |
| **E** | Çekirdek: kimlik doğrulama, depolama, senkron, mevcut akış yeniden yazımı | 50–60 |

---

## KADEME A — hiç kod yok (1–9)

| # | İş | Neden burada |
|---|---|---|
| 1 | **E-posta sağlayıcısı + alan adı + anahtar** | İş değil, bir env değişkeni. Kod yazılmış (`lib/email.ts`, `api/cron/reminders`). Tek başına **5 işi** açıyor. Bugün yapılır. |
| 2 | **Belge düzeltmesi** — GEDCOM `OBJE` bitmiş ama "sonraki fikir" yazıyor; mobil Aşama 0–8 bitmiş ama plan yansıtmıyor | 10 dakika. Yanlış kapsamlı planlamanın kaynağı doğrudan bu. |
| 3 | **Index Anatolicus lisans görüşmesi** | Kod değil, görüşme; **aylar sürebilir** → 41 ve 42 beklemesin diye 1. günde başlar. |
| 4 | **Elle test: üyeler ve davetler** (`/join`, roller) | Hiç doğrulanmamış yetki akışının üstüne 50, 39, 40 kurulacak. |
| 5 | **Elle test: bağlı ağaçlar** (pairing, `/pair`) | En karmaşık yazma yolu, hiç elle koşulmamış. |
| 6 | **Kapsam kararı: aile meclisi / fon** | Yalnız "hayır" demek (§5). |
| 7 | **Uygulanabilirlik kararı: telefonla hikâye kaydı** | BTK/operatör araştırması; muhtemelen kapanır (§5). |
| 8 | **Terminoloji kararı: kuşak adı/rütbesi** (항렬 · 字辈) | Türkçede karşılığı var mı? "Yok" ise iş 44'e erir. |
| 9 | **Ürün/hukuk kararı: tek seferlik kalıcı arşiv** | Süre taahhüdü + ödeme + saklama garantisi kararı, koddan önce. |

## KADEME B — salt ekleme, izole (10–17)

| # | İş | Dosya | Not |
|---|---|---|---|
| 10 | **Çift takvim (Hicri/Miladi)** | yeni `lib/hijri.ts` + test | Kod tabanında **hiç hicri izi yok**. Listedeki tek matematiksel doğruluk yükü — kendi testini hak ediyor. |
| 11 | **Rehberli soru bankası → saf lib** | yeni `lib/prompts.ts` | Bugün `MEMORY_PROMPTS` 8 anahtar. 45, 46 ve 35'in ortak tabanı; şimdi ayrılırsa üçü birbirini beklemez. |
| 12 | **"Yedi Göbek" tamamlanma ölçeri** | yeni `lib/completeness.ts` | `ancestorDepths()` hazır. Anneanne hattı ayrı puanlanır. |
| 13 | **Tarihsel bağlam indeksi** | yeni `lib/era.ts` | **Yalnız zaman ekseninde** kurulacak; yer eşlemesi 41 gelince ek katman olur (yoksa 41'i bekler). |
| 14 | **Soyadı yaygınlık haritası** | saf toplayıcı + mevcut haritaya katman | Var olan veriden türetme, yazma yok. |
| 15 | **Kalıtsal hastalık örüntüsü** | saf türetici + yeni görünüm | Alanlar (`congenitalCondition`, `healthCondition`, `deathCause`) **zaten var** → yeni alan yok. `view()`'dan geçer. **Risk yüzdesi asla hesaplanmaz.** |
| 16 | **Referans bütünlüğü süpürücüsü** | yeni saf denetleyici | Silme/birleştirme sonrası sarkan `associations[].personId`, `parentLinks` anahtarı, `spouseIds` denetimi. `consistency.ts` tarihe bakıyor, referansa bakmıyor. |
| 17 | **Anma Takvimi — uygulama içi üretim + görünüm** | saf lib + `CalendarView.tsx` | 3/7/40/52. gece + sene-i devriye. 10'a bağlı. Bildirimi ayrı iş (28). |

## KADEME C — yeni rota / bileşen (18–42)

| # | İş | Not |
|---|---|---|
| 18 | **`view()` kaçağı testi + lint kuralı** | 39 ve 40'tan **önce** olmalı: tek satırlık maskeleme kaçağı tüm gizlilik katmanını boşa çıkarır. Test = sıfır risk, en yüksek kaldıraç. |
| 19 | **Genel rota izin listesini merkezîleştir** | `proxy.ts` elle yazılmış bir `if` bloğu; 21, 32, 39, 45 buraya dört yeni genel yüzey ekleyecek. |
| 20 | Kitapta sesi çalan QR | `qrcode` ve `Memory.audio` hazır; iki parçayı birleştirmek. |
| 21 | Mezar QR sayfası | `/g/<token>` kalıbının tek kişiye daraltılmış kopyası. |
| 22 | Haritaya zaman kaydırıcısı + kuşak filtresi | Tek dosya (`PlacesMap.tsx`), salt görüntü durumu. |
| 23 | Göç yolu katmanı | **Kullanıcının yazdığı metin + `birthCoords`/`burialCoords` ile** çalışacak; 41 sonradan zenginleştirir. |
| 24 | GEDCOM 7 + GEDZIP | 5.5.1 varsayılan **kalır** → mevcut yol hiç değişmez. `OBJE` işi zaten bitmiş, emek sanılandan az. |
| 25 | Araştırma görev yöneticisi | `consistency.ts` + `RecordHints` zaten "yapılacak iş" üretiyor, onları besler. |
| 26 | Aile tarifleri | **Ayrı koleksiyon** olarak; `Person`'a alan olarak eklenirse D'ye düşer. |
| 27 | Otomatik aile bülteni | `/api/cron/reminders` kalıbı hazır. **1'e bağlı.** |
| 28 | Anma Takvimi bildirimi | Mevcut cron rotasına ek. **1 ve 17'ye bağlı.** |
| 29 | Taziye / vefat duyurusu nesnesi | Kültürel olarak en hassas yüzey — yanlış kişiye "vefat" göstermek affedilmez. Ayrı nesne, `Person`'a dokunmaz. |
| 30 | Zaman kilitli mektup | İçerik istemciye **asla** erken gitmemeli: API seviyesinde zaman kapısı + testi. |
| 31 | **Paylaşımlı oran sınırı** (Upstash/Supabase) | `lib/rate-limit.ts` örnek-içi bellekte — sunucusuzda **gerçek sınır değil**. 32 ve 40'tan önce şart. |
| 32 | Aile etkinliği + RSVP | **Anonim yazma yüzeyi** açıyor; 31 olmadan yapılmaz. |
| 33 | Mobil CI tip denetimi | `apps/` kök tsconfig/eslint dışında — web'i koruyor ama mobili denetimsiz bırakıyor. |
| 34 | **Native mobil — Aşama 9** (mağaza derlemesi + push) | Aşama 0–8 **bitmiş**. `apps/` hariç tutulduğu için web derlemesini **matematiksel olarak bozamaz**: emek yüksek, risk sıfıra yakın. |
| 35 | Sesli Şecere | `AudioRecorder` + çok-parçalı Gemini hattı hazır; yazma mevcut onaylı yoldan. Yeni alan yok. 11'e bağlı. |
| 36 | Fotoğraf zenginleştirme | **Yalnız deterministik dönüşümler** (`e_improve`, `e_sharpen`, `e_upscale`). Üretken renklendirme yok (§5). |
| 37 | Toplu fotoğraf tarama/restorasyon | İzole ama ağır; kota/maliyet yüzeyi büyük (§5'te itiraz var). |
| 38 | Tuval üstü ebeveyn değiştirme | Küçük, ama **çekirdek etkileşim** dosyasına dokunuyor; yanlış bırakma = sessiz veri bozulması. Geri alma güvenlik ağı var. |
| 39 | Gömülebilir ağaç `/embed/<token>` | Riski rotanın kendisi değil, **global güvenlik ayarına** dokunması: `X-Frame-Options: DENY` yalnız bu rotada gevşer. |
| 40 | Herkese açık okuma API'si `/api/v1/public/tree` | `findValidShare()` + `view()` hazır. 18 ve 31 olmadan yapılmaz. |
| 41 | **Osmanlı ↔ modern yer adı sözlüğü** | `lib/places.ts` `resolvePlace` **ortak çözüm yolunu** değiştiriyor → mevcut pinleri kaydırabilir. 3'e (lisans) bağlı. |
| 42 | Yerleşim arama: modern + tarihî idari bölünme | 41'in veri tabanını tüketir; iki çekirdek saf lib'e birden dokunur. |

## KADEME D — mevcut tip/bileşene alan ekleme (43–49)

| # | İş | Not |
|---|---|---|
| 43 | **`Person` alan kayıt defteri (field registry)** | **D'nin ilk işi olmalı.** Bugün bir alan eklemek 5 yeri birden güncelliyor (`types/family.ts` + `PersonForm` 1637 satır + iki API rotası + `PersonDrawer` 951 satır + `i18n-dict` 2731 satır). Bildirimsel tek tabloya çekmek **sonraki tüm D işlerini C'ye indirir.** |
| 44 | Nötr **"sülale"** alanı | Kanonik D işi. Asla hazır taksonomi, asla soyaddan/coğrafyadan çıkarım. |
| 45 | Dışa dönük soru/istem motoru | **1 ve 11'e bağlı.** Girişsiz yanıt kayda **doğrudan yazmaz** — jeton başına sınırlı **onay kuyruğuna** düşer. Bu karar verilmezse iş D değil E'dir. |
| 46 | Hikâye talebi (belirli akrabadan) | 45'in ikinci yüzü; ayrı yazılırsa iki kod yolu doğar. Hemen ardından. |
| 47 | Genogram duygusal ilişki katmanı | İki uçlu **kenar listesi** = yeni birinci sınıf veri türü, alan eklemekten geniş. 5–6 tür, varsayılan kapalı, maskelenebilir. |
| 48 | ⚠️ Yüz tanıma ile foto etiketleme | Kademe D, **hukuki risk E**. Yapılmaması öneriliyor (§5). |
| 49 | ⚠️ Şifreli belge kasası | Anahtar kaybı = kalıcı veri kaybı. Yapılmaması öneriliyor (§5). |

## KADEME E — çekirdek (50–60)

| # | İş | Not |
|---|---|---|
| 50 | Katkı verici rolü (contributor ≠ editor) | `ORDER = ["viewer","editor","admin"]` dizisine üçüncü kademe sokmak = **her yetki kapısını** yeniden değerlendirmek. `tests/roles.test.mts` ağı var → E'nin en güvenlisi. **4'e bağlı.** |
| 51 | `lib/history.ts` fark tabanlı yeniden yazım | Her kaydetmede **tüm kişi listesini** kopyalayıp yazıyor (15 anlık görüntü). 500 kişilik ağaçta her düzenleme megabaytlarca I/O. `lib/people-diff.ts` zaten var. 58'in ön koşulu. |
| 52 | E-posta ile şifre sıfırlama | İkinci kurtarma yolu = ikinci ele geçirme yolu. **1'e bağlı.** 60'ın ön koşulu. |
| 53 | Otomatik zamanlanmış yedek | `scripts/backup.mjs` elle çalışıyor. 60'a girmeden **çalışan otomatik yedek** olmalı. |
| 54 | Storyworth için ayrı giriş kapısı | "Ağaçsız hesap", `accountId === treeId` **değişmezini** kırıyor. Ucuz görünüp en derine dokunan iş. |
| 55 | **e-Devlet PDF'ini birincil onboarding yapmak** | Ayrıştırıcı zaten var ve zaten içe aktarımda çalışıyor → bu **yeni yetenek değil, canlı ürünün ilk-çalıştırma akışının yeniden yazımı.** En yüksek "bozarsan herkes görür" katsayısı. |
| 56 | Supabase Faz 3d — hesapsız (misafir) giriş | Kimliksiz hesap türü, `isFounder`/`treeId` çözümünün her dalını etkiler. |
| 57 | Supabase Faz 3e — gerçek e-posta ile kalıcılaştırma | Çalışan hesapların kimlik anahtarını yerinde değiştirmek; geri alması zor. |
| 58 | Çevrimdışı yakalama + senkron | **Yalnız mobilde.** Mevcut iyimser kilitle (`x-base-version`) doğrudan çakışıyor; web'de maliyeti faydasını aşıyor. 51'e bağlı. |
| 59 | Blob ↔ Supabase kayma denetimi | Çift yazma var, okuma hâlâ Blob'tan. İki kaynağın ayrışmadığını gösteren araç yok. **60'ın gerçek ön koşulu bu**, "hesaplar taşındı mı" değil. |
| 60 | Supabase Faz 4 — bcrypt + `users.json` emekliye | **Tek geri dönüşü olmayan iş.** Yanlış giderse kullanıcı kilitlenir. Kesinlikle en son. |

---

## §4 — Ajanın itirazları ve ne yaptığım

Bağımsız ajan `docs/PUANLAMA-VE-SIRA.md` ile 11 yerde ayrıştı. **Hepsi kodda doğrulandı.**

**Kabul edilen düzeltmeler:**

1. **GEDCOM `OBJE` medya eşlemesi ZATEN YAPILMIŞ** — `lib/gedcom.ts:159-166` + `tests/gedcom-media.test.mts`. Listeden çıkarıldı; belge yanlıştı (iş 2 bunu düzeltiyor).
2. **Mobil "yalnız login/register" YANLIŞ** — Aşama 0–8 bitmiş, kalan yalnız Aşama 9. Kapsam düzeltildi (34).
3. **"Bağlantısız kişi" büyük ölçüde var** — `PersonForm`'da "Aile bağları" bölümü mevcut kişide ebeveyn/eş değiştirmeye izin veriyor. Kalan gerçek eksik yalnız **tuval üstü** etkileşim (38). Dalga 1'in 2. sırasından çıkarıldı.
4. **e-Devlet onboarding: benim 2. sıram → 55.** En büyük ayrılık ve ajan haklı: ayrıştırıcı zaten çalışıyor, bu iş yeni yetenek değil **canlı ilk-temas akışının yeniden yazımı**.
5. **Katkı verici rolü, API'den ÖNCE değil SONRA.** Ben "API'nin yetki modeli buna dayanacak" demiştim — yanlış: **okuma** API'si role değil bearer jetonuna dayanıyor, yazma API'sini zaten kapsam dışı bıraktık.
6. **Genogram ile kalıtsal hastalık ayrıldı.** Ben eşlemiştim; kalıtsal hastalık zaten var olan alanlardan türeyen salt-okunur görünüm (B/15), genogram yeni kenar listesi (D/47). Aralarında 32 sıra var — eşlemek ucuzu pahalının arkasına kilitlerdi.
7. **Hicri takvim ayrı iş oldu** (10). Anma takviminin içinde saymak, tek matematiksel doğruluk yükünü kendi testinden mahrum bırakıyordu.
8. **Native mobil yukarı çıktı** (34). `apps/` kök tsconfig/eslint dışında olduğu için web'i bozamaz: emek yüksek, risk sıfıra yakın. Risk sıralamasının en net sonucu.
9. **Puan tablosunun kapsamı, sıralamanın kapsamı olamaz.** Supabase fazları, şifre sıfırlama, elle testler ve mobil 21 satırlık tabloda hiç yoktu; oysa ilk 5 ve son 11 sıranın çoğu bunlar.

**Ajanın bulduğu, listede hiç olmayan 11 teknik borç işi** sıralamaya katıldı: alan kayıt defteri (43), `view()` kaçağı testi (18), kayma denetimi (59), `history.ts` yeniden yazımı (51), soru bankası (11), paylaşımlı oran sınırı (31), rota izin listesi (19), referans süpürücüsü (16), mobil CI (33), otomatik yedek (53), belge düzeltmesi (2).

## §5 — "Yapılmasın" denenler (karar senin)

Hepsi sıralamada duruyor, ama gerekçeleri kayda geçti:

| # | İş | Gerekçe |
|---|---|---|
| 48 | Yüz tanıma | Yüz verisi KVKK'da **özel nitelikli kişisel veri**. Ölmüş insanların yüzlerini üçüncü taraf API'ye göndermek, "gizlilik bir maskedir" duruşunun tam zıddı. Yapılacaksa yalnız istemci taraflı — ki fayda büyük ölçüde silinir. |
| 49 | Şifreli belge kasası | Anahtar kaybı = **kalıcı, geri alınamaz** veri kaybı; ürünün varlık sebebiyle zıt. Anahtarı sunucu tutarsa güvenlik tiyatrosu. Yerine: imzalı, süreli erişim. |
| 6 | Aile meclisi / fon | Para hareketi = finansal düzenleme + ihtilaf çözümü. Aile parasını tutmak, kaybedilecek tek şeyi (güven) riske atar. |
| 7 | Telefonla hikâye kaydı | BTK/operatör yükü; sabit hat kullanımı hedef kitlede bile düşüyor. WhatsApp sesli mesaj + Sesli Şecere (35) aynı ihtiyacı sıfır regülasyonla karşılıyor. |
| 8 | Kuşak adı/rütbesi | Türk-İslam onomastiğinde birebir karşılığı **yok**; zorlama taksonomi olur ve 44'ün ilkesiyle çelişir. |
| 37 | Toplu foto restorasyon | Ne masa payı ne farklılaştırıcı; sürekli kota maliyeti. |
| 36 | Üretken renklendirme | Atanın gözünü/tenini modelin uydurduğu görüntü, `Source` (kaynak/atıf) disipliniyle çelişir. Yapılırsa **ayrı türev** olarak, orijinal değişmeden. |
| 9 | Tek seferlik kalıcı arşiv | "Sonsuza dek", finanse edilmemiş ve hukuken bağlayıcı bir taahhüt — kategorinin en sık ihanet edilen vaadi. Yerine: "X yıl + her an tam dışa aktarım". |

---

## Şimdi başlanacaklar

**Bugün, paralel:** 1 (e-posta kararı) · 3 (lisans görüşmesi) · 2 (belge düzeltmesi).
**İlk kod:** 10 — `lib/hijri.ts`. Hiçbir şey beklemiyor, kendi testiyle gelir, 17'yi açar.
