# Altyapı Kararı — Supabase'de kalıyor

**Karar tarihi:** 10 Eylül 2026
**Durum:** Karar verildi. **Bu proje taşınmıyor.** Yapılacak bir işlem yok.

## Karar

Sahibin diğer projeleri (`hr`, `apex`, `bugra`, `muttefik`) Neon Postgres'e
taşınıyor. **Bu proje istisna: Supabase'de kalıyor.**

Supabase'in ücretsiz planı iki aktif proje veriyor; bu proje o iki slottan
birini kullanıyor, diğeri `sporcuk` için ayrıldı.

## Mevcut yapı

Bu projenin Supabase kullanımı sığ — Supabase burada **yalnızca veritabanı**:

| Katman | Nerede |
|---|---|
| Veritabanı | Supabase Postgres, `lib/supabase.ts` üzerinden servis-rolü anahtarıyla |
| Kimlik doğrulama | **NextAuth** — Supabase Auth kullanılmıyor |
| Görseller | **Cloudinary** — Supabase Storage kullanılmıyor |
| Gerçek zamanlı | Kullanılmıyor |
| Edge Functions | Kullanılmıyor |

`lib/supabase.ts` içindeki yorumun da belirttiği gibi, istemci servis-rolü
anahtarıyla oluşturuluyor ve RLS'yi atlıyor; yetki denetimi NextAuth oturumu
ve `resolveActiveTree` üzerinden uygulama tarafında yapılıyor.

## Taşınmak istenirse ne gerekir

Bağlılık sığ olduğu için taşıma teknik olarak zor değil: `sb.from(...)`
biçimindeki yaklaşık 10 sorgu düz SQL'e veya Drizzle'a çevrilir, `DATABASE_URL`
Neon'a yönlendirilir. Auth ve görseller zaten Supabase dışında olduğu için
onlara dokunulmaz.

**Şu an planlanmıyor** — ücretsiz plandaki ikinci slot zaten bu proje için
ayrıldığından taşımanın somut bir kazancı yok.

## Bilinmesi gerekenler

- **Ücretsiz planda proje bir hafta düşük aktivite sonrası duraklatılır** ve
  panelden elle geri yüklenmesi gerekir.
- **Ücretsiz planda yedek yok.** Aile ağacı verisi geri getirilmesi zor bir
  içerik; düzenli dışa aktarma alışkanlığı edinilmeli.
- **Veritabanı 500 MB** ücretsiz planda. Görseller Cloudinary'de olduğu için
  bu sınır uzun süre sorun olmaz.
