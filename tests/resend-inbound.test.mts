import { fetchInboundBody } from "../lib/resend-inbound.ts";
import { MAX_TEXT } from "../lib/inbox.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

/**
 * GÖVDE ÇEKME.
 *
 * Sağlayıcının webhook bildirimi gövdeyi taşımıyor; gövde ayrı bir çağrıyla
 * alınıyor ve o çağrı BAŞARISIZ OLABİLİYOR. Buradaki iddiaların çoğu başarı
 * yolu değil, başarısızlık yolları hakkında — çünkü en olası arıza sıradan
 * bir ağ hatası değil: gönderim için üretilmiş bir API anahtarının okuma
 * yetkisi yok ve bu, BEKLEMEKLE GEÇMEYEN bir durum. Kullanıcıya "tekrar
 * dene" demekle "anahtarı değiştir" demek arasındaki farkı bu ayrım kuruyor.
 */

/** Sahte `fetch`: verilen yanıtı döndürür, çağrıldığını kaydeder. */
function sahte(yanit: { status: number; body?: unknown; atsin?: boolean }) {
  const cagrilar: Array<{ url: string; auth?: string }> = [];
  const f = async (url: string, init?: { headers?: Record<string, string> }) => {
    cagrilar.push({ url, auth: init?.headers?.Authorization });
    if (yanit.atsin) throw new Error("ağ koptu");
    return {
      ok: yanit.status >= 200 && yanit.status < 300,
      status: yanit.status,
      json: async () => yanit.body,
    };
  };
  return { f, cagrilar };
}

const ANAHTAR = "re_test_anahtar";
const cek = (yanit: Parameters<typeof sahte>[0], id = "e1", apiKey: string | undefined = ANAHTAR) => {
  const s = sahte(yanit);
  return fetchInboundBody(id, { apiKey, fetchImpl: s.f }).then((r) => ({ r, cagrilar: s.cagrilar }));
};

/* ── Mutlu yol ───────────────────────────────────────────────────────────── */
{
  const { r, cagrilar } = await cek({ status: 200, body: { data: { text: "Merhaba dünya" } } });
  check(r.ok && r.text === "Merhaba dünya", "düz metin gövde alınıyor");
  check(cagrilar[0].url === "https://api.resend.com/emails/receiving/e1", "doğru uç çağrılıyor");
  check(cagrilar[0].auth === `Bearer ${ANAHTAR}`, "anahtar Bearer olarak gönderiliyor");
}
{
  /* `data` sarmalayıcısı olmadan da okunabilmeli — biçim değişirse sessizce boş dönmeyelim. */
  const { r } = await cek({ status: 200, body: { text: "Düz" } });
  check(r.ok && r.text === "Düz", "sarmalayıcısız yanıt da okunuyor");
}

/* --- HTML'den düz metin ÇIKARILIYOR, html saklanmıyor -------------------- */
/*
 * Bugünün postalarının çoğu yalnız HTML gövdeli. Çıkarılan metin düz metin
 * olarak saklanıp düz metin olarak çiziliyor; hiçbir etiket yorumlanmıyor.
 */
{
  const { r } = await cek({
    status: 200,
    body: { data: { html: "<p>Merhaba</p><script>alert(1)</script><div>ikinci</div>" } },
  });
  check(r.ok && r.text === "Merhaba\nikinci", "html'den düz metin çıkarılıyor");
  check(r.ok && !r.text.includes("alert"), "betik içeriği metne girmiyor");
  check(r.ok && !r.text.includes("<"), "işaretleme kalmıyor");
}
{
  /* İkisi de varsa DÜZ METİN kazanıyor — dönüşümsüz olan her zaman daha sadık. */
  const { r } = await cek({ status: 200, body: { data: { text: "asıl", html: "<p>çeviri</p>" } } });
  check(r.ok && r.text === "asıl", "düz metin html'e tercih ediliyor");
}

/* --- Boyut sınırı -------------------------------------------------------- */
{
  const { r } = await cek({ status: 200, body: { data: { text: "x".repeat(MAX_TEXT + 500) } } });
  check(r.ok && r.text.length === MAX_TEXT, "aşırı uzun gövde kırpılıyor");
}

/* --- Gerçekten BOŞ posta bir BAŞARI -------------------------------------- */
/*
 * "Kişi boş posta atmış" ile "biz alamadık" ayrı şeyler. Boş yanıtı hata
 * saymak, ekranda sonsuza dek "yeniden denenecek" yazması demek olurdu.
 */
{
  const { r } = await cek({ status: 200, body: { data: {} } });
  check(r.ok && r.text === "", "boş gövde başarı sayılıyor");
}

/* ── BAŞARISIZLIK YOLLARI ────────────────────────────────────────────────── */

/* --- Yetki: tek çözümü olan durum, AYRI ---------------------------------- */
/*
 * "Hata" deyip geçmek kullanıcıyı ağ sorunu sanıp beklemeye iterdi; oysa
 * beklemekle geçmez, anahtarın izni değişmeli.
 */
for (const kod of [401, 403]) {
  const { r } = await cek({ status: kod });
  check(!r.ok && r.state === "yetki", `${kod} → yetki`);
}
{
  const { r } = await cek({ status: 404 });
  check(!r.ok && r.state === "bulunamadi", "404 → bulunamadi (saklama süresi dolmuş olabilir)");
}
for (const kod of [500, 502, 429]) {
  const { r } = await cek({ status: kod });
  check(!r.ok && r.state === "hata", `${kod} → hata (yeniden denenebilir)`);
}
{
  const { r } = await cek({ status: 200, atsin: true });
  check(!r.ok && r.state === "hata", "ağ kopması → hata");
}
{
  /* Gövde JSON değilse de çökmüyoruz. */
  const s = sahte({ status: 200 });
  const bozuk = async () => ({ ok: true, status: 200, json: async () => { throw new Error("json"); } });
  const r = await fetchInboundBody("e1", { apiKey: ANAHTAR, fetchImpl: bozuk as never });
  check(!r.ok && r.state === "hata", "bozuk JSON → hata");
  void s;
}

/* --- Anahtar yoksa AĞA HİÇ ÇIKILMIYOR ------------------------------------ */
/*
 * Yapılandırma eksikken istek atmak, her gelen postada boşuna bir dış çağrı
 * ve günlükte anlamsız bir hata demek; gerçek sebep o gürültüde kaybolurdu.
 */
for (const bos of [undefined, "", "   "]) {
  const s = sahte({ status: 200, body: { data: { text: "x" } } });
  const r = await fetchInboundBody("e1", { apiKey: bos, fetchImpl: s.f });
  check(!r.ok && r.state === "yapilandirilmamis", `anahtar "${String(bos)}" → yapılandırılmamış`);
  check(s.cagrilar.length === 0, `anahtar "${String(bos)}" iken ağa çıkılmıyor`);
}

/* --- Kimliksiz çağrı da ağa çıkmıyor ------------------------------------- */
{
  const s = sahte({ status: 200 });
  const r = await fetchInboundBody("   ", { apiKey: ANAHTAR, fetchImpl: s.f });
  check(!r.ok && r.state === "bulunamadi", "boş kimlik → bulunamadi");
  check(s.cagrilar.length === 0, "boş kimlikte ağa çıkılmıyor");
}

/* --- Kimlik URL'de KAÇIRILIYOR ------------------------------------------- */
/*
 * Kimlik sağlayıcıdan geliyor ama yine de kaçırılıyor: kaçırılmasaydı,
 * içinde `/` ya da `?` taşıyan bir değer istediği uca çağrı yaptırabilirdi.
 */
{
  const { cagrilar } = await cek({ status: 200, body: { data: {} } }, "a/../b?x=1");
  check(cagrilar[0].url.endsWith("/a%2F..%2Fb%3Fx%3D1"), "kimlik URL'de kaçırılıyor");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
