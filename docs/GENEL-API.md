# Herkese açık okuma API'si (v1)

`GET /api/v1/public/tree?token=<paylaşım-jetonu>`

Aynı paylaşım jetonu `/g/<jeton>` sayfasını da açar; fark yalnız biçimde:
HTML yerine JSON. Oturum gerekmez.

## Neden ayrı bir yanıt biçimi

Bir genel API **sözleşmedir**. İç `Person` türü ise ürünle birlikte büyüyor
— son turlarda `lineage`, `publicVisibility`, duygusal bağ katmanı eklendi
ve eklenmeye devam edecek. Maskelenmiş `Person`i olduğu gibi döndürseydik,
ileride eklenen **her** alan kimse karar vermeden genel çıktıya girerdi.
Gizlilik maskesinden geçmiş olması yetmez: maskeden geçen bir alan
"yayımlanmasına karar verilmiş" demek değildir.

Bu yüzden `lib/public-api.ts` açık bir beyaz liste yansıtması yapıyor. Yeni
bir `Person` alanı varsayılan olarak **dışarıda** kalır ve
`tests/public-api.test.mts` bunu kilitler.

## Yanıt

```json
{
  "version": "1",
  "name": "Demir",
  "hideLiving": true,
  "count": 42,
  "people": [
    {
      "id": "abc123",
      "code": "289001",
      "firstName": "Ali",
      "lastName": "Demir",
      "gender": "male",
      "nickname": "Topal",
      "patronymic": "Şaban oğlu",
      "birthDate": "1950-01-01",
      "deathDate": "2010",
      "birthPlace": "Rize",
      "occupation": "marangoz",
      "parentIds": ["p1", "p2"],
      "spouseIds": ["s1"],
      "formerSpouseIds": ["e1"]
    }
  ]
}
```

Boş alanlar **hiç yazılmaz** (`null` değil, alan yok).

`hideLiving` bilerek yanıtta: tüketici eksik veriyi yorumlayabilsin.
Olmasaydı bir istemci "bu kişinin doğum tarihi bilinmiyor" ile "gizlendi"
arasındaki farkı göremez ve yanlış sonuç çıkarırdı.

## Dışarı ÇIKMAYAN alanlar

Biyografi, anılar, fotoğraflar, videolar, belgeler, kaynaklar, yaşam
olayları, sağlık/doğuştan durum/ölüm nedeni, din/mezhep/etnik köken/yönelim,
defin yeri, koordinatlar, sülale, çevre bağları, gizlilik ayarları ve
**duygusal bağ katmanı** (genogram). Sonuncusu ayrı bir koleksiyonda ve
hiçbir dışa açık yüzeye bağlanmıyor.

## Hata durumları

| Durum | Anlamı |
|---|---|
| `400` | `token` verilmedi |
| `404` | Jeton geçersiz, kapatılmış ya da süresi dolmuş |
| `429` | Oran sınırı — `Retry-After` başlığına bakın |

## Oran sınırı

IP başına 30 istek kapasitesi, saniyede 0,5 jeton geri dolum. Uç oturumsuz
olduğu için hesap başına sınır konamıyor. Sınır paylaşımlıdır (K4/33):
örnek-içi bir sınır, kimliksiz bir uçta neredeyse hiçbir şey demek olurdu.

## CORS

`Access-Control-Allow-Origin: *`, `GET` ve `OPTIONS`. Kimlik bilgisi
(çerez) **kabul edilmez** — verilseydi bir sitenin ziyaretçisinin oturumu
üzerinden çağrılabilirdi; oysa bu uç yalnız jetonla çalışır.

## Tek kişilik jeton

Mezar QR'ı için daraltılmış bir jeton yalnız **o kişiyi** döndürür, ağacın
tamamını değil. Taş herkesin görebileceği bir yerdedir; onu tarayan birine
tüm soy ağacını API olarak açmak paylaşımın ölçüsünü kaçırırdı.

## Sürümleme

Yol baştan `/api/v1/...`. Biçim değişmesi gerekirse `/v2` açılır; mevcut
tüketiciler kırılmaz. Alan **eklemek** geriye uyumludur, çıkarmak değildir.
