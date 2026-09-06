/**
 * GELEN POSTAYI İŞLETMECİNİN KENDİ ADRESİNE İLETME — saf plan katmanı.
 *
 * ## Neden var
 *
 * `bilgi@soylus.com`a gelen posta uygulamanın içinde, `/admin/posta`
 * sayfasında okunabiliyor. Ama bir gelen kutusunun DEĞERİ, gelenden HABERDAR
 * olmakta: kimsenin günde bir kez ziyaret etmediği bir sayfa, hiç
 * okunmayacak postaların arşividir. Kullanıcı bunu doğrudan söyledi — "ben
 * neden kendi yaptığımız sayfadan okumaya çalışıyorum ki".
 *
 * Bu yüzden gelen her posta, işletmecinin GERÇEKTEN kullandığı adrese
 * (`INBOX_FORWARD_TO`) iletiliyor. Uygulama içindeki sayfa arşiv olarak
 * kalıyor; okumak için oraya girmek ZORUNLU DEĞİL.
 *
 * ## `From` bizim, `Reply-To` gönderenin
 *
 * İletilen posta, gönderenin adresinden çıkıyormuş gibi gönderilemez:
 * yalnız kendi doğrulanmış alan adımızdan gönderme yetkimiz var, başkasının
 * adresini `From`a yazmak SPF/DKIM'de düşer ve posta ya istenmeyene gider ya
 * hiç gitmez. Bunun yerine:
 *
 *   - `From`un GÖRÜNEN ADI özgün gönderenin adı olur ("Ali Veli (soylus)"),
 *     böylece kutu listesinde kimden geldiği tek bakışta görünür;
 *   - `Reply-To` özgün gönderenin adresi olur, böylece "Yanıtla" demek
 *     doğrudan o kişiye yazmak demektir.
 *
 * İkincisi olmadan her yanıt kendi adresimize dönerdi ve kullanıcı
 * yanıtladığını sanırken kimseye ulaşmazdı.
 *
 * ## DÖNGÜ
 *
 * En pahalı hata burada olurdu. İletme hedefi (diyelim Yahoo) bir tatil
 * yanıtlayıcısı çalıştırıyorsa: posta bize gelir → hedefe iletilir →
 * otomatik yanıt `bilgi@`ye döner → webhook onu YENİ bir gelen posta sayar →
 * yine hedefe iletilir → yine otomatik yanıt… Sonsuz döngü, gönderim kotası
 * dolana kadar. `planForward`, göndereni iletme hedefleri arasındaysa ya da
 * kendi gönderen adresimizse iletmiyor. Bu tek denetim döngüyü ilk turda
 * kesiyor.
 *
 * Saf ve bağımlılıksız — birim testi koşulabilsin.
 */

import { MAX_SUBJECT, MAX_TEXT, headerSafe, normalizeAddress } from "./inbox.ts";
import type { ForwardState, Mail } from "./inbox.ts";

/**
 * En fazla kaç adrese iletilir.
 *
 * İletme, doğrulanmış alan adımızdan gönderim demek. Değişkene uzun bir
 * liste yazmak (kazayla ya da bir gün başkası tarafından) tek gelen postayı
 * onlarca gönderime çevirirdi; kota da itibar da bizim.
 */
export const MAX_HEDEF = 5;

/**
 * `INBOX_FORWARD_TO` değerini adres listesine çevirir.
 *
 * Virgül, noktalı virgül ve boşluk ayırıcı sayılıyor — insan eliyle yazılan
 * bir ortam değişkeninde üçü de olur. Geçersiz parça SESSİZCE DÜŞMÜYOR,
 * düşüyor ama çağıran kaç hedef bulduğunu görebiliyor: hiç geçerli adres
 * yoksa özellik "kapali" sayılır ve bu ekranda söylenir.
 */
export function forwardTargets(raw: string | undefined): string[] {
  if (!raw) return [];
  const parcalar = raw.split(/[,;\s]+/);
  const gorulen = new Set<string>();
  for (const p of parcalar) {
    const adres = normalizeAddress(p);
    if (!adres || gorulen.has(adres)) continue;
    gorulen.add(adres);
    if (gorulen.size >= MAX_HEDEF) break;
  }
  return [...gorulen];
}

/** İletilecek postanın hazırlanmış hâli. */
export interface ForwardPlan {
  to: string[];
  subject: string;
  /** YALNIZ düz metin: gelen gövde yabancının yazdığı içerik. */
  text: string;
  /** Özgün gönderen — "Yanıtla" buraya gitsin diye. */
  replyTo?: string;
  /** `From`un görünen adı; adresin kendisi değişmiyor. */
  fromName: string;
}

export type ForwardDecision =
  | { ilet: false; state: ForwardState }
  | { ilet: true; plan: ForwardPlan };

/** Görünen adı `From` başlığına yazılabilir hâle getirir. */
function adSade(raw: string): string {
  return headerSafe(raw)
    // `<`, `>`, `"` ve virgül `From` sözdiziminde ayırıcı: adın içinde işleri yok.
    .replace(/[<>"',;:@\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

/**
 * Gövdenin üstüne konan bilgi bloğu + gövdenin kendisi.
 *
 * Blok GEREKLİ: posta bizim adresimizden çıktığı için, açan kişi başlıkta
 * yalnız kendi sitesini görür. Gönderen, tarih ve hangi adrese geldiği
 * yazılmazsa "bu kimden geldi?" sorusu her postada tekrar sorulur.
 */
export function forwardText(mail: Mail, siteAdresi?: string): string {
  const kimden = mail.fromName ? `${mail.fromName} <${mail.from}>` : mail.from || "(bilinmiyor)";
  const basliklar = [
    `Gönderen: ${kimden}`,
    `Alıcı: ${mail.to}`,
    `Tarih: ${mail.at.replace("T", " ").slice(0, 16)}`,
    `Konu: ${mail.subject || "(konusuz)"}`,
  ];
  if (mail.attachments?.length)
    basliklar.push(`Ek: ${mail.attachments.map((a) => a.name).join(", ")} (indirilmedi)`);

  /*
   * GÖVDE YOKSA SEBEBİ YAZILIYOR. Boş bir posta iletmek, kullanıcıya
   * "adam boş posta atmış" dedirtirdi; oysa çoğu zaman sebep bizim
   * tarafımızda (API anahtarının izni yetmiyor) ve düzeltilebilir.
   */
  const govde = mail.bodyFetch
    ? {
        bekliyor: "(Gövde henüz alınamadı; birazdan tamamlanacak.)",
        yetki: "(Gövde alınamadı: RESEND_API_KEY yalnız gönderim yetkisi taşıyor, okuma yetkisi gerekiyor.)",
        bulunamadi: "(Gövde sağlayıcıda bulunamadı — saklama süresi dolmuş olabilir.)",
        hata: "(Gövde alınamadı: sağlayıcıya ulaşılamadı.)",
        yapilandirilmamis: "(Gövde alınamadı: RESEND_API_KEY tanımlı değil.)",
      }[mail.bodyFetch]
    : mail.text || "(Boş posta.)";

  const alt = [
    "—",
    "Bu posta Soy Ağacı'nın gelen kutusuna geldi ve size iletildi.",
    mail.from
      ? "Doğrudan yanıtlayabilirsiniz: yanıtınız gönderene gider."
      : "Gönderen adresi okunamadı; yanıt gönderene ulaşmaz.",
    siteAdresi ? `Arşiv: ${siteAdresi}/admin/posta` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return `${basliklar.join("\n")}\n${"─".repeat(40)}\n\n${govde}\n\n${alt}`.slice(0, MAX_TEXT);
}

/**
 * İletilecek mi, iletilecekse nasıl?
 *
 * `kendiAdresler`: bizim kendi gönderen adreslerimiz (`EMAIL_FROM`,
 * `EMAIL_REPLY_TO`). Kendi gönderdiğimiz bir posta geri döndüyse iletmek
 * yankıdan başka bir şey üretmez.
 */
export function planForward(
  mail: Mail,
  hedefler: string[],
  kendiAdresler: string[] = [],
  siteAdresi?: string
): ForwardDecision {
  if (hedefler.length === 0) return { ilet: false, state: "kapali" };

  /*
   * DÖNGÜ DENETİMİ — dosyanın başındaki uzun gerekçe. Hedefin otomatik
   * yanıtlayıcısı bize yazdığında bunu ona geri iletmek sonsuz bir tur
   * başlatırdı. Karşılaştırma normalleştirilmiş adresle: "Ali@X.com" ile
   * "ali@x.com" aynı kişi.
   */
  const gonderen = normalizeAddress(mail.from);
  const yasak = new Set([...hedefler, ...kendiAdresler.map((a) => normalizeAddress(a))].filter(Boolean));
  if (gonderen && yasak.has(gonderen)) return { ilet: false, state: "dongu" };

  const ad = adSade(mail.fromName || gonderen || "Soylus");

  return {
    ilet: true,
    plan: {
      to: hedefler,
      /*
       * Konu DEĞİŞTİRİLMİYOR ("Fwd:" eklenmiyor): kullanıcı postayı sonradan
       * kendi kutusunda ararken yazışmanın gerçek konusunu arayacak ve
       * eklediğimiz her önek o aramayı bozar. Kimden geldiği zaten görünen
       * adda.
       */
      subject: headerSafe(mail.subject || "(konusuz)").slice(0, MAX_SUBJECT),
      text: forwardText(mail, siteAdresi),
      /*
       * Boş gönderende `replyTo` VERİLMİYOR (`undefined`). Boş bir dize
       * `sendEmail`de "belirtilmedi" sayılıp `EMAIL_REPLY_TO`ya düşerdi —
       * yani yanıt kendi kutumuza gelir, kullanıcı da yanıtladığını sanırdı.
       */
      replyTo: gonderen || undefined,
      fromName: ad ? `${ad} (soylus)` : "Soylus",
    },
  };
}
