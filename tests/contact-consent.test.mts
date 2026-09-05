import {
  REASK_DAYS,
  applyAnswer,
  applyContactChange,
  applyUnsubscribe,
  canEmailContact,
  normalizeContact,
  planAsk,
  planContactChange,
  type ContactConsent,
} from "../lib/contact-consent.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

/* ── Adres normalleştirme ────────────────────────────────────────────────── */
{
  check(normalizeContact("  Ayse@Ornek.COM  ") === "ayse@ornek.com", "kırpılıp küçültülüyor");
  check(normalizeContact("a@b.co") === "a@b.co", "geçerli adres geçiyor");
  check(normalizeContact("") === null, "boş red");
  check(normalizeContact("   ") === null, "boşluk red");
  check(normalizeContact(null) === null, "null red");
  check(normalizeContact(42) === null, "sayı red");
  check(normalizeContact("ayse") === null, "@ yoksa red");
  check(normalizeContact("ayse@ornek") === null, "nokta yoksa red");
  check(normalizeContact("ay se@ornek.com") === null, "boşluklu adres red");
  check(normalizeContact("ayse..b@ornek.com") === null, "çift nokta red");
  check(normalizeContact(`${"a".repeat(250)}@b.com`) === null, "254'ten uzun adres red");

  /*
   * TÜRKÇE TUZAĞI. Yerelsiz `toLowerCase()` Türkçe yerelde "I"yı "ı" yapar ve
   * "ALI@x.com" adresi "alı@x.com"a döner — var olmayan bir adrese posta
   * gönderilir ve kişi neden yanıt vermediğini kimse anlamaz. Bu yüzden
   * `toLocaleLowerCase("en")`.
   */
  check(normalizeContact("ALI@ORNEK.COM") === "ali@ornek.com", "büyük I dotless ı'ya dönüşmüyor");
  check(normalizeContact("ALI@ORNEK.COM") !== "alı@ornek.com", "Türkçe yerel tuzağına düşülmüyor");
}

/* ── TEK KAPI: gönderilebilir mi ─────────────────────────────────────────── */
/*
 * Bütün gönderim yolları buradan geçiyor. Tek satırlık bir işlev gibi görünüyor
 * ama asıl iş burada: "onayli" DIŞINDA hiçbir durum gönderime yetki vermiyor.
 */
{
  check(canEmailContact({ contactEmail: "a@b.com", contactConsent: "onayli" }), "onaylı adrese gönderilir");
  check(!canEmailContact({ contactEmail: "a@b.com", contactConsent: "bekliyor" }),
    "BEKLEYEN adrese gönderilmez (sessizlik onay değil)");
  check(!canEmailContact({ contactEmail: "a@b.com", contactConsent: "red" }), "reddedene gönderilmez");
  check(!canEmailContact({ contactEmail: "a@b.com" }),
    "hiç sorulmamış adrese gönderilmez (adres girilmesi izin DEĞİL)");
  check(!canEmailContact({}), "adres yoksa gönderilmez");
  check(!canEmailContact({ contactEmail: "   ", contactConsent: "onayli" }),
    "boşluktan ibaret adres gönderim yetkisi vermiyor");
  /*
   * Onay bayrağı adres olmadan tek başına yetmez: adres temizlenip bayrak
   * geride kalsaydı, kayıt "onaylı" görünürken gönderilecek bir yer olmazdı.
   */
  check(!canEmailContact({ contactConsent: "onayli" }), "adressiz onay gönderim yetkisi vermiyor");
}

/* ── Adres değişikliği ───────────────────────────────────────────────────── */
{
  const mevcut: ContactConsent = { contactEmail: "eski@ornek.com", contactConsent: "onayli" };

  check(planContactChange(mevcut, undefined).kind === "degismedi", "undefined dokunmuyor");
  check(planContactChange(mevcut, "").kind === "temizle", "boş metin temizliyor");
  check(planContactChange(mevcut, null).kind === "temizle", "null temizliyor");
  check(planContactChange(mevcut, "hatali").kind === "gecersiz", "geçersiz adres ayrı ele alınıyor");
  check(planContactChange(mevcut, "eski@ornek.com").kind === "degismedi", "aynı adres değişiklik değil");
  check(planContactChange(mevcut, "  ESKI@ORNEK.COM  ").kind === "degismedi",
    "büyük harf/boşluk farkı değişiklik sayılmıyor");

  const y = planContactChange(mevcut, " Yeni@Ornek.com ");
  check(y.kind === "ayarla" && y.email === "yeni@ornek.com", "yeni adres normalleştirilerek ayarlanıyor");

  /* Adres yokken yeni adres girmek de "ayarla". */
  const ilk = planContactChange({}, "ilk@ornek.com");
  check(ilk.kind === "ayarla", "boş alandan ilk adres ayarlanıyor");
}

/* --- ADRES DEĞİŞİNCE ONAY SIFIRLANIR ------------------------------------- */
/*
 * Bu maddenin en kolay kaçırılan tarafı. Sıfırlanmasaydı şu olurdu: teyze
 * adresini onaylar, sonra alan başka birinin adresiyle değiştirilir ve o kişi
 * HİÇ onay vermeden "onaylı" görünür — yani doğrudan istenmeyen posta.
 */
{
  const onayli: ContactConsent = {
    contactEmail: "teyze@ornek.com",
    contactConsent: "onayli",
    contactTokenHash: "h",
    contactAskedAt: "2026-01-01T00:00:00Z",
  };
  const s = applyContactChange(planContactChange(onayli, "kuzen@ornek.com"));
  check(s?.contactEmail === "kuzen@ornek.com", "yeni adres yazılıyor");
  check(s?.contactConsent === "bekliyor", "ONAY SIFIRLANIYOR — devralınmıyor");
  check(s?.contactTokenHash === undefined, "eski jeton düşüyor");
  check(s?.contactAskedAt === undefined, "eski sorma anı düşüyor — yeniden sorulabilsin");
  check(!canEmailContact({ ...onayli, ...s }), "değişiklikten sonra gönderim kapalı");
}

/* --- REDDEDENİN ADRESİ DEĞİŞİRSE ----------------------------------------- */
/*
 * Reddi "adres değiştirerek" aşmak mümkün olmamalı DEĞİL — burada bilinçli
 * karar şu: BAŞKA bir adres başka bir kişidir, ona bir kez sorulabilir.
 * Aynı adres yeniden girilirse `planContactChange` "degismedi" der ve red
 * yerinde kalır; kaydın silinmemesinin sebebi de bu.
 */
{
  const red: ContactConsent = { contactEmail: "hayir@ornek.com", contactConsent: "red" };
  check(planContactChange(red, "hayir@ornek.com").kind === "degismedi",
    "reddeden aynı adres yeniden girilince red korunuyor");
  check(applyContactChange(planContactChange(red, "hayir@ornek.com")) === null,
    "değişiklik yoksa kayıt yazılmıyor");
}

/* --- Temizleme her şeyi düşürüyor ---------------------------------------- */
{
  const s = applyContactChange({ kind: "temizle" });
  check(s?.contactEmail === "", "adres boşaltılıyor");
  check(s?.contactConsent === undefined, "onay düşüyor");
  check(s?.contactTokenHash === undefined, "jeton düşüyor");
  check(s?.contactAskedAt === undefined, "sorma anı düşüyor");
}
check(applyContactChange({ kind: "degismedi" }) === null, "değişmediyse null");
check(applyContactChange({ kind: "gecersiz" }) === null, "geçersizse null");

/* ── Onay isteği ─────────────────────────────────────────────────────────── */

const SIMDI = new Date("2026-09-05T12:00:00Z");
const gunOnce = (n: number) => new Date(SIMDI.getTime() - n * 86_400_000).toISOString();

{
  const p = (c: ContactConsent) => {
    const r = planAsk(c, SIMDI);
    return r.kind === "sor" ? "sor" : r.reason;
  };

  check(p({}) === "adres-yok", "adres yoksa sorulmuyor");
  check(p({ contactEmail: "   " }) === "adres-yok", "boşluk adres sayılmıyor");
  check(p({ contactEmail: "a@b.com" }) === "sor", "yeni adrese soruluyor");
  check(p({ contactEmail: "a@b.com", contactConsent: "bekliyor" }) === "sor",
    "yanıt beklenen ama hiç sorulmamış kayda soruluyor");
  check(p({ contactEmail: "a@b.com", contactConsent: "onayli" }) === "zaten-onayli",
    "onaylıya tekrar sorulmuyor");

  /* REDDEDENE BİR DAHA SORULMAZ — bu dosyanın ikinci belkemiği. */
  check(p({ contactEmail: "a@b.com", contactConsent: "red" }) === "reddetti",
    "reddedene BİR DAHA sorulmuyor");
  check(p({ contactEmail: "a@b.com", contactConsent: "red", contactAskedAt: gunOnce(3650) }) === "reddetti",
    "on yıl geçse de reddedene sorulmuyor — red zaman aşımına uğramıyor");

  /* Bekleyene sık sorulmaz: ısrar, tam olarak istenmeyen postanın tanımı. */
  check(p({ contactEmail: "a@b.com", contactAskedAt: gunOnce(1) }) === "yakinda-soruldu",
    "dün sorulmuşsa bugün sorulmuyor");
  check(p({ contactEmail: "a@b.com", contactAskedAt: gunOnce(REASK_DAYS - 1) }) === "yakinda-soruldu",
    "süre dolmadan sorulmuyor");
  check(p({ contactEmail: "a@b.com", contactAskedAt: gunOnce(REASK_DAYS) }) === "sor",
    "tam sınırda yeniden soruluyor");
  check(p({ contactEmail: "a@b.com", contactAskedAt: gunOnce(REASK_DAYS + 1) }) === "sor",
    "süre dolunca yeniden soruluyor");
}
{
  const r = planAsk({ contactEmail: "  a@b.com  " }, SIMDI);
  check(r.kind === "sor" && r.email === "a@b.com", "sorulacak adres kırpılmış dönüyor");
}

/* ── Yanıt ───────────────────────────────────────────────────────────────── */
{
  const bekleyen: ContactConsent = {
    contactEmail: "a@b.com",
    contactConsent: "bekliyor",
    contactTokenHash: "ozet",
    contactAskedAt: gunOnce(2),
  };

  const evet = applyAnswer(bekleyen, "onayla");
  check(evet.contactConsent === "onayli", "onay kaydediliyor");
  check(canEmailContact(evet), "onaydan sonra gönderim açılıyor");
  check(evet.contactEmail === "a@b.com", "adres korunuyor");

  const hayir = applyAnswer(bekleyen, "reddet");
  check(hayir.contactConsent === "red", "red kaydediliyor");
  check(!canEmailContact(hayir), "reddedene gönderilmiyor");

  /*
   * JETON DÜŞÜYOR: bağlantı tek kullanımlık. Postada duran bir bağlantı sonsuza
   * dek onay/ret değiştirebilseydi, o postayı gören HERKES o kişi adına karar
   * verebilirdi — iletilmiş bir posta, ortak bir telefon, bir ekran görüntüsü.
   */
  check(evet.contactTokenHash === undefined, "onaydan sonra jeton düşüyor");
  check(hayir.contactTokenHash === undefined, "retten sonra jeton düşüyor");

  check(bekleyen.contactConsent === "bekliyor", "kaynak kayıt kirlenmiyor (kopya dönüyor)");
}

/* ── Abonelikten çıkma ───────────────────────────────────────────────────── */
{
  const onayli: ContactConsent = { contactEmail: "a@b.com", contactConsent: "onayli", contactTokenHash: "x" };
  const c = applyUnsubscribe(onayli);
  check(c.contactConsent === "red", "çıkış reddediyor");
  check(!canEmailContact(c), "çıkıştan sonra gönderim kapanıyor");
  check(c.contactTokenHash === undefined, "çıkışta jeton düşüyor");

  /*
   * ADRES SİLİNMİYOR. Silinseydi aynı adres yarın yeniden girilir, `planAsk`
   * onu "yeni adres" sanır ve çıkmış kişiye bir kez daha yazılırdı. Kayıt
   * kalınca "bu kişi istemedi" bilgisi de kalıyor.
   */
  check(c.contactEmail === "a@b.com", "adres SİLİNMİYOR, red işaretleniyor");
  check(planAsk(c, SIMDI).kind === "sorma", "çıkan kişiye bir daha sorulmuyor");
}

/* ── Uçtan uca: adresi giren kişi onay veremez ───────────────────────────── */
/*
 * Bu dosyanın var olma sebebi tek cümlede: kullanıcı BAŞKASININ adresini
 * giriyor. Aşağıdaki akışta kullanıcı elinden geleni yapıyor — adresi giriyor,
 * kaydediyor — ve gönderim yine de AÇILMIYOR. Açılması için tek yol, adresin
 * sahibinin kendi tıklaması.
 */
{
  let kayit: ContactConsent = {};
  const d1 = applyContactChange(planContactChange(kayit, "teyze@ornek.com"));
  kayit = { ...kayit, ...d1 };
  check(!canEmailContact(kayit), "adres girildi ama gönderim KAPALI");

  const istek = planAsk(kayit, SIMDI);
  check(istek.kind === "sor", "onay postası gönderilecek");
  kayit = { ...kayit, contactTokenHash: "ozet", contactAskedAt: SIMDI.toISOString() };
  check(!canEmailContact(kayit), "soru gönderildi, gönderim hâlâ kapalı");

  /* Kişi susarsa: ne gönderilir ne de yeniden sorulur. */
  const birHafta = new Date(SIMDI.getTime() + 7 * 86_400_000);
  check(!canEmailContact(kayit), "sessizlik onay sayılmıyor");
  check(planAsk(kayit, birHafta).kind === "sorma", "sessiz kalana bir hafta sonra da sorulmuyor");

  /* Kişi kendi tıklarsa: tek kapı açılıyor. */
  kayit = applyAnswer(kayit, "onayla");
  check(canEmailContact(kayit), "kişinin KENDİ tıklaması gönderimi açıyor");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
