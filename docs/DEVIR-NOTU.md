# Devir notu — 2026-09-10

Bu dosya, oturum değiştiğinde **bağlamı yeniden kurmak** için. Sohbet geçmişi
taşınmıyor; taşınması gereken tek şey burada.

Güncel tutulması gereken bir belge: bir faz bittiğinde "Nerede kaldık"
bölümü yenilenir, biten işler `docs/SUPABASE-GECIS.md` gibi kalıcı
belgelere geçer.

---

## Nerede kaldık

**Faz 4 / 2c tamamlandı ve canlıda** (`main` tepesi #362).

Kimlik deposu (`accounts`) artık **Postgres**; `users.json` geri düşüş
kopyası. Okuma ve yazma ayrı ayrı geri alınabiliyor:

| Anahtar | Ne yapar |
|---|---|
| `IDENTITY_READ_BLOB=1` | Kimlik **okumalarını** Blob'a geri alır |
| `IDENTITY_WRITE_BLOB=1` | Kimlik **yazmalarını** Blob'a geri alır |

İkisi ayrı, çünkü yalnız yazmada bir sorun görüldüğünde okumanın da geri
alınması gerekmesin. Supabase hiç yapılandırılmamışsa (yerel geliştirme)
bayraklar aranmadan Blob asıl kaynak kalır.

Ayrıntılı gerekçe ve faz geçmişi: `docs/SUPABASE-GECIS.md`.

### Üretimdeki veri (2026-09-10)

`accounts` **1 satır** (`bilim`), `trees` 2, `people` 404, `auth.users` 1.
Göç ekranındaki "38 doğrulandı" sayısı kişi/kayıt sayısıydı, hesap değil —
bu karışıklık bir kez yaşandı, tekrar etmesin.

---

## Sırada ne var

1. **Faz 4 / 2c-3 — aynanın ve geri düşüşün kaldırılması.**
   Deponun **geri dönüşü olmayan tek adımı**. `GET /api/admin/phase4`
   `hazir: true` demeden ve 2c-2 birkaç gün canlıda durmadan yapılmaz.
   (2c-2 canlıya çıkış: 2026-09-09.)

2. **Kurucu hesabının `recovery_code_index` alanı boş.**
   `recovery_code_hash` var ama indeks yok — hesap kurtarma kodundan
   **bulunamıyor**, yani elindeki kod şifre sıfırlamada çalışmaz. Sebep
   pre-indeks dönemde açılmış olması (`tests/recovery-gate.test.mts` bu
   eskiliği bilerek tolere ediyor). Düzeltmek **yeni bir kod üretmek**
   demek ve eldeki kodu geçersiz kılar — bu yüzden hesap sahibinin kararı,
   kendiliğinden yapılmaz.

3. **Lansman öncesi** (`docs/LANSMAN-CHECKLIST.md` yanında):
   - `CRON_SECRET` döndürülecek.
   - `AUTH_BCRYPT_FALLBACK` üretimde **tanımlı olmamalı** (tanımlıysa
     kurucu girişi Supabase Auth'u atlayabiliyor).

4. **Madde 57 — mobil mağaza derlemesi.** Hesap sahibinde; kod tarafında
   yapılacak bir şey yok (`docs/MOBIL-NATIVE-PLAN.md`).

**İptal edilenler:** 60 ve 64 (hesap sahibi iptal etti, yeniden açılmasın).

**Bilerek yapılmayanlar** (ilgili PR'larda yazılı): GEDCOM `associations`
(ASSO/RELA) ve `confidential` → `RESN`; `soy` görünümünün açılış ölçeği;
histogram çubuk genişlikleri.

---

## Ortam tuzakları

- **Vercel MCP 403 veriyor** — ağ sorunu **değil**, yetki:
  `Not authorized: Trying to access resource under scope
  "bugrabilims-projects". You must re-authenticate to this scope.`
  Yeni oturum açmak bunu çözmez; Vercel bağlayıcısının o kapsam için
  yeniden yetkilendirilmesi gerekir. Deploy durumu bu arada PR'daki Vercel
  yorumundan okunuyor.
- **Supabase MCP çalışıyor** — SQL ve `apply_migration` dahil. Üretim şeması
  buradan doğrulanabilir.
- **Genel ağ erişimi açık** (curl, WebFetch, WebSearch). Geçmişte görülen
  403'ler geçiciydi ya da yukarıdaki yetki sorunuydu.
- **Vercel ücretsiz plan: günde 100 dağıtım.** Her birleşme iki tane
  üretiyor (önizleme + üretim), yani günde ~50 birleşme sınırı var.

---

## Çalışma anlaşmaları

Hesap sahibinin duran talimatları:

- **Toplu onay var.** İş bitince canlıya basılır, her adımda onay sorulmaz.
- **Küçük parçalar hâlinde** ilerlenir; her parça kendi PR'ı olur ve
  bitince birleşir.
- **Her birleşmeden sonra dal `origin/main`e eşitlenir.**
- **Kısa yanıt.** Detay değil sonuç istiyor.
- **Kendini tekrar etme.** Daha önce anlatılan şey yeniden anlatılmaz.
- **Hesap sahibini el olarak kullanma.** "Şuna tıkla, çıktıyı yapıştır"
  yerine durum doğrudan Supabase'den / depodan doğrulanır.

## Bu depoda tekrar eden hata deseni

Beş ayrı hatanın kök nedeni aynıydı: **kuralın kopyalanması** (yönetim
kapıları, sürüm başlığı, kurucu kapısı, rapor kartı gizliliği, dışa giden
veri filtresi). Her seferinde çözüm de aynı oldu: kuralı **tek karar
noktasına** indirip onu **dizin tarayan bir kapı testiyle** kilitlemek.
Yeni bir kural yazarken önce "bu ikinci kez yazılıyor mu" diye bakılır.

**Test disiplini:** her koruma, geçici olarak **kırılıp** kaç iddianın
düştüğü sayılarak kanıtlanır (mutasyon). Geri alma `git checkout` ile değil,
scratchpad'deki `cp` yedeğiyle yapılır — aynı dalda başka değişiklikler
duruyor olabilir.

**Testler `tsconfig` dışında** (`exclude: ["node_modules","tests","apps"]`),
yani eksik bir zorunlu alan çalışma anında sessizce `undefined` olur;
tipe güvenilmez, iddia yazılır.
