import { escapeHtml, renderEmail } from "../lib/email-template.ts";

let ok = 0,
  fail = 0;
function check(cond: boolean, msg: string) {
  if (cond) ok++;
  else {
    fail++;
    console.log(`✗ ${msg}`);
  }
}

/* ── HTML e-posta kısıtları ─────────────────────────────────────────────── */
/*
 * Gmail `<style>` bloğunu sık sık siler ve dış kaynaklar (resim/font/CDN)
 * çoğu istemcide varsayılan engelli/gecikmeli geliyor — bu yüzden şablonun
 * ne <style> ne de dış http(s) kaynak içermediğini kanıtlıyoruz.
 */
{
  const { html } = renderEmail({ title: "Başlık", intro: "Merhaba" });
  check(!/<style[\s>]/i.test(html), "HTML'de <style> bloğu yok");
  check(!/src\s*=\s*"https?:/i.test(html), "dış <img>/kaynak yok (src=http…)");
  check(!/@import/i.test(html), "@import yok");
  check(!/<link[^>]+https?:/i.test(html), "dış <link> yok (font/CDN)");
}

/* ── Düğme: verilmezse yok, verilirse URL tam geçiyor ────────────────────── */
{
  const { html: htmlNoBtn, text: textNoBtn } = renderEmail({
    title: "Günlük hatırlatmalar",
    items: ["Ali'nin doğum günü"],
  });
  check(!/<a\s/i.test(htmlNoBtn), "düğme verilmeyince HTML'de <a> yok");
  check(!textNoBtn.includes("http"), "düğme yoksa metinde bağlantı yok");

  const url = "https://soylus.com/verify-email/abcDEF123";
  const { html, text } = renderEmail({
    title: "E-postanızı doğrulayın",
    intro: "Hesabınıza bu adresi bağlamak için aşağıdaki düğmeye tıklayın.",
    button: { label: "E-postamı doğrula", url },
    note: "Bağlantı 24 saat geçerlidir.",
  });
  check(html.includes(`href="${url}"`), "düğme href'inde URL tam olarak geçiyor");
  check(text.includes(url), "düz metinde URL tıklanamayan istemci için görünür");
  check(html.includes("E-postamı doğrula"), "düğme etiketi HTML'de var");
  check(text.includes("24 saat geçerlidir"), "geçerlilik notu düz metinde de var");
}

/* ── HTML kaçışı: kullanıcı girdisi enjeksiyona açmıyor ──────────────────── */
{
  const kotu = `<img src=x onerror=alert(1)> & "tık" 'tık' <b>kalın</b>`;
  const { html, text } = renderEmail({ title: kotu, intro: kotu, footer: kotu });

  check(!html.includes("<img src=x onerror=alert(1)>"), "başlıkta ham <img> yok");
  check(!html.includes("<b>kalın</b>"), "introda ham <b> yok");
  check(
    html.includes("&lt;img src=x onerror=alert(1)&gt;"),
    "< ve > kaçırılmış",
  );
  check(html.includes("&amp;"), "& kaçırılmış");
  check(html.includes("&quot;tık&quot;"), "çift tırnak kaçırılmış");
  check(html.includes("&#39;tık&#39;"), "tek tırnak kaçırılmış");
  // Düz metinde kaçış YOK — zaten HTML değil, olduğu gibi okunabilir kalmalı.
  check(text.includes(kotu), "düz metinde kaçış yapılmıyor (zaten düz metin)");

  check(escapeHtml("a&b") === "a&amp;b", "escapeHtml: & önce işleniyor (çifte kaçış yok)");
  check(
    escapeHtml("<script>&</script>") === "&lt;script&gt;&amp;&lt;/script&gt;",
    "escapeHtml: ardışık özel karakterler doğru kaçıyor",
  );
}

/* ── Madde listesi: verilince var, verilmeyince yok ──────────────────────── */
{
  const { html: withItems, text: textWithItems } = renderEmail({
    title: "Bugünün hatırlatmaları",
    items: ["Ayşe'nin doğum günü", "Mehmet & Fatma'nın evlilik yıl dönümü"],
  });
  check(withItems.includes("<ul"), "madde listesi verilince <ul> var");
  check(withItems.includes("<li"), "madde listesi verilince <li> var");
  check(
    withItems.includes("Mehmet &amp; Fatma&#39;nın evlilik yıl dönümü"),
    "madde metni kaçırılmış olarak listede",
  );
  check(textWithItems.includes("- Ayşe'nin doğum günü"), "düz metinde madde satırı var");

  const { html: noItems, text: textNoItems } = renderEmail({ title: "Başlık" });
  check(!noItems.includes("<ul"), "madde listesi verilmeyince <ul> yok");
  check(!textNoItems.includes("- "), "düz metinde madde satırı yok");

  const { html: emptyItems } = renderEmail({ title: "Başlık", items: [] });
  check(!emptyItems.includes("<ul"), "boş dizi de <ul> üretmiyor");
}

/* ── Genel yapı: tablo tabanlı düzen, ~600px, başlık/marka görünür ───────── */
{
  const { html, text } = renderEmail({
    title: "Şifrenizi sıfırlayın",
    intro: "Aşağıdaki düğmeye tıklayarak yeni bir şifre belirleyin.",
    button: { label: "Şifremi sıfırla", url: "https://soylus.com/reset/tok" },
    note: "Bağlantı 1 saat geçerlidir.",
    footer: "Bu isteği siz yapmadıysanız bu postayı yok sayabilirsiniz.",
  });
  check(html.includes("<table"), "düzen tablo tabanlı");
  check(!/display\s*:\s*flex/i.test(html), "flexbox kullanılmıyor");
  check(!/display\s*:\s*grid/i.test(html), "grid kullanılmıyor");
  check(html.includes("width=\"600\""), "gövde genişliği ~600px olarak öznitelikte de var");
  check(html.includes("Soy Ağacı"), "varsayılan marka adı görünür");
  check(html.includes("Şifrenizi sıfırlayın"), "başlık HTML'de var");
  check(text.startsWith("Şifrenizi sıfırlayın"), "düz metin başlıkla başlıyor");
  check(html.includes('name="color-scheme"'), "istemciye açık tema bildiriliyor (koyu modda kontrast kırılmasın)");

  // Marka özelleştirilebilir (i18n: EN sürümde farklı marka adı gerekebilir).
  const { html: enHtml } = renderEmail({ title: "Reset your password", brandName: "Family Tree", logoEmoji: "🌲" });
  check(enHtml.includes("Family Tree"), "brandName geçersiz kılınabiliyor");
  check(!enHtml.includes("Soy Ağacı"), "varsayılan marka adı sızmıyor");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
