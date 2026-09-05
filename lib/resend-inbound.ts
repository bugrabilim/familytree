import { htmlToText, MAX_TEXT, type BodyFetchState } from "./inbox.ts";

/**
 * GELEN POSTANIN GÖVDESİNİ ÇEKME.
 *
 * Sağlayıcının webhook bildirimi gövdeyi TAŞIMIYOR — bu bir eksiklik değil,
 * bilinçli bir tasarım: sunucusuz ortamların istek gövdesi sınırları var ve
 * büyük postalar/ekler o sınırı aşardı. Gövde ayrı bir çağrıyla alınıyor:
 *
 *   GET https://api.resend.com/emails/receiving/<email_id>
 *
 * ## Neden ayrı bir dosya
 *
 * Çağrının BAŞARISIZ olabileceği gerçeği burada saklanmasın diye. En olası
 * sebep de sıradan bir arıza değil: gönderim için üretilmiş bir API
 * anahtarının okuma yetkisi yok. Bu durum sessiz bir "gövde boş"a değil,
 * ekranda ne yapılacağını söyleyen bir mesaja dönüşmeli.
 *
 * ## HTML saklanmıyor
 *
 * Yanıt hem `text` hem `html` taşıyabiliyor. `text` varsa o kullanılıyor;
 * yoksa `html`den düz metin ÇIKARILIYOR ve yalnız o metin saklanıyor. HTML
 * hiçbir yere yazılmıyor.
 *
 * `fetch` dışarıdan verilebiliyor — böylece ağ olmadan birim testi
 * koşulabiliyor. Bu dosya `@/` çalışma-zamanı içe aktarımı taşımıyor.
 */

const UC = "https://api.resend.com/emails/receiving";

export type FetchBodyResult =
  | { ok: true; text: string }
  | { ok: false; state: Exclude<BodyFetchState, "bekliyor"> };

type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

/**
 * Gövdeyi çeker. Anahtar yoksa AĞA HİÇ ÇIKILMIYOR.
 *
 * Yapılandırma eksikken istek atmak, her gelen postada boşuna bir dış çağrı
 * ve günlükte anlamsız bir hata demek olurdu; üstelik gerçek sebep
 * ("anahtar yok") o gürültünün içinde kaybolurdu.
 */
export async function fetchInboundBody(
  emailId: string,
  opts: { apiKey?: string; fetchImpl?: FetchLike } = {}
): Promise<FetchBodyResult> {
  const key = (opts.apiKey ?? process.env.RESEND_API_KEY)?.trim();
  if (!key) return { ok: false, state: "yapilandirilmamis" };
  if (!emailId.trim()) return { ok: false, state: "bulunamadi" };

  const f = (opts.fetchImpl ?? (fetch as unknown as FetchLike));
  let res: Awaited<ReturnType<FetchLike>>;
  try {
    res = await f(`${UC}/${encodeURIComponent(emailId)}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    });
  } catch {
    return { ok: false, state: "hata" };
  }

  /*
   * 401/403 AYRI ele alınıyor çünkü tek çözümü olan tek durum bu: anahtarın
   * izni yetmiyor. "Hata" deyip geçmek, kullanıcıyı ağ sorunu sanıp
   * beklemeye iterdi — oysa beklemekle geçmez.
   */
  if (res.status === 401 || res.status === 403) return { ok: false, state: "yetki" };
  if (res.status === 404) return { ok: false, state: "bulunamadi" };
  if (!res.ok) return { ok: false, state: "hata" };

  let govde: unknown;
  try {
    govde = await res.json();
  } catch {
    return { ok: false, state: "hata" };
  }

  const kok = (govde ?? {}) as Record<string, unknown>;
  const d = (typeof kok.data === "object" && kok.data ? kok.data : kok) as Record<string, unknown>;
  const duz = typeof d.text === "string" ? d.text : "";
  const html = typeof d.html === "string" ? d.html : "";
  const metin = (duz || htmlToText(html)).slice(0, MAX_TEXT);

  /*
   * Gerçekten boş bir posta ile "alamadık"ı ayırt etmek için: yanıt geldi ve
   * içi boşsa bu bir BAŞARI. Kişi boş posta atmış olabilir ve ekranda öyle
   * görünmeli — yeniden denenecek bir şey yok.
   */
  return { ok: true, text: metin };
}
