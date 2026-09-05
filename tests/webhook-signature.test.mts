import { createHmac } from "node:crypto";
import {
  TOLERANCE_SECONDS,
  expectedSignature,
  readHeaders,
  secretKey,
  verifyWebhook,
} from "../lib/webhook-signature.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

const SIR = "whsec_" + Buffer.from("cok-gizli-anahtar").toString("base64");
const GOVDE = JSON.stringify({ type: "email.received", data: { subject: "Merhaba" } });
const ID = "msg_123";
const SIMDI = new Date("2026-09-05T22:00:00Z");
const TS = String(Math.floor(SIMDI.getTime() / 1000));

const imzala = (id: string, ts: string, body: string, sir = SIR) =>
  `v1,${expectedSignature(sir, id, ts, body)}`;

const dogrula = (h: Record<string, string | null | undefined>, body = GOVDE, now = SIMDI, sir: string | undefined = SIR) => {
  const r = verifyWebhook(sir, { id: h.id, timestamp: h.timestamp, signature: h.signature }, body, now);
  return r.ok ? "ok" : r.error;
};

/* ── Mutlu yol ───────────────────────────────────────────────────────────── */
check(dogrula({ id: ID, timestamp: TS, signature: imzala(ID, TS, GOVDE) }) === "ok",
  "geçerli imza kabul ediliyor");

/* --- `whsec_` öneki ------------------------------------------------------ */
{
  const onsuz = SIR.slice(6);
  check(secretKey(SIR).equals(secretKey(onsuz)), "önekli ve öneksiz sır aynı anahtarı veriyor");
  check(dogrula({ id: ID, timestamp: TS, signature: `v1,${expectedSignature(onsuz, ID, TS, GOVDE)}` }) === "ok",
    "öneksiz sırla üretilen imza da geçiyor");
}

/* ── YAPILANDIRMA EKSİKSE KAPALI ─────────────────────────────────────────── */
/*
 * Bu depoda bir kez "sır yoksa denetimi atla" yazılmıştı (`CRON_SECRET`) ve
 * sonuç, herkesin bütün hesaplara posta gönderten günlük işi tetikleyebilmesi
 * oldu. Kural artık tek: yapılandırma eksikse KAPALI düşülür.
 */
/*
 * `dogrula` yardımcısının VARSAYILAN parametresi olduğu için burada doğrudan
 * `verifyWebhook` çağrılıyor: `undefined` geçmek varsayılanı devreye sokuyor
 * ve test, sırrı OLAN bir çağrıyı sırsız sanarak boşuna geçiyordu.
 */
for (const bos of [undefined, "", "   "] as const) {
  const r = verifyWebhook(bos, { id: ID, timestamp: TS, signature: imzala(ID, TS, GOVDE) }, GOVDE, SIMDI);
  check(!r.ok && r.error === "yapilandirilmamis", `sır "${String(bos)}" iken doğrulama KAPALI`);
}

/* ── Eksik başlık ────────────────────────────────────────────────────────── */
{
  const s = imzala(ID, TS, GOVDE);
  check(dogrula({ timestamp: TS, signature: s }) === "baslik-eksik", "id yoksa red");
  check(dogrula({ id: ID, signature: s }) === "baslik-eksik", "zaman damgası yoksa red");
  check(dogrula({ id: ID, timestamp: TS }) === "baslik-eksik", "imza yoksa red");
  check(dogrula({ id: "", timestamp: TS, signature: s }) === "baslik-eksik", "boş id red");
  check(dogrula({ id: ID, timestamp: TS, signature: "   " }) === "baslik-eksik", "boşluk imza red");
}

/* ── GÖVDE DEĞİŞİRSE imza tutmuyor ──────────────────────────────────────── */
/*
 * İmzanın var olma sebebi bu: gövdeyi değiştiren biri (sahte gönderen, sahte
 * içerik) imzayı yeniden üretemez.
 */
{
  const s = imzala(ID, TS, GOVDE);
  const sahte = JSON.stringify({ type: "email.received", data: { subject: "Sahte" } });
  check(dogrula({ id: ID, timestamp: TS, signature: s }, sahte) === "imza-uymuyor", "değiştirilmiş gövde red");
  check(dogrula({ id: ID, timestamp: TS, signature: s }, GOVDE + " ") === "imza-uymuyor", "tek boşluk bile red");
}

/* --- İD ya da ZAMAN oynanırsa da tutmuyor -------------------------------- */
/*
 * İkisi de imzalanan metnin içinde. Olmasalardı, bir isteğin imzası başka bir
 * id/zaman ile yeniden kullanılabilirdi.
 */
{
  const s = imzala(ID, TS, GOVDE);
  check(dogrula({ id: "msg_baska", timestamp: TS, signature: s }) === "imza-uymuyor", "başka id ile red");
  const yakinTs = String(Number(TS) - 10);
  check(dogrula({ id: ID, timestamp: yakinTs, signature: s }) === "imza-uymuyor", "başka zaman damgası ile red");
}

/* --- Başka sırla imzalanmış istek ---------------------------------------- */
{
  const baska = "whsec_" + Buffer.from("baska-anahtar").toString("base64");
  check(dogrula({ id: ID, timestamp: TS, signature: imzala(ID, TS, GOVDE, baska) }) === "imza-uymuyor",
    "başka sırla imzalanan red");
}

/* ── ZAMAN PENCERESİ — tekrar oynatmaya karşı ───────────────────────────── */
{
  const eskiTs = String(Math.floor(SIMDI.getTime() / 1000) - TOLERANCE_SECONDS - 1);
  check(dogrula({ id: ID, timestamp: eskiTs, signature: imzala(ID, eskiTs, GOVDE) }) === "zaman-disi",
    "pencerenin dışındaki ESKİ istek red");
  const ileriTs = String(Math.floor(SIMDI.getTime() / 1000) + TOLERANCE_SECONDS + 1);
  check(dogrula({ id: ID, timestamp: ileriTs, signature: imzala(ID, ileriTs, GOVDE) }) === "zaman-disi",
    "pencerenin dışındaki İLERİ istek red (saat kayması suistimal edilmesin)");
  const sinir = String(Math.floor(SIMDI.getTime() / 1000) - TOLERANCE_SECONDS);
  check(dogrula({ id: ID, timestamp: sinir, signature: imzala(ID, sinir, GOVDE) }) === "ok",
    "tam sınırdaki istek kabul");
  check(dogrula({ id: ID, timestamp: "abc", signature: imzala(ID, "abc", GOVDE) }) === "zaman-gecersiz",
    "sayı olmayan zaman damgası red");
  check(dogrula({ id: ID, timestamp: "NaN", signature: imzala(ID, "NaN", GOVDE) }) === "zaman-gecersiz",
    "\"NaN\" metni de red");
}

/* ── ÇOK İMZALI başlık — anahtar döndürme ───────────────────────────────── */
/*
 * Sağlayıcı anahtar döndürürken bir süre eski ve yeni imzayı BİRLİKTE
 * gönderiyor. Yalnız ilkine bakmak, döndürme anında her isteği reddetmek
 * olurdu — ve bu, sessizce gelen postayı kaybetmek demek.
 */
{
  const dogru = expectedSignature(SIR, ID, TS, GOVDE);
  check(dogrula({ id: ID, timestamp: TS, signature: `v1,eskimis v1,${dogru}` }) === "ok",
    "ikinci imza doğruysa kabul");
  check(dogrula({ id: ID, timestamp: TS, signature: `v1,${dogru} v1,eskimis` }) === "ok",
    "ilk imza doğruysa kabul");
  check(dogrula({ id: ID, timestamp: TS, signature: "v1,yanlis1 v1,yanlis2" }) === "imza-uymuyor",
    "hiçbiri doğru değilse red");
  /* Bilinmeyen sürüm sessizce ATLANMALI, kabul edilmemeli. */
  check(dogrula({ id: ID, timestamp: TS, signature: `v2,${dogru}` }) === "imza-uymuyor",
    "bilinmeyen sürüm etiketi kabul edilmiyor");
  check(dogrula({ id: ID, timestamp: TS, signature: dogru }) === "imza-uymuyor",
    "sürüm etiketsiz ham imza kabul edilmiyor");
}

/* --- İmza gerçekten HMAC-SHA256 / base64 -------------------------------- */
{
  const elle = createHmac("sha256", Buffer.from("cok-gizli-anahtar", "utf8"))
    .update(`${ID}.${TS}.${GOVDE}`)
    .digest("base64");
  check(expectedSignature(SIR, ID, TS, GOVDE) === elle, "imza `${id}.${ts}.${gövde}` üstünden HMAC-SHA256");
}

/* ── BAŞLIK ADLARI: iki yazım da okunmalı ───────────────────────────────── */
/*
 * Bu iddia GERÇEK BİR ARIZADAN doğdu. Yalnız `svix-*` okunuyordu; Resend ise
 * standartlaşmış `webhook-*` adlarını gönderiyor. Üç başlık da `null`
 * okunuyor, doğrulama "başlık eksik" deyip 401 dönüyor ve gelen kutusu
 * sessizce boş kalıyordu. Dışarıdan görünen tek şey "kutu boş"tu.
 */
{
  const sahte = (h: Record<string, string>) => ({ get: (n: string) => h[n] ?? null });

  const eski = readHeaders(sahte({ "svix-id": "a", "svix-timestamp": "1", "svix-signature": "v1,x" }));
  check(eski.id === "a" && eski.timestamp === "1" && eski.signature === "v1,x", "svix-* okunuyor");

  const standart = readHeaders(
    sahte({ "webhook-id": "b", "webhook-timestamp": "2", "webhook-signature": "v1,y" })
  );
  check(standart.id === "b" && standart.timestamp === "2" && standart.signature === "v1,y",
    "webhook-* okunuyor (Resend bunu gönderiyor)");

  /* İkisi birden gelirse eski ad kazanıyor — kararlı davranış. */
  const ikisi = readHeaders(
    sahte({ "svix-id": "a", "webhook-id": "b", "svix-timestamp": "1", "webhook-timestamp": "2",
            "svix-signature": "v1,x", "webhook-signature": "v1,y" })
  );
  check(ikisi.id === "a" && ikisi.signature === "v1,x", "ikisi birden gelirse svix-* kazanıyor");

  const yok = readHeaders(sahte({}));
  check(yok.id === null && yok.timestamp === null && yok.signature === null, "hiçbiri yoksa null");

  /* Uçtan uca: yalnız webhook-* taşıyan bir istek DOĞRULANMALI. */
  const b = readHeaders(sahte({
    "webhook-id": ID, "webhook-timestamp": TS, "webhook-signature": imzala(ID, TS, GOVDE),
  }));
  const r = verifyWebhook(SIR, b, GOVDE, SIMDI);
  check(r.ok, "yalnız webhook-* taşıyan istek doğrulanıyor");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
