import { forwardTargets, forwardText, planForward, MAX_HEDEF } from "../lib/inbox-forward.ts";
import { applyFromName } from "../lib/email.ts";
import type { Mail } from "../lib/inbox.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }
function eq(a: unknown, b: unknown, msg: string) {
  const g = JSON.stringify(a) === JSON.stringify(b);
  if (!g) console.log(`✗ ${msg}\n   beklenen: ${JSON.stringify(b)}\n   gelen:    ${JSON.stringify(a)}`);
  g ? ok++ : fail++;
}

const posta = (o: Partial<Mail> = {}): Mail => ({
  id: "m1",
  from: "ali@ornek.com",
  fromName: "Ali Veli",
  to: "bilgi@soylus.com",
  subject: "Merhaba",
  text: "Dedemin doğum tarihi yanlış görünüyor.",
  at: "2026-09-06T14:03:00.000Z",
  ...o,
});

/* ── Hedef listesi ────────────────────────────────────────────────────────── */

eq(forwardTargets(undefined), [], "değişken yoksa hedef yok");
eq(forwardTargets(""), [], "boş değer hedef üretmiyor");
eq(forwardTargets("bana@yahoo.com"), ["bana@yahoo.com"], "tek adres");
eq(forwardTargets("a@x.com, b@y.com"), ["a@x.com", "b@y.com"], "virgülle iki adres");
eq(forwardTargets("a@x.com;b@y.com"), ["a@x.com", "b@y.com"], "noktalı virgül de ayırıcı");
eq(forwardTargets("a@x.com b@y.com"), ["a@x.com", "b@y.com"], "boşluk da ayırıcı");
eq(forwardTargets("  a@x.com ,, b@y.com  "), ["a@x.com", "b@y.com"], "fazladan boşluk/ayırıcı sorun değil");
eq(forwardTargets("A@X.com"), ["a@x.com"], "adres küçük harfe iniyor");
eq(forwardTargets("a@x.com, A@X.COM"), ["a@x.com"], "aynı adres iki kez yazılsa da bir kez");
eq(forwardTargets("bozuk, a@x.com"), ["a@x.com"], "geçersiz parça düşüyor, geçerli olan kalıyor");
eq(forwardTargets("bozuk, hicbiri"), [], "hiç geçerli adres yoksa liste boş");
/*
 * "Ayşe <a@x.com>" biçimi de kabul ediliyor: ortam değişkenini insan yazıyor
 * ve posta adresini bu biçimde yapıştırmak çok olağan.
 */
eq(forwardTargets("Ayşe <a@x.com>"), ["a@x.com"], "görünen adlı yazım ayrıştırılıyor");

/*
 * TAVAN. İletme, doğrulanmış alan adımızdan gönderim demek: uzun bir liste
 * tek gelen postayı onlarca gönderime çevirirdi.
 */
{
  const cok = Array.from({ length: 12 }, (_, i) => `a${i}@x.com`).join(",");
  eq(forwardTargets(cok).length, MAX_HEDEF, `en fazla ${MAX_HEDEF} hedef`);
}

/* ── Karar: kapalı / döngü / ilet ─────────────────────────────────────────── */

eq(planForward(posta(), []), { ilet: false, state: "kapali" }, "hedef yoksa kapalı");

/*
 * DÖNGÜ — bu dosyanın en pahalı denetimi.
 *
 * Hedefin tatil yanıtlayıcısı `bilgi@`ye yazarsa: posta gelir → hedefe
 * iletilir → otomatik yanıt geri gelir → yine iletilir… kota bitene kadar.
 */
{
  const k = planForward(posta({ from: "bana@yahoo.com" }), ["bana@yahoo.com"]);
  eq(k, { ilet: false, state: "dongu" }, "gönderen iletme hedefiyse iletilmiyor");
}
{
  const k = planForward(posta({ from: "BANA@Yahoo.com" }), ["bana@yahoo.com"]);
  check(!k.ilet, "döngü denetimi büyük/küçük harften etkilenmiyor");
}
{
  const k = planForward(posta({ from: "Ben <bana@yahoo.com>" }), ["bana@yahoo.com"]);
  check(!k.ilet, "döngü denetimi görünen adlı adreste de çalışıyor");
}
{
  // Kendi gönderen adresimizden dönen posta: iletmek yankıdan başka bir şey değil.
  const k = planForward(posta({ from: "bilgi@soylus.com" }), ["bana@yahoo.com"],
    ["Soylus <bilgi@soylus.com>"]);
  eq(k, { ilet: false, state: "dongu" }, "kendi adresimizden gelen posta iletilmiyor");
}
{
  const k = planForward(posta(), ["bana@yahoo.com"], ["bilgi@soylus.com"]);
  check(k.ilet, "yabancıdan gelen posta iletiliyor");
}

/* ── İletilen postanın kendisi ────────────────────────────────────────────── */
{
  const k = planForward(posta(), ["bana@yahoo.com", "b@y.com"]);
  if (!k.ilet) { fail++; console.log("✗ plan bekleniyordu"); }
  else {
    eq(k.plan.to, ["bana@yahoo.com", "b@y.com"], "iki hedefe birden");
    /*
     * "Yanıtla" ÖZGÜN GÖNDERENE gitmeli. Gitmezse yanıt kendi kutumuza döner
     * ve kullanıcı cevap verdiğini sanırken kimseye ulaşmaz.
     */
    eq(k.plan.replyTo, "ali@ornek.com", "yanıt adresi özgün gönderen");
    eq(k.plan.subject, "Merhaba", "konu DEĞİŞTİRİLMİYOR (arama bozulmasın)");
    check(k.plan.fromName.startsWith("Ali Veli"), "görünen ad özgün göndereni söylüyor");
    check(k.plan.text.includes("Dedemin doğum tarihi"), "gövde iletiliyor");
    check(k.plan.text.includes("ali@ornek.com"), "gönderen adresi metinde yazıyor");
    check(k.plan.text.includes("2026-09-06"), "tarih metinde yazıyor");
  }
}
{
  // Konusuz posta: boş bir `Subject` yerine okunur bir yer tutucu.
  const k = planForward(posta({ subject: "" }), ["b@y.com"]);
  check(k.ilet && k.plan.subject === "(konusuz)", "konusuz posta için yer tutucu");
}
{
  /*
   * BAŞLIK ENJEKSİYONU: konu ve ad, giden postanın BAŞLIKLARINA yazılıyor.
   * Satır sonu taşıyan bir değer orada YENİ BİR BAŞLIK açardı.
   */
  const k = planForward(posta({ subject: "Selam\r\nBcc: kurban@ornek.com", fromName: "Ali\nX" }),
    ["b@y.com"]);
  check(k.ilet && !/[\r\n]/.test(k.plan.subject), "konuda satır sonu kalmıyor");
  check(k.ilet && !/[\r\n]/.test(k.plan.fromName), "görünen adda satır sonu kalmıyor");
  check(k.ilet && !/[<>]/.test(k.plan.fromName.replace(" (soylus)", "")),
    "görünen adda köşeli ayraç kalmıyor");
}
{
  /*
   * Gönderen adresi okunamıyorsa `replyTo` VERİLMİYOR. Boş dize verilseydi
   * `sendEmail` onu "belirtilmedi" sayıp `EMAIL_REPLY_TO`ya düşerdi — yani
   * yanıt kendi kutumuza gelirdi ve kullanıcı bunu hiç fark etmezdi.
   */
  const k = planForward(posta({ from: "", fromName: "" }), ["b@y.com"]);
  check(k.ilet && k.plan.replyTo === undefined, "gönderen yoksa yanıt adresi de yok");
  check(k.ilet && k.plan.fromName.length > 0, "gönderen yoksa da bir görünen ad var");
  check(k.ilet && k.plan.text.includes("yanıt gönderene ulaşmaz"),
    "yanıtlanamayacağı metinde söyleniyor");
}

/* ── Gövde bloğu ──────────────────────────────────────────────────────────── */
{
  const t = forwardText(posta(), "https://soylus.com");
  check(t.includes("Gönderen: Ali Veli <ali@ornek.com>"), "gönderen satırı");
  check(t.includes("Alıcı: bilgi@soylus.com"), "hangi adresimize geldiği yazıyor");
  check(t.includes("Konu: Merhaba"), "konu satırı");
  check(t.includes("https://soylus.com/admin/posta"), "arşiv bağlantısı");
}
{
  const t = forwardText(posta({ text: "", bodyFetch: "yetki" }));
  /*
   * Gövde alınamadıysa SEBEBİ yazılıyor. Boş posta iletmek "adam boş posta
   * atmış" izlenimi verirdi; oysa sebep bizim tarafımızda ve düzeltilebilir.
   */
  check(t.includes("gönderim yetkisi"), "gövde alınamadıysa sebebi yazıyor");
  check(!t.includes("(Boş posta.)"), "eksik gövde 'boş posta' diye gösterilmiyor");
}
{
  const t = forwardText(posta({ text: "" }));
  check(t.includes("(Boş posta.)"), "gerçekten boş posta öyle deniyor");
}
{
  const t = forwardText(posta({ attachments: [{ name: "belge.pdf", size: 12 }] }));
  check(t.includes("belge.pdf") && t.includes("indirilmedi"),
    "ekin adı yazıyor ama indirilmediği söyleniyor");
}
{
  // Tavan: yabancının yazdığı gövde sınırsız değil.
  const t = forwardText(posta({ text: "x".repeat(50_000) }));
  check(t.length <= 20_000, "iletilen metin MAX_TEXT'i aşmıyor");
}

/* ── `From` görünen adı ───────────────────────────────────────────────────── */

eq(applyFromName("Soylus <bilgi@soylus.com>", "Ali Veli"), "Ali Veli <bilgi@soylus.com>",
  "görünen ad değişiyor, adres aynı kalıyor");
eq(applyFromName("bilgi@soylus.com", "Ali Veli"), "Ali Veli <bilgi@soylus.com>",
  "çıplak adrese de ad eklenebiliyor");
eq(applyFromName("Soylus <bilgi@soylus.com>", undefined), "Soylus <bilgi@soylus.com>",
  "ad verilmezse dokunulmuyor");
eq(applyFromName("Soylus <bilgi@soylus.com>", "   "), "Soylus <bilgi@soylus.com>",
  "boşluktan ibaret ad yok sayılıyor");
/*
 * ADRESİ DEĞİŞTİRMEK MÜMKÜN OLMAMALI. Olsaydı bu alan, doğrulanmamış bir
 * adresten gönderme (ve alan adı taklidi) yolu olurdu — adı YABANCI yazıyor.
 */
eq(applyFromName("Soylus <bilgi@soylus.com>", "Kötü <saldirgan@kotu.com>"),
  "Kötü saldirgan kotu.com <bilgi@soylus.com>", "adda yazılan adres From'u ele geçiremiyor");
check(!applyFromName("Soylus <bilgi@soylus.com>", "X\r\nBcc: k@o.com").includes("\r"),
  "adda satır sonu kalmıyor");
check(!applyFromName("Soylus <bilgi@soylus.com>", "X\r\nBcc: k@o.com").includes("\n"),
  "adda satır başı kalmıyor");
eq(applyFromName("Soylus <bilgi@soylus.com>", "a".repeat(200)).length <= 78 + 24, true,
  "uzun ad kırpılıyor");

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
