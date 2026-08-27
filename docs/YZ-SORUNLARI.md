# Yapay zekâ — bilinen sorunlar ve yapılacaklar (backlog)

> Kullanıcı notu (2026-08): "Yapay zekâda çok problem var, bunu başka bir zaman
> ele alacağız, benim için notları tut, sonra sorunca söylersin."
> Bu dosya o notların kaydıdır. **Bu maddeler henüz YAPILMADI.**

## A. Bildirilen sorunlar

| # | Sorun | Not / ilk teşhis |
|---|-------|------------------|
| A1 | **Talimatları çalıştırmıyor** | Sohbet penceresinden verilen komutlar (ekle/değiştir/sil) uygulanmıyor. Komut ayrıştırma `lib/ai-commands.ts` içinde *desen tabanlı*; desene uymayan doğal cümleler düşüyor. |
| A2 | **"Şu kişinin annesidir, yeni profil oluştur" çalışmıyor** | `lib/ai-act.ts` yalnız *tekil kişi* ekleyebiliyor; **ilişkiyle birlikte** ekleme (X'in annesi / babası / eşi / çocuğu olarak) desteklenmiyor. En çok istenen akış bu. |
| A3 | **Dosyaları anlamıyor** | Çok-kipli içe aktarımda (görsel/PDF/Excel/Word) çıkarım zayıf; belge türünü tanıyıp ona göre şema uygulamıyor. |
| A4 | **Soruları anlamıyor / akıl yürütmüyor** | Soru-cevap ağaç verisini yeterince bağlam olarak almıyor; çok adımlı çıkarım (ör. "en uzun yaşayan kadının torunu kim?") yapılamıyor. |
| A5 | **Bilinçli düşünmüyor** | Yanıtlar yüzeysel; doğrulama/kendini denetleme adımı yok. |
| A6 | **Sohbet kaydını tutmuyor** | Pencere kapanınca geçmiş kayboluyor; oturumlar arası süreklilik yok. |
| A7 | **Geç cevap veriyor** | Vercel işlev süresi + tek seferlik büyük istem. Akış (streaming) yok, kullanıcı boş ekrana bakıyor. |
| A8 | **Yönetici görünürlüğü yok** | Hesap sahibi, ağacındaki bir kullanıcının YZ ile ne konuştuğunu göremiyor. |

## B. Çözüm yönü (tasarım taslağı)

- **A1/A2 — Araç çağırma (tool calling) mimarisine geç.** Desen eşlemeyi bırak;
  modele `kisiEkle(ad, soyad, cinsiyet, iliski, hedefKisi)`, `kisiGuncelle`,
  `iliskiKur` gibi *şemalı araçlar* ver. İlişkili ekleme (A2) birinci sınıf araç
  olsun: `iliski: "anne" | "baba" | "es" | "cocuk" | "kardes"` + `hedefKisi`.
  Hedef kişiyi bulmak için mevcut bulanık ad eşleme (pembe→Penpe) korunur.
- **A4/A5 — Bağlam ve doğrulama.** Soru gelince ağaçtan *ilgili alt kümeyi*
  (kişi + akrabalık kenarları) seç ve yapılandırılmış olarak ver; yanıt sonrası
  "iddia edilen kişiler gerçekten ağaçta var mı?" doğrulaması yap.
- **A6 — Sohbet kalıcılığı.** Blob'da `ai-chat-<treeId>-<userId>.json`; son N
  mesaj. Aynı depo A8'i de besler.
- **A7 — Akış (streaming) + iş bölme.** Yanıtı parça parça göster; büyük
  çıkarımı iki aşamaya böl (zaten import'ta yapıldı).
- **A8 — Yönetici görünümü.** Ayarlar → "YZ sohbet kayıtları": ağaç yöneticisi
  üyelerin oturumlarını okuyabilsin. **KVKK notu:** üyeye açıkça bildirilmeli
  ("bu ağaçta YZ sohbetleri yönetici tarafından görülebilir") ve kapatılabilir
  olmalı.

## C. YZ + e-posta birlikte (fikirler)

Ayrıntılı e-posta listesi için: `docs/EPOSTA-PLANI.md`. YZ'ye özel olanlar:

- **Haftalık "aile bülteni".** YZ, o hafta eklenen kişileri/anıları özetleyip
  aileye e-posta ile gönderir.
- **Eksik bilgi avcısı.** YZ ağacı tarar, en değerli 3 eksiği bulur ("Hüseyin'in
  ölüm yeri yok") ve haftada bir hatırlatma e-postası atar.
- **Anı toplama daveti.** Yaşayan üyelere "dedeniz hakkında bir anınızı yazar
  mısınız?" e-postası; gelen yanıt doğrudan `memories` alanına düşer
  (yanıtla-ekle akışı).
- **Doğum günü metni.** Hatırlatma e-postasına YZ'nin yazdığı kısa, kişiye özel
  bir cümle eklenir ("Bugün 82 yaşına giren Nuriye, 1962'de İstanbul'a taşınmıştı").
- **Belge geldi → özet.** Kullanıcı e-postayla belge gönderir, YZ çıkarım yapıp
  "şu 4 kişiyi buldum, onaylıyor musunuz?" yanıtını döner.
