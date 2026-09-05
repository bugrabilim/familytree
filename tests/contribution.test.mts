import {
  MAX_PENDING,
  MAX_PER_TOKEN,
  MAX_TEXT,
  applyApproval,
  planSubmit,
  publicRequest,
  toMemory,
  type Contribution,
  type StoryRequest,
} from "../lib/contribution.ts";
import type { Person } from "../types/family.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

const SIMDI = new Date("2026-09-05T20:00:00Z");
const TALEP: StoryRequest = {
  id: "r1",
  personId: "p1",
  question: "Babaannenin en çok yaptığı yemek neydi?",
  createdAt: "2026-09-01T00:00:00Z",
  expiresAt: "2026-09-30T00:00:00Z",
};
const SIFIR = { forToken: 0, pendingInTree: 0 };

/* ── Mutlu yol ───────────────────────────────────────────────────────────── */
{
  const r = planSubmit(TALEP, { authorName: "  Ayşe  ", text: "  Mantı yapardı.  " }, SIMDI, SIFIR);
  check(r.ok, "geçerli gönderim kabul ediliyor");
  check(r.ok && r.authorName === "Ayşe", "ad kırpılıyor");
  check(r.ok && r.text === "Mantı yapardı.", "metin kırpılıyor");
}

/* ── Talebin kendisi ─────────────────────────────────────────────────────── */
{
  const e = (t: StoryRequest | null, n = SIMDI) => {
    const r = planSubmit(t, { authorName: "A", text: "B" }, n, SIFIR);
    return r.ok ? "ok" : r.error;
  };
  check(e(null) === "talep-yok", "talep yoksa reddediliyor");
  check(e({ ...TALEP, closed: true }) === "kapali", "kapatılmış talep reddediliyor");
  check(e(TALEP, new Date("2026-10-01T00:00:00Z")) === "suresi-dolmus", "süresi dolmuş talep reddediliyor");
  /*
   * Tam sınırda REDDEDİLİYOR (`>=`). Bir saniyelik belirsizlikte güvenli
   * taraf "kapat" — bu bir YAZMA yüzeyi.
   */
  check(e(TALEP, new Date("2026-09-30T00:00:00Z")) === "suresi-dolmus", "tam sınırda kapalı");
  check(e(TALEP, new Date("2026-09-29T23:59:59Z")) === "ok", "sınırdan hemen önce açık");
}

/* ── İçerik ──────────────────────────────────────────────────────────────── */
{
  const e = (i: { authorName?: unknown; text?: unknown }) => {
    const r = planSubmit(TALEP, i, SIMDI, SIFIR);
    return r.ok ? "ok" : r.error;
  };
  check(e({ text: "B" }) === "ad-gerekli", "ad zorunlu");
  check(e({ authorName: "   ", text: "B" }) === "ad-gerekli", "boşluk ad sayılmıyor");
  check(e({ authorName: 42, text: "B" }) === "ad-gerekli", "sayı ad sayılmıyor");
  check(e({ authorName: "A" }) === "metin-gerekli", "metin zorunlu");
  check(e({ authorName: "A", text: "   " }) === "metin-gerekli", "boşluk metin sayılmıyor");
  check(e({ authorName: "A", text: "x".repeat(MAX_TEXT + 1) }) === "metin-uzun", "aşırı uzun metin reddediliyor");
  check(e({ authorName: "A", text: "x".repeat(MAX_TEXT) }) === "ok", "tam sınırdaki metin kabul");
  {
    // Aşırı uzun ad reddedilmiyor, KIRPILIYOR — yazan kişi cezalandırılmasın.
    const r = planSubmit(TALEP, { authorName: "a".repeat(500), text: "B" }, SIMDI, SIFIR);
    check(r.ok && r.authorName.length === 80, "uzun ad kırpılıyor, reddedilmiyor");
  }
}

/* ── KOTALAR — iki katman ────────────────────────────────────────────────── */
/*
 * Jeton kotası tek bir bağlantının sınırsız yazmasını, kuyruk tavanı da
 * birçok jetonun birleşip ağacın deposunu şişirmesini engelliyor. Biri
 * olmadan öbürü yetmez: yalnız jeton kotası varken yüz jeton hâlâ beş yüz
 * kayıt demek.
 */
{
  const e = (c: { forToken: number; pendingInTree: number }) => {
    const r = planSubmit(TALEP, { authorName: "A", text: "B" }, SIMDI, c);
    return r.ok ? "ok" : r.error;
  };
  check(e({ forToken: MAX_PER_TOKEN - 1, pendingInTree: 0 }) === "ok", "kota altında kabul");
  check(e({ forToken: MAX_PER_TOKEN, pendingInTree: 0 }) === "jeton-kotasi", "jeton kotası dolunca red");
  check(e({ forToken: 0, pendingInTree: MAX_PENDING }) === "kuyruk-dolu", "kuyruk dolunca red");
  check(e({ forToken: 0, pendingInTree: MAX_PENDING - 1 }) === "ok", "kuyruk sınırının altında kabul");
}

/* --- SIRA: geçersiz jeton kotayı TÜKETMEMELİ ---------------------------- */
/*
 * Kota önce denetlenseydi, kapalı/süresi dolmuş bir talebe yapılan yüzlerce
 * deneme de kotayı tüketir ve gerçek akraba yazamaz hâle gelirdi. Bu yüzden
 * talep denetimi kotadan ÖNCE.
 */
{
  const dolu = { forToken: MAX_PER_TOKEN, pendingInTree: MAX_PENDING };
  const r = planSubmit({ ...TALEP, closed: true }, { authorName: "A", text: "B" }, SIMDI, dolu);
  check(!r.ok && r.error === "kapali", "kapalı talepte önce 'kapali' deniyor, kota değil");
  const r2 = planSubmit(null, { authorName: "A", text: "B" }, SIMDI, dolu);
  check(!r2.ok && r2.error === "talep-yok", "talep yokken önce 'talep-yok'");
  // İçerik hatası da kotadan önce görülmeli.
  const r3 = planSubmit(TALEP, { authorName: "", text: "" }, SIMDI, dolu);
  check(!r3.ok && r3.error === "ad-gerekli", "içerik hatası kotadan önce");
}

/* ── Onay ────────────────────────────────────────────────────────────────── */

const KATKI: Contribution = {
  id: "c1",
  personId: "p1",
  question: "Ne yapardı?",
  authorName: "Ayşe",
  text: "Mantı yapardı.",
  at: "2026-09-05T20:00:00.000Z",
  status: "bekliyor",
  requestId: "r1",
};
const KISI: Person = {
  id: "p1", firstName: "Fatma", lastName: "Y", gender: "female", parentIds: [], spouseIds: [],
};

{
  const m = toMemory(KATKI, "m1");
  check(m.prompt === "Ne yapardı?", "soru anıya geçiyor");
  /*
   * ANLATANIN ADI METNE YAZILIYOR. `Memory`de ayrı bir kaynak alanı yok ve
   * eklemek `Person` şemasını bu özellik için genişletmek olurdu. Ama kaynak
   * kaybolamaz: adsız bir katkı, kayda giren KAYNAKSIZ bir iddia olurdu ve
   * bu depo kaynaksız iddia kabul etmiyor.
   */
  check(!!m.text?.includes("Mantı yapardı."), "metin korunuyor");
  check(!!m.text?.includes("Ayşe"), "anlatanın adı metinde");
  check(!!m.text?.includes("2026-09-05"), "tarih metinde");
}

{
  const p = applyApproval(KISI, KATKI, "m1");
  check(!!p, "bekleyen katkı onaylanabiliyor");
  check(p?.memories?.length === 1, "anı ekleniyor");
  check(p !== KISI, "özgün kişi nesnesi değişmiyor (kopya dönüyor)");
  check((KISI.memories ?? []).length === 0, "kaynak kişi kirlenmedi");
}
{
  // Var olan anılar korunuyor.
  const dolu: Person = { ...KISI, memories: [{ id: "eski" }] };
  const p = applyApproval(dolu, KATKI, "m1");
  check(p?.memories?.length === 2, "eski anı korunuyor");
  check(p?.memories?.[0]?.id === "eski", "eski anı başta");
}

/* --- ÇİFT ONAY aynı hikâyeyi iki kez EKLEMEZ ---------------------------- */
/*
 * Onay düğmesine iki kez basmak ya da aynı isteğin tekrarı (ağ yeniden
 * denemesi) aynı hikâyeyi iki kez eklememeli.
 */
for (const durum of ["onaylandi", "reddedildi"] as const) {
  check(applyApproval(KISI, { ...KATKI, status: durum }, "m1") === null,
    `zaten ${durum} katkı yeniden uygulanmıyor`);
}

/* --- Katkı BAŞKA kişiye uygulanamaz ------------------------------------- */
/*
 * `personId` eşleşmesi şart: bir katkının yanlış kişiye iliştirilmesi,
 * ailenin kaydına yanlış bir hikâye yazmak olurdu.
 */
check(applyApproval({ ...KISI, id: "baska" }, KATKI, "m1") === null,
  "başka kişiye uygulanmıyor");

/* ── Görünürlük: yanıtlayan ağacın içini GÖRMÜYOR ───────────────────────── */
/*
 * `lib/gathering.ts`teki `publicGathering` ile aynı ilke: bağlantıyı alan
 * kişi yalnız kendisine sorulan soruyu görmeli.
 */
{
  const g = publicRequest(TALEP, "Fatma Y") as Record<string, unknown>;
  check(g.question === TALEP.question, "soru taşınıyor");
  check(g.subjectName === "Fatma Y", "kimin hakkında olduğu taşınıyor");
  const anahtarlar = Object.keys(g);
  check(!anahtarlar.includes("id"), "talep kimliği taşınmıyor");
  check(!anahtarlar.includes("personId"), "kişi kimliği taşınmıyor");
  check(!anahtarlar.includes("expiresAt"), "son kullanma taşınmıyor");
  check(!anahtarlar.includes("sentTo"), "kime gönderildiği taşınmıyor");
  check(anahtarlar.length === 3, `yalnız üç alan (${anahtarlar.join(",")})`);
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
