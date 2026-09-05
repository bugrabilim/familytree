/**
 * MARKALI E-POSTA ŞABLONU — doğrulama, şifre sıfırlama ve günlük hatırlatma
 * postaları tek bir üreteçten geçsin diye (bkz. görev: "çok düz, renklendir").
 *
 * ## Neden e-posta HTML'i normal sayfa HTML'i gibi yazılmıyor
 *
 * Bu dosyanın çıktısı bir tarayıcıda değil, onlarca farklı posta
 * istemcisinde (Gmail web/iOS/Android, Outlook masaüstü, Apple Mail…)
 * render ediliyor ve bunların motorları modern CSS'i desteklemiyor:
 *
 *  · Gmail çoğu zaman `<style>` bloğunun TAMAMINI siler — bu yüzden her
 *    öğenin görünümü kendi `style="…"` özniteliğinde olmak ZORUNDA.
 *  · Outlook masaüstü render için Word'ün HTML motorunu kullanıyor:
 *    flexbox/grid yok, `border-radius` sessizce yok sayılıyor (köşeler
 *    kare kalır, kırılmaz), arka plan CSS'i bazen atlanıp yalnız `bgcolor`
 *    özniteliği okunuyor — o yüzden ikisi birden yazılıyor.
 *  · `prefers-color-scheme` desteği istemciler arası tutarsız: bazıları
 *    metni koyulaştırıp arka planı KOYULAŞTIRMIYOR (okunmaz kontrast).
 *    Bunu bir CSS anahtarıyla çözmek yerine hiç güvenmiyoruz — her yüzeye
 *    AÇIK renk atanıyor ve istemciye "koyu moda otomatik çevirme" diyen
 *    `color-scheme`/`supported-color-schemes` meta etiketleri ekleniyor.
 *  · Dış kaynak (resim/font/CDN) çoğu istemcide varsayılan KAPALI geliyor
 *    ya da ayrı bir isteğe (ve gecikmeye) yol açıyor — bu yüzden logo emoji,
 *    yazı tipleri web-güvenli (Georgia/Arial) yığınla.
 *
 * Düzen bilerek tablo tabanlı (`<table role="presentation">`): Word motoru
 * `<div>` kutularını güvenilir biçimde hizalamıyor ama tabloları hep
 * anlıyor. Genişlik hem öznitelik (`width="600"`) hem `style` olarak
 * veriliyor — yalnız CSS'e güvenen istemcilerde de, yalnız özniteliğe
 * bakanlarda da 600px sabit kalsın diye.
 *
 * ## Neden metin (text) sürümü de üretiliyor
 *
 * HTML gösteremeyen istemciler için gerekli olmasının yanında, e-posta
 * sağlayıcılarının spam puanlaması SADECE-HTML gövdeyi şüpheli buluyor —
 * `multipart/alternative` için düz metin şart (bkz. `lib/email.ts`daki
 * `sendEmail`'in hem `html` hem `text` alması).
 */

/** Tek eylem düğmesi — doğrulama/sıfırlama postalarında bağlantı taşır. */
export interface EmailButton {
  /** Düğme metni (örn. "E-postamı doğrula"). Çağıran dile göre verir. */
  label: string;
  /** Tam bağlantı — hem `href` hem düz metin sürümünde AYNEN geçer. */
  url: string;
}

export interface RenderEmailInput {
  /** Ana başlık (H1). */
  title: string;
  /**
   * Giriş paragrafı. `\n` satırları `<br>`e çevrilir (HTML sürümünde);
   * düz metinde olduğu gibi kalır. Opsiyonel — yalnız madde listesi de
   * yeterli olabilir (bkz. hatırlatma postası).
   */
  intro?: string;
  /** Tek büyük eylem düğmesi. Verilmezse HİÇ düğme render edilmez
   *  (hatırlatma postalarında düğme yok — görev şartı). */
  button?: EmailButton;
  /**
   * Düğmenin altında küçük, soluk bir not — "bağlantı 24 saat geçerlidir"
   * gibi. Düğmesiz postalarda da kullanılabilir, o yüzden button'a bağımlı
   * değil.
   */
  note?: string;
  /** Madde listesi (günlük hatırlatmalar). Boşsa/undefinedse `<ul>` hiç
   *  basılmaz — boş bir liste kullanıcıya boş bir kutu göstermesin. */
  items?: string[];
  /** Alt bilgi — yasal/opt-out notu. Küçük punto, soluk renk. */
  footer?: string;
  /**
   * Gelen kutusu önizlemesinde başlıktan hemen sonra görünen gizli metin
   * ("preheader"). Verilmezse `intro`, o da yoksa `title` kullanılır —
   * boş önizleme yerine hep anlamlı bir tanesi çıksın diye.
   */
  preheader?: string;
  /** Marka adı — üst bantta logonun yanında. Varsayılan "Soy Ağacı". */
  brandName?: string;
  /** Logo yerine geçen emoji (dış görsel yok kuralı). Varsayılan 🌳. */
  logoEmoji?: string;
}

export interface RenderedEmail {
  html: string;
  text: string;
}

/**
 * HTML kaçışı — kullanıcı girdisi (soyisim, hatırlatma metni…) doğrudan
 * bu şablona `title`/`intro`/`items` olarak akabiliyor. Kaçış yoksa
 * `<img onerror=…>` gibi bir alan adı/başlık HTML enjeksiyonuna dönüşür.
 * `&` en başta işlenmeli — yoksa sonradan eklenen `&lt;` gibi varlıkların
 * kendi `&`si ikinci kez kaçırılıp `&amp;lt;` çıkar.
 */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Kaçırılmış metinde `\n` → `<br>` (paragraf içi satır sonları için). */
function escapeWithBreaks(input: string): string {
  return escapeHtml(input).replace(/\n/g, "<br>");
}

// Marka paleti — `app/globals.css`teki `:root` (açık tema) token'larının
// sabit kopyası. E-posta istemcisi tema değiştiremediği için ("her yüzeye
// açık renk" kararı yukarıda) buradan CSS değişkeni İÇE AKTARILAMAZ —
// `@/…` çalışma zamanı değer içe aktarımı zaten testte çalışmıyor (bkz.
// CLAUDE.md) ve değişse de e-posta zaten kendi sabit paletini taşımalı.
const PALETTE = {
  bg: "#f7f6f2", // sayfa zemini (parşömen)
  surface: "#ffffff", // kart zemini
  surfaceSoft: "#f1efe9", // alt bilgi şeridi
  border: "#e2ded3",
  text: "#1b1a16",
  textMuted: "#6d675b",
  primary: "#1f6b47",
  primaryText: "#ffffff",
} as const;

const FONT_SERIF = "Georgia,'Times New Roman',serif";
const FONT_SANS = "Arial,Helvetica,sans-serif";

/** Düğme bloğu — tablo içinde tablo, Outlook'un `<a>`yı buton gibi
 *  boyamamasının standart çözümü ("bulletproof button"). */
function renderButtonHtml(button: EmailButton): string {
  const href = escapeHtml(button.url);
  const label = escapeHtml(button.label);
  return `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
          <tr>
            <td align="center" bgcolor="${PALETTE.primary}" style="background-color:${PALETTE.primary};border-radius:8px;">
              <a href="${href}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 32px;font-family:${FONT_SANS};font-size:15px;line-height:1.2;font-weight:bold;color:${PALETTE.primaryText};text-decoration:none;border-radius:8px;">${label}</a>
            </td>
          </tr>
        </table>`;
}

function renderItemsHtml(items: string[]): string {
  const rows = items
    .map(
      (item) =>
        `<li style="margin:0 0 8px;">${escapeWithBreaks(item)}</li>`,
    )
    .join("");
  return `
        <ul style="margin:0 0 24px;padding:0 0 0 20px;font-family:${FONT_SANS};font-size:15px;line-height:1.6;color:${PALETTE.text};">${rows}</ul>`;
}

/**
 * Markalı e-posta HTML'i + düz metin karşılığını üretir. Saf fonksiyon —
 * ağ/dosya erişimi yok, `lib/email.ts`teki `sendEmail`e `html`/`text`
 * olarak doğrudan verilebilir.
 */
export function renderEmail(input: RenderEmailInput): RenderedEmail {
  const brandName = input.brandName ?? "Soy Ağacı";
  const logoEmoji = input.logoEmoji ?? "🌳";
  const preheaderSource = input.preheader ?? input.intro ?? input.title;

  const introHtml = input.intro
    ? `<p style="margin:0 0 24px;font-family:${FONT_SANS};font-size:15px;line-height:1.6;color:${PALETTE.text};">${escapeWithBreaks(input.intro)}</p>`
    : "";
  const buttonHtml = input.button ? renderButtonHtml(input.button) : "";
  const noteHtml = input.note
    ? `<p style="margin:0 0 24px;font-family:${FONT_SANS};font-size:13px;line-height:1.5;color:${PALETTE.textMuted};">${escapeWithBreaks(input.note)}</p>`
    : "";
  const itemsHtml =
    input.items && input.items.length > 0 ? renderItemsHtml(input.items) : "";
  const footerHtml = input.footer
    ? `<p style="margin:0;font-family:${FONT_SANS};font-size:12px;line-height:1.5;color:${PALETTE.textMuted};">${escapeWithBreaks(input.footer)}</p>`
    : "";

  const html = `<!doctype html>
<html lang="und" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
<title>${escapeHtml(input.title)}</title>
</head>
<body style="margin:0;padding:0;background-color:${PALETTE.bg};">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;opacity:0;">${escapeHtml(preheaderSource)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PALETTE.bg}" style="background-color:${PALETTE.bg};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${PALETTE.surface}" style="width:600px;max-width:600px;background-color:${PALETTE.surface};border:1px solid ${PALETTE.border};border-radius:12px;">
          <tr>
            <td style="padding:24px 32px;border-bottom:1px solid ${PALETTE.border};">
              <span style="font-size:20px;vertical-align:middle;">${logoEmoji}</span>
              <span style="font-family:${FONT_SERIF};font-size:17px;font-weight:bold;color:${PALETTE.primary};vertical-align:middle;"> ${escapeHtml(brandName)}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 16px;font-family:${FONT_SERIF};font-size:22px;line-height:1.3;font-weight:bold;color:${PALETTE.text};">${escapeHtml(input.title)}</h1>${introHtml ? `\n              ${introHtml}` : ""}${buttonHtml ? `\n              ${buttonHtml}` : ""}${noteHtml ? `\n              ${noteHtml}` : ""}${itemsHtml ? `\n              ${itemsHtml}` : ""}
            </td>
          </tr>${
            footerHtml
              ? `
          <tr>
            <td style="padding:18px 32px;border-top:1px solid ${PALETTE.border};background-color:${PALETTE.surfaceSoft};border-radius:0 0 12px 12px;" bgcolor="${PALETTE.surfaceSoft}">
              ${footerHtml}
            </td>
          </tr>`
              : ""
          }
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textParts = [input.title];
  if (input.intro) textParts.push(input.intro);
  if (input.button) textParts.push(`${input.button.label}: ${input.button.url}`);
  if (input.note) textParts.push(input.note);
  if (input.items && input.items.length > 0) {
    textParts.push(input.items.map((item) => `- ${item}`).join("\n"));
  }
  if (input.footer) textParts.push(input.footer);
  const text = textParts.join("\n\n");

  return { html, text };
}
