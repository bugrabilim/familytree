import { API_BASE_URL } from "./config";

export interface ApiUser {
  id: string;
  name: string;
  role: string;
  treeName: string;
  isFounder: boolean;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/* ── Oturumu düşüren 401 ──────────────────────────────────────────────────── */

/**
 * Sunucu "bu jeton artık geçerli değil" dediğinde çağrılacak kanca.
 *
 * `AuthProvider` açılışta kendi `signOut`unu buraya bağlıyor. Modül düzeyinde
 * tek bir kanca, çünkü `apiFetch` bir React bileşeni değil ve bağlamı
 * göremiyor; her çağrı yerine ayrı 401 denetimi yazmak ise onu unutulacak
 * yirmi yer hâline getirirdi.
 *
 * ## Neden gerekiyor
 *
 * Korumalı yığın YALNIZ jeton yokken girişe atıyordu (`app/(app)/_layout.tsx`).
 * Sunucudan 401 gelince hiçbir şey olmuyordu: hesabını silen (`deletedAt`
 * damgası → `resolveActiveTree` 401) ya da ağaçtan çıkarılan kullanıcı ana
 * ekranda ortada kırmızı "Unauthorized" ve altında "Yeniden dene" görüyordu;
 * bastıkça aynı hata. Uygulama onu giriş ekranına HİÇ göndermiyordu, çıkış
 * yolunu Menü → Çıkış yap'tan kendi bulması gerekiyordu.
 */
type UnauthorizedHandler = (mesaj: string) => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(fn: UnauthorizedHandler | null): void {
  unauthorizedHandler = fn;
}

/**
 * 401'i oturum sonu sayıp kancayı çağırır — AMA yalnız jetonlu istekte.
 *
 * Girişin kendisi de 401 dönüyor ("Ağaç adı veya şifre hatalı"), o yüzden
 * ayrım şart: yanlış şifre yazan birinin oturumu "sona erdi" diye
 * temizlenseydi, giriş ekranında hiç var olmamış bir oturumun uyarısını
 * görürdü.
 */
function oturumDustu(status: number, tokenluMu: boolean): void {
  if (status !== 401 || !tokenluMu) return;
  unauthorizedHandler?.(
    "Oturumun sona erdi ya da bu ağaca erişimin kaldırıldı. Lütfen tekrar giriş yap."
  );
}

/* ── Aktif ağaç (çoklu ağaç) ─────────────────────────────────────────────── */

/**
 * Kurucunun o an baktığı ağacın kimliği.
 *
 * `resolveActiveTree` (sunucu) aktif ağacı `x-tree-id` başlığından ya da web
 * çerezinden okuyor. Mobil başlığı HİÇ göndermiyordu, yani birden çok ağacı
 * olan bir kurucu telefonda YALNIZ ana ağacını görebiliyordu — öbür ağaçları
 * kurmuş, veri girmiş ve telefonda hiçbirine ulaşamıyordu.
 *
 * Modül düzeyinde tek bir değer, `setUnauthorizedHandler` ile aynı gerekçe:
 * `apiFetch` bir React bileşeni değil ve bağlamı göremiyor; her çağrı yerine
 * ayrı ayrı geçirmek ise onu unutulacak yirmi yer hâline getirirdi.
 *
 * `null` "ana ağaç" demek ve başlık hiç gönderilmiyor — sunucudaki
 * varsayılanla aynı anlam.
 */
let aktifAgac: string | null = null;

export function setActiveTreeId(id: string | null): void {
  aktifAgac = id;
}

export function getActiveTreeId(): string | null {
  return aktifAgac;
}

/** Bearer jetonuyla JSON isteği. `token` verilirse Authorization eklenir. */
export async function apiFetch<T>(
  path: string,
  opts: {
    method?: string;
    body?: unknown;
    token?: string | null;
    treeId?: string;
    /**
     * Bu istek için ağaç kimliği. Verilmezse modüldeki aktif ağaç kullanılır;
     * çağıranların çoğu bunu bilmek zorunda kalmasın diye.
     */
    /**
     * İYİMSER KİLİT (madde 9) — ekrandaki verinin dayandığı sürüm damgası.
     *
     * Sunucu bu başlık YOKSA çakışma denetimi hiç yapmıyor
     * (`lib/blob.ts` → `versionMismatch`: `!!base && base !== current`).
     * Mobil hiç göndermediği için kilit mobilde tümüyle kapalıydı ve bayat
     * bir ekrandan kaydetmek, web'de yapılmış düzeltmeleri uyarısız geri
     * alıyordu — form bütün alanları gövdeye koyduğu için eski değerlerle
     * birlikte.
     */
    baseVersion?: string | null;
  } = {}
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.token) headers["Authorization"] = `Bearer ${opts.token}`;
  const agac = opts.treeId ?? aktifAgac;
  if (agac) headers["x-tree-id"] = agac;
  if (opts.baseVersion) headers["x-base-version"] = opts.baseVersion;

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError("Bağlantı kurulamadı. İnternetini kontrol et.", 0);
  }

  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    oturumDustu(res.status, !!opts.token);
    const msg = (data && typeof data === "object" && "error" in data && (data as { error?: string }).error) || `Hata (${res.status})`;
    throw new ApiError(String(msg), res.status);
  }
  return data as T;
}

function safeJson(t: string): unknown {
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

/* ── Kimlik uçları ── */
/**
 * Giriş. `username` boşsa KURUCU yolu (ağaç adı + şifre); doluysa sunucu
 * yalnız o üyeyi deniyor (madde 36 — üyenin kendi kullanıcı adı).
 */
export function loginRequest(familyName: string, password: string, username = "") {
  return apiFetch<{ token: string; user: ApiUser }>("/api/mobile/login", {
    method: "POST",
    body: { familyName, password, username },
  });
}

export function registerRequest(familyName: string, password: string) {
  return apiFetch<{ token: string; recoveryCode: string; user: ApiUser }>("/api/mobile/register", {
    method: "POST",
    body: { familyName, password },
  });
}

/* ── Yapay zekâ ── */
export function askAi(token: string, question: string, lang: "tr" | "en" = "tr") {
  return apiFetch<{ answer: string }>("/api/ai/chat", {
    method: "POST",
    token,
    body: { question, lang },
  });
}

/* ── Kişi CRUD ── */

/** İlişki bağı: yeni kişiyi hedefin ebeveyni/çocuğu/eşi/kardeşi olarak ekler. */
export type RelationType = "parent" | "child" | "spouse" | "sibling";

/**
 * `treeId` ÇAĞRI YERİNDEN verilebiliyor.
 *
 * Ekranlar vermiyor (modüldeki aktif ağaç zaten doğru), ama ÇEVRİMDIŞI
 * KUYRUK vermek ZORUNDA: kuyruktaki yazma saatler önce, belki başka bir
 * ağaca bakılırken yakalandı. Gönderim anında aktif ağaç değişmiş olabilir
 * ve modüldeki değere güvenmek, bir ağacın düzeltmesini öbür ağaca yazmak
 * olurdu (`src/lib/outbox.ts` → `kuyrukSuz`).
 */
export function createPerson(
  token: string,
  payload: Record<string, unknown>,
  relation?: { type: RelationType; targetId: string },
  baseVersion?: string | null,
  treeId?: string
) {
  return apiFetch<{ id: string }>("/api/family/person", {
    method: "POST",
    token,
    baseVersion,
    treeId,
    body: relation ? { ...payload, relation } : payload,
  });
}

export function updatePerson(
  token: string,
  id: string,
  payload: Record<string, unknown>,
  baseVersion?: string | null,
  treeId?: string
) {
  return apiFetch<{ id: string }>(`/api/family/person/${id}`, {
    method: "PUT",
    token,
    baseVersion,
    treeId,
    body: payload,
  });
}

export function deletePerson(
  token: string,
  id: string,
  baseVersion?: string | null,
  treeId?: string
) {
  return apiFetch<{ success: boolean }>(`/api/family/person/${id}`, {
    method: "DELETE",
    token,
    baseVersion,
    treeId,
  });
}

/* ── Değişiklik önerileri (üyenin yazma yolu) ─────────────────────────────── */

/**
 * ÜYE (`uye`) kişi uçlarından geçemiyor — orası `canEdit` istiyor ve 403
 * dönüyor. Onun yolu öneri kuyruğu: `POST /api/family/proposals` (`canPropose`).
 * Mobil bu ucu hiç bilmiyordu; sonuç, üyenin formu doldurup Kaydet'e basması
 * ve 403 yemesiydi.
 *
 * Sürüm damgası GÖNDERİLMİYOR ve bu bilinçli: öneri ağacı değiştirmiyor, bir
 * talebi kuyruğa yazıyor. Bayatlık denetimi ONAY anında yapılıyor
 * (`lib/proposals.ts` — her değişiklik `{from, to}` çifti olarak saklanıyor,
 * arada başkası aynı alanı değiştirdiyse onay reddediliyor). Buradan
 * `x-base-version` göndermek, ağacın herhangi bir yerindeki her değişiklikte
 * öneri yazmayı engellerdi.
 */
export interface ProposalResult {
  ok: boolean;
}

/** Var olan kaydın alanları için öneri. Sunucu değişmeyenleri kendi eliyor. */
export function proposeFields(
  token: string,
  personId: string,
  changes: Record<string, unknown>,
  treeId?: string
) {
  return apiFetch<ProposalResult>("/api/family/proposals", {
    method: "POST",
    token,
    treeId,
    body: { kind: "alan", personId, changes },
  });
}

/** Yeni kişi önerisi; bağ verilirse hedefe bağlanacak şekilde kuyruğa girer. */
export function proposeNewPerson(
  token: string,
  person: Record<string, unknown>,
  relation?: { type: RelationType; targetId: string },
  treeId?: string
) {
  return apiFetch<ProposalResult>("/api/family/proposals", {
    method: "POST",
    token,
    treeId,
    body: relation ? { kind: "ekleme", person, relation } : { kind: "ekleme", person },
  });
}

/** Kaydın silinmesi önerisi. */
export function proposeDelete(token: string, personId: string, treeId?: string) {
  return apiFetch<ProposalResult>("/api/family/proposals", {
    method: "POST",
    token,
    treeId,
    body: { kind: "silme", personId },
  });
}

/**
 * Fotoğraf yükleme — multipart/form-data (Cloudinary'ye). `uri` cihazdaki yerel
 * dosya yolu (kamera/galeri). Content-Type'ı FormData kendi belirler.
 */
export async function uploadPhoto(token: string, uri: string): Promise<string> {
  const name = uri.split("/").pop() || `photo-${Date.now()}.jpg`;
  const ext = name.split(".").pop()?.toLowerCase();
  const type = ext === "png" ? "image/png" : ext === "heic" ? "image/heic" : "image/jpeg";

  const form = new FormData();
  // React Native FormData dosya biçimi:
  form.append("file", { uri, name, type } as unknown as Blob);
  form.append("kind", "photo");

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
  } catch {
    throw new ApiError("Fotoğraf yüklenemedi. Bağlantıyı kontrol et.", 0);
  }
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    // Bu uç `apiFetch`ten geçmiyor (multipart), o yüzden 401 kancası burada da
    // elle çağrılıyor — yoksa oturum yalnız bu istekte sessizce ölürdü.
    oturumDustu(res.status, true);
    const msg =
      (data && typeof data === "object" && "error" in data && (data as { error?: string }).error) ||
      `Yükleme hatası (${res.status})`;
    throw new ApiError(String(msg), res.status);
  }
  const url = (data as { url?: string } | null)?.url;
  if (!url) throw new ApiError("Yükleme yanıtı geçersiz.", 500);
  return url;
}
