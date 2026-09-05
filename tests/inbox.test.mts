import {
  MAX_MAILS, MAX_SUBJECT, MAX_TEXT,
  displayName, normalizeAddress, parseInbound, parseInboundResult, payloadShape,
  planStore, quoteForReply, replySubject, threadHeaders,
  type Mail,
} from "../lib/inbox.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

const SIMDI = new Date("2026-09-05T22:00:00Z");

/* ── Adres ───────────────────────────────────────────────────────────────── */
{
  check(normalizeAddress("ayse@ornek.com") === "ayse@ornek.com", "düz adres");
  check(normalizeAddress("Ayşe Yılmaz <Ayse@Ornek.COM>") === "ayse@ornek.com", "açılı biçimden çıkarılıyor");
  check(normalizeAddress("  a@b.co  ") === "a@b.co", "kırpılıyor");
  check(normalizeAddress("") === "", "boş red");
  check(normalizeAddress(null) === "", "null red");
  check(normalizeAddress(42) === "", "sayı red");
  check(normalizeAddress("ayse") === "", "@ yoksa red");
  check(normalizeAddress("a@b") === "", "nokta yoksa red");
  check(normalizeAddress(`${"a".repeat(250)}@b.com`) === "", "aşırı uzun red");

  /*
   * TÜRKÇE TUZAĞI. Yerelsiz `toLowerCase()` Türkçe yerelde "I"yı "ı" yapar;
   * "ALI@x.com" adresi "alı@x.com"a döner ve yanıt VAR OLMAYAN bir adrese
   * gider. Depoda bu tuzağa iki kez düşüldü.
   */
  check(normalizeAddress("ALI@ORNEK.COM") === "ali@ornek.com", "büyük I dotless ı'ya dönmüyor");
}
{
  check(displayName("Ayşe Yılmaz <a@b.co>") === "Ayşe Yılmaz", "görünen ad okunuyor");
  check(displayName('"Ayşe" <a@b.co>') === "Ayşe", "tırnaklar atılıyor");
  check(displayName("a@b.co") === "", "ad yoksa boş");
  check(displayName("<a@b.co>") === "", "başta ad yoksa boş");
}

/* ── Ayrıştırma ──────────────────────────────────────────────────────────── */
const YUK = {
  type: "email.received",
  data: {
    from: "Ayşe Yılmaz <ayse@ornek.com>",
    to: ["bilgi@soylus.com"],
    subject: "Bir sorum var",
    text: "Merhaba, ağaca nasıl kişi eklerim?",
    html: "<p>Merhaba</p><script>alert(1)</script>",
    message_id: "<abc@mail>",
  },
};

{
  const m = parseInbound(YUK, "m1", SIMDI)!;
  check(!!m, "geçerli yük ayrıştırılıyor");
  check(m.from === "ayse@ornek.com", "gönderen adresi");
  check(m.fromName === "Ayşe Yılmaz", "gönderenin görünen adı");
  check(m.to === "bilgi@soylus.com", "alıcı adresi");
  check(m.subject === "Bir sorum var", "konu");
  check(m.text.includes("nasıl kişi eklerim"), "düz metin gövde");
  check(m.messageId === "<abc@mail>", "Message-ID taşınıyor");
  check(m.at === SIMDI.toISOString(), "geliş anı sunucudan");
}

/* --- HTML HİÇ SAKLANMIYOR — bu dosyanın en önemli kuralı ---------------- */
/*
 * Gövdeyi gönderen belirliyor. O HTML'i saklayıp yönetici ekranında çizmek,
 * sayfaya saldırganın seçtiği işaretlemeyi koymak demek: betik, izleme
 * pikseli, sahte form. Postanın "güzel" görünmemesi kabul edilen bedel.
 */
{
  const m = parseInbound(YUK, "m1", SIMDI)!;
  const alanlar = Object.keys(m);
  check(!alanlar.includes("html"), "kayıtta html alanı YOK");
  check(!JSON.stringify(m).includes("<script>"), "betik hiçbir alana sızmıyor");
  check(!JSON.stringify(m).includes("<p>"), "html işaretlemesi hiçbir alana sızmıyor");
}
{
  /*
   * Metin YOKKEN html'den metin TÜRETİLMİYOR. Türetmek cazip ama o dönüşüm,
   * saklamamaya karar verdiğimiz içeriği dolambaçlı yoldan içeri almak olurdu.
   */
  const y = { data: { ...YUK.data, text: undefined, html: "<p>Gizli metin</p>" } };
  const m = parseInbound(y, "m2", SIMDI)!;
  check(!!m, "metinsiz posta yine de kabul ediliyor");
  check(m.text === "", "html'den metin TÜRETİLMİYOR");
}

/* --- Biçim TOLERANSI ---------------------------------------------------- */
/*
 * Sağlayıcı alan adını değiştirdiğinde postanın SESSİZCE kaybolması, katı bir
 * ayrıştırıcının en kötü sonucu: kimse fark etmez, yalnız kutu boş kalır.
 */
{
  const nesne = parseInbound(
    { data: { from: { address: "a@b.co" }, to: { address: "bilgi@soylus.com" }, subject: "X", text: "Y" } },
    "m3", SIMDI
  );
  check(nesne?.from === "a@b.co", "nesne biçimli `from` kabul");
  check(nesne?.to === "bilgi@soylus.com", "nesne biçimli `to` kabul");

  const duz = parseInbound({ from: "a@b.co", to: "bilgi@soylus.com", subject: "X", plain: "Y" }, "m4", SIMDI);
  check(duz?.text === "Y", "`data` sarmalayıcısı olmadan da, `plain` alanı da kabul");

  const cokAlicili = parseInbound({ data: { ...YUK.data, to: ["gecersiz", "bilgi@soylus.com"] } }, "m5", SIMDI);
  check(cokAlicili?.to === "bilgi@soylus.com", "dizideki ilk GEÇERLİ adres alınıyor");
}

/* --- Ayrıştırılamayan yük --------------------------------------------------- */
for (const [ad, y] of [
  ["null", null],
  ["metin", "merhaba"],
  ["gönderensiz", { data: { to: "bilgi@soylus.com", text: "x" } }],
  ["alıcısız", { data: { from: "a@b.co", text: "x" } }],
  ["geçersiz gönderen", { data: { from: "kimse", to: "bilgi@soylus.com" } }],
] as const)
  check(parseInbound(y, "x", SIMDI) === null, `ayrıştırılamayan yük reddediliyor: ${ad}`);

/* --- Sınırlar ----------------------------------------------------------- */
{
  const m = parseInbound(
    { data: { from: "a@b.co", to: "bilgi@soylus.com", subject: "k".repeat(500), text: "m".repeat(MAX_TEXT + 100) } },
    "m6", SIMDI
  )!;
  check(m.subject.length === MAX_SUBJECT, "konu kırpılıyor");
  check(m.text.length === MAX_TEXT, "metin kırpılıyor");
  check(parseInbound({ data: { from: "a@b.co", to: "bilgi@soylus.com" } }, "m7", SIMDI)?.subject === "(konusuz)",
    "konusuz postaya yer tutucu");
}

/* --- EKLER: yalnız ad ve boyut ------------------------------------------ */
/*
 * Yabancının gönderdiği dosyaları kendi deponuza indirmek, bilmediğiniz
 * içeriği kendi altyapınızda barındırmak demek.
 */
{
  const m = parseInbound(
    { data: { ...YUK.data, attachments: [{ filename: "fotograf.jpg", size: 1234, content: "BASE64VERI" }] } },
    "m8", SIMDI
  )!;
  check(m.attachments?.[0]?.name === "fotograf.jpg", "ek adı kaydediliyor");
  check(m.attachments?.[0]?.size === 1234, "ek boyutu kaydediliyor");
  check(!JSON.stringify(m).includes("BASE64VERI"), "ekin İÇERİĞİ saklanmıyor");
  check(parseInbound(YUK, "m9", SIMDI)?.attachments === undefined, "eksiz postada alan hiç yok");
}

/* ── Saklama ─────────────────────────────────────────────────────────────── */
const mail = (id: string): Mail => ({
  id, from: "a@b.co", to: "bilgi@soylus.com", subject: "K", text: "M", at: SIMDI.toISOString(),
});
{
  const liste = planStore([mail("eski")], mail("yeni"));
  check(liste.length === 2, "yeni posta ekleniyor");
  check(liste[0].id === "yeni", "en yeni başta");

  /* Sağlayıcı yeniden denemesi aynı postayı İKİ KEZ eklememeli. */
  const tekrar = planStore(liste, mail("yeni"));
  check(tekrar.length === 2, "aynı kimlikli posta çoğaltılmıyor");
  check(tekrar === liste, "değişiklik yoksa aynı liste dönüyor");
}
{
  /*
   * Tavan aşılınca EN ESKİSİ düşüyor, yeni gelen değil. Yeniyi reddetmek, tam
   * da okunmak istenen postayı kaybetmek olurdu; eskiler zaten okunmuş.
   */
  const dolu = Array.from({ length: MAX_MAILS }, (_, i) => mail(`m${i}`));
  const sonra = planStore(dolu, mail("taze"));
  check(sonra.length === MAX_MAILS, "tavan korunuyor");
  check(sonra[0].id === "taze", "yeni gelen kutuda");
  check(!sonra.some((m) => m.id === `m${MAX_MAILS - 1}`), "en eski düştü");
}

/* ── Yanıt ───────────────────────────────────────────────────────────────── */
{
  check(replySubject("Merhaba") === "Re: Merhaba", "konuya Re: ekleniyor");
  check(replySubject("Re: Merhaba") === "Re: Merhaba", "ikinci Re: EKLENMİYOR");
  check(replySubject("RE:Merhaba") === "RE:Merhaba", "büyük harf/boşluksuz Re: de tanınıyor");
  check(replySubject("  Merhaba  ") === "Re: Merhaba", "kırpılıyor");
  check(replySubject("k".repeat(300)).length === MAX_SUBJECT, "uzun konu kırpılıyor");
}
{
  const q = quoteForReply({ from: "a@b.co", at: SIMDI.toISOString(), text: "Bir\nİki" });
  check(q.includes("> Bir") && q.includes("> İki"), "her satır alıntılanıyor");
  check(q.includes("a@b.co"), "gönderen alıntıda");
  check(q.includes("2026-09-05"), "tarih alıntıda");
  const uzun = quoteForReply({ from: "a@b.co", at: SIMDI.toISOString(), text: "x".repeat(5000) }, 100);
  check(uzun.includes("…"), "uzun alıntı kırpılıyor");
  check(uzun.length < 400, "kırpılan alıntı gerçekten kısa");
}
{
  /*
   * Zincir başlıkları olmadan yanıt AYRI bir konu gibi düşer ve karşı taraf
   * neyin yanıtı olduğunu anlamaz.
   */
  const h = threadHeaders({ messageId: "<abc@mail>" });
  check(h["In-Reply-To"] === "<abc@mail>", "In-Reply-To kuruluyor");
  check(h.References === "<abc@mail>", "References kuruluyor");
  check(Object.keys(threadHeaders({})).length === 0, "Message-ID yoksa başlık üretilmiyor");
}

/* ── GERÇEK Resend yükü ─────────────────────────────────────────────────── */
/*
 * Bu yük uydurma DEĞİL: canlıda `bilgi@soylus.com`a atılan ilk test
 * postasının webhook kaydından birebir alındı. Ayrıştırıcı önce bu biçimi
 * hiç görmeden yazılmıştı; artık gerçek biçime karşı kilitli.
 *
 * Dikkat çeken şey burada NE OLMADIĞI: yükte `text` ya da `html` YOK. Gelen
 * bildirim postanın gövdesini taşımıyor, yalnız üstbilgi ve konu. Bu bir
 * hata değil, sağlayıcının davranışı — ve arayüz boş gövdeyi açıkça
 * söylüyor, boş bir alan gösterip "kişi boş posta atmış" izlenimi vermiyor.
 */
const RESEND_YUKU = {
  created_at: "2026-09-05T23:01:52.000Z",
  data: {
    attachments: [],
    bcc: [],
    cc: [],
    created_at: "2026-09-05T23:02:00.429Z",
    email_id: "f2cc5cbd-6bb1-4c1d-ab51-f76e9a97913f",
    from: "bugrabilim@yahoo.com",
    message_id: "<1136478454.1118889.1788649312714@mail.yahoo.com>",
    received_for: ["bilgi@soylus.com"],
    subject: "test",
    to: ["bilgi@soylus.com"],
  },
  type: "email.received",
};

{
  const m = parseInbound(RESEND_YUKU, "msg_3Ive9wxO8Waz7cs5WLDbBUug4HX", SIMDI)!;
  check(!!m, "gerçek Resend yükü ayrıştırılıyor");
  check(m.from === "bugrabilim@yahoo.com", "gönderen");
  check(m.to === "bilgi@soylus.com", "alıcı dizinin ilk elemanından");
  check(m.subject === "test", "konu");
  check(m.messageId === "<1136478454.1118889.1788649312714@mail.yahoo.com>", "Message-ID");
  check(m.providerId === "f2cc5cbd-6bb1-4c1d-ab51-f76e9a97913f", "sağlayıcı kimliği saklanıyor");
  check(m.text === "", "gövde yok — yük onu taşımıyor");
  check(m.attachments === undefined, "boş ek dizisi alan üretmiyor");
}

/* ── GÖNDERİM olayları gelen kutusuna DÜŞMEZ ────────────────────────────── */
/*
 * Abonelikte yanlışlıkla gönderim olayları da seçilirse, bizim gönderdiğimiz
 * her posta "gelmiş" gibi kutuya düşerdi: kendi hatırlatmalarımız, kendi
 * onay sorularımız. Kutu kendi yankımızla dolar ve fark etmek zor olurdu.
 */
for (const t of ["email.sent", "email.delivered", "email.bounced", "email.opened", "email.clicked"]) {
  const y = { ...RESEND_YUKU, type: t };
  const r = parseInboundResult(y, "x", SIMDI);
  check("fail" in r && r.fail === "gonderim-olayi", `"${t}" gelen kutusuna düşmüyor`);
}
/* Liste OLUMSUZ tanımlı: bilinmeyen tür GEÇMELİ, yoksa ad değişince her şey elenir. */
{
  const r = parseInboundResult({ ...RESEND_YUKU, type: "inbound.email.new" }, "x", SIMDI);
  check("mail" in r, "bilinmeyen olay adı elenmiyor (olumsuz liste)");
}

/* ── Başarısızlık NEDENİ dönüyor — sessiz eleme yok ─────────────────────── */
/*
 * Eskiden yalnız `null` dönüyordu ve rota sessizce 200 veriyordu: "posta hiç
 * gelmedi" ile "geldi ama elendi" ayırt edilemiyordu. İlk gerçek denemede
 * tam olarak bu belirsizlik yaşandı.
 */
{
  const neden = (y: unknown) => {
    const r = parseInboundResult(y, "x", SIMDI);
    return "fail" in r ? r.fail : "ok";
  };
  check(neden(null) === "yuk-nesne-degil", "nesne olmayan yük");
  check(neden("merhaba") === "yuk-nesne-degil", "metin yük");
  check(neden({ data: { to: ["a@b.co"] } }) === "gonderen-yok", "gönderensiz");
  check(neden({ data: { from: "a@b.co" } }) === "alici-yok", "alıcısız");
  check(neden(RESEND_YUKU) === "ok", "gerçek yük geçiyor");
}

/* --- Biçim günlüğe ALAN ADLARIYLA yazılıyor, değerlerle değil ------------ */
/*
 * Yükün kendisini loglamak, yabancının yazdığı postayı günlüklere
 * kopyalamak olurdu. Biçimi görmeye ad listesi yeter.
 */
{
  const b = payloadShape(RESEND_YUKU);
  check(b.includes("type") && b.includes("data:"), "üst ve data alanları listeleniyor");
  check(b.includes("from") && b.includes("subject"), "data alan adları listeleniyor");
  check(!b.includes("bugrabilim@yahoo.com"), "gönderen ADRESİ günlüğe girmiyor");
  check(!b.includes("test"), "konu METNİ günlüğe girmiyor");
  check(payloadShape(null) === "object", "null için tür adı");
  check(payloadShape("x") === "string", "metin için tür adı");
}

/* --- Alternatif alan adları da kabul ediliyor ---------------------------- */
{
  const a = parseInbound({ data: { from: { email: "a@b.co" }, to: [{ email: "c@d.co" }] } }, "x", SIMDI);
  check(a?.from === "a@b.co" && a?.to === "c@d.co", "`email` alanlı nesne biçimi");
  const b = parseInbound({ data: { sender: "a@b.co", recipient: "c@d.co" } }, "x", SIMDI);
  check(b?.from === "a@b.co" && b?.to === "c@d.co", "`sender`/`recipient` biçimi");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
