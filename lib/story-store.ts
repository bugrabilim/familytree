import { mutateStore } from "@/lib/store-mutate";
import "server-only";
import { put, list, get } from "@vercel/blob";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import {
  MAX_PENDING,
  MAX_PER_TOKEN,
  planSubmit,
  type Contribution,
  type StoryRequest,
  type SubmitError,
} from "@/lib/contribution";

/**
 * HİKÂYE TALEBİ DEPOSU (madde 49/50) — ağaç başına `stories-<treeId>.json`.
 *
 * ## KAPININ YERİ
 *
 * `lib/gathering-store.ts`teki ilkenin aynısı: girişsiz yazma TEK bir
 * işlevden geçiyor (`submitContribution`) ve o işlev jetonu KENDİ
 * doğruluyor. Çağıran rotaya "önce jetonu kontrol et" diye güvenmiyoruz —
 * bir yazma yolunun doğrulamayı atlaması, kimliksiz bir uçta doğrudan açık
 * kapı demek olurdu.
 *
 * ## Jetonun özeti saklanıyor, kendisi değil
 *
 * Gerekçe `lib/contribution.ts` başında: bağlantı bir kez iletildiğinde kimin
 * elinde olduğu bilinemez. Deponun okunması, açık duran bütün yazma
 * bağlantılarını ele geçirmeye yetmemeli.
 *
 * ## Onay kuyruğu neden burada
 *
 * Yanıt kişinin kaydına DOĞRUDAN yazılmıyor; burada bekliyor ve ağaç sahibi
 * onaylayınca `lib/contribution.ts` `applyApproval` ile `Memory`ye dönüyor.
 * Kuyruk, "bu bağlantı kimin elinde" belirsizliğini kaydın DIŞINDA tutuyor.
 */

/** Bir ağaçta aynı anda açık durabilecek talep sayısı. */
export const MAX_REQUESTS = 100;
/** Talebin varsayılan ömrü (gün). Süresiz bir yazma yüzeyi açık kapı demek. */
export const DEFAULT_DAYS = 30;

export interface StoryBox {
  requests: StoryRequest[];
  contributions: Contribution[];
  updatedAt: string;
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

function pathname(treeId: string) {
  return `stories-${treeId}.json`;
}

const empty = (): StoryBox => ({
  requests: [],
  contributions: [],
  updatedAt: new Date(0).toISOString(),
});

function normalizeBox(raw: Partial<StoryBox> | null): StoryBox {
  const istekler = Array.isArray(raw?.requests) ? raw!.requests : [];
  const katkilar = Array.isArray(raw?.contributions) ? raw!.contributions : [];
  return {
    /*
     * `tokenHash` ZORUNLU sayılıyor: özeti olmayan bozuk bir kayıt kalırsa
     * ve aşağıdaki karşılaştırma boş özeti eşleştirirse, kapı kendiliğinden
     * açılırdı (`gathering-store`taki boş jeton tuzağının aynısı).
     */
    requests: istekler.filter(
      (r): r is StoryRequest =>
        !!r && typeof r.id === "string" && typeof r.personId === "string" &&
        typeof r.question === "string" && typeof r.tokenHash === "string" && !!r.tokenHash
    ),
    contributions: katkilar.filter(
      (c): c is Contribution =>
        !!c && typeof c.id === "string" && typeof c.personId === "string" &&
        typeof c.text === "string" && typeof c.status === "string"
    ),
    updatedAt: typeof raw?.updatedAt === "string" ? raw.updatedAt : new Date(0).toISOString(),
  };
}

async function getBox(treeId: string): Promise<StoryBox> {
  const path = pathname(treeId);
  try {
    const direct = await get(path, { access: "private", useCache: false });
    if (direct && direct.statusCode === 200) {
      return normalizeBox((await new Response(direct.stream).json()) as Partial<StoryBox>);
    }
  } catch {
    /* (2)'ye düş */
  }
  try {
    const found = await list({ prefix: path, limit: 1 });
    const blob = found.blobs[0];
    if (!blob) return empty();
    const res = await fetch(blob.url, { cache: "no-store" });
    if (!res.ok) throw new Error(`hikâye talepleri okunamadı (HTTP ${res.status})`);
    return normalizeBox((await res.json()) as Partial<StoryBox>);
  } catch (e) {
    /*
     * OKUNAMAYAN dosya, BOŞ dosya DEĞİLDİR.
     *
     * Burada eskiden `empty()` dönülüyordu ve çağıran onun üstüne yazıyordu:
     * tek bir geçici indirme hatası, o ana kadarki BÜTÜN kayıtları siliyordu.
     * Üstelik sessizce — uç 200 dönüyor, kullanıcı listeyi boş görüyor ve
     * yeniden yazmaya başlıyor; ilk yazma da eski dosyanın üstüne biniyor.
     *
     * Dosya GERÇEKTEN yoksa (yukarıdaki `!blob`) boş sayılıyor — o doğru.
     * Ama "var ama okuyamadım" hata olarak yükseliyor: gürültülü bir arıza,
     * sessiz bir veri kaybından her zaman iyidir.
     */
    throw e;
  }
}

async function saveBox(treeId: string, box: StoryBox): Promise<void> {
  box.updatedAt = new Date().toISOString();
  await put(pathname(treeId), JSON.stringify(box), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

/** Düzenleyici görünümü — talepler ve kuyruk. */
export async function readStories(treeId: string): Promise<StoryBox> {
  return getBox(treeId);
}

/**
 * Yeni talep. HAM JETON yalnız burada dönüyor ve bir daha üretilemiyor:
 * bağlantıyı kaybeden ağaç sahibi yeni bir talep açar. Özeti saklamanın
 * bedeli bu ve bilerek ödeniyor.
 */
/**
 * Bu deponun oku→değiştir→yaz sarmalayıcısı (`lib/store-mutate.ts`).
 *
 * Buradaki en olası çakışma ANONİM KATKI: aynı soru bağlantısı bir aileye
 * toplu gidiyor ve birkaç kişinin aynı dakikada yanıt yazması beklenen
 * durum. Korumasızken sonuncusu öncekilerin hikâyesini siliyordu — ve
 * dışarıdan yazılmış bir aile hikâyesinin ikinci bir kopyası yok.
 */
function mutate<T>(treeId: string, degistir: (box: StoryBox) => { yaz: boolean; sonuc: T }): Promise<T> {
  return mutateStore(() => getBox(treeId), (b) => saveBox(treeId, b), degistir, "Hikâye");
}

export async function createRequest(
  treeId: string,
  input: { personId?: unknown; question?: unknown; sentTo?: unknown; days?: unknown }
): Promise<{ request: StoryRequest; token: string } | { error: "dolu" | "gecersiz" }> {
  const personId = typeof input.personId === "string" ? input.personId.trim() : "";
  const question = typeof input.question === "string" ? input.question.trim() : "";
  if (!personId || !question || question.length > 500) return { error: "gecersiz" };

  type Sonuc = { request: StoryRequest; token: string } | { error: "dolu" | "gecersiz" };
  return mutate<Sonuc>(treeId, (box) => {
  const acik = box.requests.filter((r) => !r.closed).length;
  if (acik >= MAX_REQUESTS) return { yaz: false, sonuc: { error: "dolu" } };

  const gun = typeof input.days === "number" && input.days > 0 && input.days <= 365
    ? Math.floor(input.days)
    : DEFAULT_DAYS;

  /*
   * Jeton TAHMİN EDİLEMEZ olmalı: kimlik doğrulaması olmadığı için jetonun
   * kendisi tek koruma. Kısa ya da sıralı bir değer kaba kuvvetle bulunabilir
   * ve bulan kişi ailenin kaydına yazabilirdi.
   */
  const token = randomBytes(24).toString("base64url");
  const now = new Date();
  const request: StoryRequest = {
    id: randomUUID(),
    personId,
    question,
    tokenHash: sha256(token),
    sentTo: typeof input.sentTo === "string" && input.sentTo.trim() ? input.sentTo.trim() : undefined,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + gun * 86_400_000).toISOString(),
  };
  box.requests.push(request);
  return { yaz: true, sonuc: { request, token } };
  });
}

/** Ağaç sahibi talebi elle kapatır — süreden bağımsız. */
/**
 * Silinen kişiler hakkındaki AÇIK talepleri kapatır — tek okuma, tek yazma.
 *
 * SİLMİYOR, kapatıyor. Talebe gelmiş katkılar dışarıdan yazılmış aile
 * hikâyeleri: geri getirilemezler ve kişinin ağaçtan çıkması onları
 * geçersiz kılmıyor. Kapatmanın yaptığı, hâlâ dolaşımda olan bağlantıya
 * yeni katkı gelmesini durdurmak — artık var olmayan biri hakkında soru
 * sormaya devam eden canlı bir uç bırakmamak.
 */
export async function closeRequestsOfPeople(
  treeId: string,
  personIds: readonly string[]
): Promise<number> {
  const gidenler = new Set(personIds);
  if (gidenler.size === 0) return 0;
  return mutate<number>(treeId, (box) => {
    let kapatilan = 0;
    for (const r of box.requests) {
      if (r.closed || !gidenler.has(r.personId)) continue;
      r.closed = true;
      kapatilan++;
    }
    return { yaz: kapatilan > 0, sonuc: kapatilan };
  });
}

export async function closeRequest(treeId: string, id: string): Promise<boolean> {
  return mutate<boolean>(treeId, (box) => {
    const r = box.requests.find((x) => x.id === id);
    if (!r || r.closed) return { yaz: false, sonuc: false };
    r.closed = true;
    return { yaz: true, sonuc: true };
  });
  return true;
}

/**
 * Jetondan talebi bulur. Sabit zamanlı ve BOŞ özet asla eşleşmiyor.
 *
 * Boş özet eşleşseydi, bozuk tek bir kayıt bütün ağaç için açık kapı olurdu.
 */
function eslesen(box: StoryBox, token: string): StoryRequest | null {
  const t = token.trim();
  if (!t) return null;
  const beklenen = Buffer.from(sha256(t), "utf8");
  let bulunan: StoryRequest | null = null;
  for (const r of box.requests) {
    if (!r.tokenHash) continue;
    const gelen = Buffer.from(r.tokenHash, "utf8");
    if (gelen.length !== beklenen.length) continue;
    if (timingSafeEqual(gelen, beklenen)) bulunan = r;
  }
  return bulunan;
}

/** Girişsiz OKUMA — sayfanın soruyu gösterebilmesi için. */
export async function findRequestByToken(
  treeId: string,
  token: string
): Promise<StoryRequest | null> {
  return eslesen(await getBox(treeId), token);
}

/**
 * GİRİŞSİZ YAZMA. Jeton doğrulaması burada, çağıranda değil.
 *
 * Kabul kararı saf katmanda (`planSubmit`): talep denetimi kotalardan ÖNCE,
 * yoksa geçersiz bir jetonla dövmek de kotayı tüketir ve gerçek akrabayı
 * kilitlerdi.
 */
export async function submitContribution(
  treeId: string,
  token: string,
  input: { authorName?: unknown; text?: unknown }
): Promise<{ ok: true } | { ok: false; error: SubmitError }> {
  type Sonuc = { ok: true } | { ok: false; error: SubmitError };
  return mutate<Sonuc>(treeId, (box) => {
  const request = eslesen(box, token);

  const bekleyen = box.contributions.filter((c) => c.status === "bekliyor");
  const plan = planSubmit(request, input, new Date(), {
    forToken: request ? box.contributions.filter((c) => c.requestId === request.id).length : 0,
    pendingInTree: bekleyen.length,
  });
  if (!plan.ok) return { yaz: false, sonuc: { ok: false, error: plan.error } };

  box.contributions.push({
    id: randomUUID(),
    personId: request!.personId,
    question: request!.question,
    authorName: plan.authorName,
    text: plan.text,
    at: new Date().toISOString(),
    status: "bekliyor",
    requestId: request!.id,
  });
  return { yaz: true, sonuc: { ok: true } };
  });
}

/**
 * Ağaç sahibinin kararı. Katkıyı DÖNDÜRÜYOR ki çağıran rota onay hâlinde
 * kişinin kaydına `applyApproval` ile yazabilsin — kayda yazma bu dosyanın
 * işi değil, kişi verisi başka bir blobda.
 *
 * Durum burada yazılıyor ve YALNIZ "bekliyor" iken: onay düğmesine iki kez
 * basmak ya da isteğin ağ katmanında yinelenmesi aynı hikâyeyi iki kez
 * eklememeli.
 */
/**
 * Katkıyı YALNIZ OKUR — durumunu değiştirmez.
 *
 * Onay yolu artık önce ağaca yazıp sonra damgalıyor (yanlış sıra bir aile
 * hikâyesini geri getirilemez biçimde kaybediyordu). O sıra için "karar
 * vermeden önce katkıyı görebilmek" gerekiyor; `decideContribution` ise
 * tanımı gereği kararı yazıp kaydediyor.
 */
export async function findContribution(treeId: string, id: string): Promise<Contribution | null> {
  const box = await getBox(treeId);
  return box.contributions.find((x) => x.id === id) ?? null;
}

export async function decideContribution(
  treeId: string,
  id: string,
  karar: "onayla" | "reddet"
): Promise<Contribution | null> {
  return mutate<Contribution | null>(treeId, (box) => {
    const c = box.contributions.find((x) => x.id === id);
    if (!c || c.status !== "bekliyor") return { yaz: false, sonuc: null };
    const onceki: Contribution = { ...c };
    c.status = karar === "onayla" ? "onaylandi" : "reddedildi";
    // Kopya "bekliyor" hâliyle dönüyor; `applyApproval` o durumu bekliyor.
    return { yaz: true, sonuc: onceki };
  });
}

/** Reddedilen ya da işlenmiş katkıyı kuyruktan siler (temizlik). */
export async function deleteContribution(treeId: string, id: string): Promise<boolean> {
  return mutate<boolean>(treeId, (box) => {
    const before = box.contributions.length;
    box.contributions = box.contributions.filter((c) => c.id !== id);
    if (box.contributions.length === before) return { yaz: false, sonuc: false };
    return { yaz: true, sonuc: true };
  });
}

export { MAX_PENDING, MAX_PER_TOKEN };
