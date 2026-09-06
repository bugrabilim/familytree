import type { Association, Gender, LifeEvent, Memory, ParentLink, Person, Source } from "@/types/family";

export type RelationType = "parent" | "child" | "spouse" | "sibling" | "associate";

export const RELATION_LABELS: Record<RelationType, { title: string; verb: string }> = {
  parent: { title: "Ebeveyn ekle", verb: "ebeveyni" },
  child: { title: "Çocuk ekle", verb: "çocuğu" },
  spouse: { title: "Eş ekle", verb: "eşi" },
  sibling: { title: "Kardeş ekle", verb: "kardeşi" },
  associate: { title: "Yakın çevre ekle", verb: "yakını" },
};

export interface PersonPayload {
  firstName: string;
  lastName: string;
  gender: Gender;
  nickname?: string;
  patronymic?: string;
  /** Sülale / ocak — serbest metin. */
  lineage?: string;
  orientation?: string;
  birthDate?: string;
  officialBirthDate?: string;
  /** "HH:MM" (24 saat, yerel). */
  birthTime?: string;
  deathDate?: string;
  birthPlace?: string;
  birthCoords?: { lat: number; lng: number } | null;
  religion?: string;
  denomination?: string;
  language?: string;
  ethnicity?: string;
  nationality?: string;
  occupation?: string;
  education?: string;
  congenitalCondition?: string;
  healthCondition?: string;
  deathCause?: string;
  burialPlace?: string;
  /** null = konumu temizle; undefined = değiştirme; nesne = ayarla. */
  burialCoords?: { lat: number; lng: number } | null;
  photo?: string;
  photos?: string[];
  videos?: string[];
  documents?: string[];
  bio?: string;
  events?: LifeEvent[];
  sources?: Source[];
  memories?: Memory[];
  kind?: "uye" | "cevre";
  associations?: Association[];
  confidential?: boolean;
  /** "" = görünür, "bulanik" = kart durur kimlik gitmez, "gizli" = paylaşımda hiç yok. */
  publicVisibility?: "" | "bulanik" | "gizli";
  privateFields?: string[];
  parentIds?: string[];
  parentLinks?: Record<string, ParentLink>;
  spouseIds?: string[];
  formerSpouseIds?: string[];
  /** `associate` bağında yeni kişi çevre (aile-dışı yakın) olur; `assocType`
   *  bağ türünü (arkadas, komsu…) belirler, verilmezse `arkadas`. */
  relation?: { type: RelationType; targetId: string; assocType?: string };
}

/* Madde 9 — İyimser kilitleme (istemci tarafı).
   Workspace, sunucudan gelen güncel sürümü (`updatedAt`) buraya bildirir;
   her değiştirme isteği bu sürümü `x-base-version` başlığıyla taşır. Sunucu
   sürüm uyuşmazsa 409 döner ve `parseError` mesajı kullanıcıya gösterilir. */
let baseVersion: string | null = null;

export function setBaseVersion(version: string | null): void {
  baseVersion = version;
}

/**
 * Değiştirme isteklerinin ortak başlıkları.
 *
 * Dışa aktarılıyor çünkü TOPLU işlemler (`bulk-delete`, `merge`, `merge-all`)
 * kendi bileşenlerinden doğrudan `fetch` ediyor ve bu başlığı hiç
 * göndermiyordu — yani en yıkıcı işlemlerin eşzamanlılık koruması yoktu.
 * Tek kişilik düzenleme korunurken yirmi kişiyi silen işlemin korunmaması
 * ters bir öncelikti.
 */
export function mutationHeaders(json = true): Record<string, string> {
  const h: Record<string, string> = json ? { "Content-Type": "application/json" } : {};
  if (baseVersion) h["x-base-version"] = baseVersion;
  return h;
}

async function parseError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    return data?.error ?? fallback;
  } catch {
    return fallback;
  }
}

export async function createPerson(payload: PersonPayload): Promise<Person> {
  const res = await fetch("/api/family/person", {
    method: "POST",
    headers: mutationHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res, "Kişi eklenemedi."));
  return res.json();
}

export async function updatePerson(id: string, payload: PersonPayload): Promise<Person> {
  const res = await fetch(`/api/family/person/${id}`, {
    method: "PUT",
    headers: mutationHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res, "Kişi güncellenemedi."));
  return res.json();
}

export async function deletePerson(id: string): Promise<void> {
  const res = await fetch(`/api/family/person/${id}`, {
    method: "DELETE",
    headers: mutationHeaders(false),
  });
  if (!res.ok) throw new Error(await parseError(res, "Kişi silinemedi."));
}

/** Kardeş grubunun yeni sırasını (id listesi) sunucuya bildirir. */
export async function reorderSiblings(ids: string[]): Promise<void> {
  const res = await fetch("/api/family/reorder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) throw new Error(await parseError(res, "Sıra güncellenemedi."));
}

export async function uploadPhoto(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  if (!res.ok) throw new Error(await parseError(res, "Fotoğraf yüklenemedi."));
  const { url } = await res.json();
  return url;
}

export async function uploadCover(file: File): Promise<string> {
  // Aile Kitabı kapağı — kırpmasız (oranı korunur). Bkz. lib/cloudinary.ts.
  const fd = new FormData();
  fd.append("file", file);
  fd.append("kind", "cover");
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  if (!res.ok) throw new Error(await parseError(res, "Kapak yüklenemedi."));
  const { url } = await res.json();
  return url;
}

export async function uploadAudio(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("kind", "audio");
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  if (!res.ok) throw new Error(await parseError(res, "Ses yüklenemedi."));
  const { url } = await res.json();
  return url;
}

export async function uploadVideo(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("kind", "video");
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  if (!res.ok) throw new Error(await parseError(res, "Video yüklenemedi."));
  const { url } = await res.json();
  return url;
}

export async function uploadDocument(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("kind", "document");
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  if (!res.ok) throw new Error(await parseError(res, "Belge yüklenemedi."));
  const { url } = await res.json();
  return url;
}

/**
 * DEĞİŞİKLİK ÖNERİSİ (madde 35).
 *
 * Katkı verici, düzenleyemediği bir kaydı bu uçtan değiştirmeyi ÖNERİYOR.
 * Gövde yalnız alan → yeni değer eşlemesi taşıyor; önerinin dayandığı ESKİ
 * değeri sunucu kayıttan okuyor. İstemci yazabilseydi, onay anındaki
 * bayatlık denetimi (arada başkası aynı alanı değiştirdi mi?) kendi kendini
 * iptal ederdi.
 */
export async function proposeChanges(
  personId: string,
  changes: Record<string, unknown>,
  note?: string
): Promise<void> {
  const res = await fetch("/api/family/proposals", {
    method: "POST",
    headers: mutationHeaders(),
    body: JSON.stringify({ personId, changes, note }),
  });
  if (!res.ok) throw new Error(await parseError(res, "Öneri gönderilemedi."));
}

/* ── Yıkıcı işlemler: ağaç silme, geri getirme ve hesap silme ───────────────
 *
 * Silme KALICI DEĞİL: kayıt önce beklemeye alınır, `purgeAt` anında kalıcı
 * olarak yok edilir. Kalıcı yok edişi kullanıcı tetikleyemez; tetikleyebilseydi
 * bekleme süresi de anlamını yitirirdi.
 *
 * İki uç 207 döndürebiliyor: kayıt beklemeye alındı ama ona bağlı bazı veriler
 * (Blob nesneleri, Cloudinary varlıkları, Postgres aynası) işlenemedi. 207
 * `res.ok` olduğu için, alışıldık `if (!res.ok) throw` kalıbı onu SESSİZCE
 * tam başarı sayardı — kullanıcı "her şey halloldu" der, oysa verisinin bir
 * kısmı beklendiği yerde değildir. O yüzden sonuç bir birlik (union): çağıran
 * kısmi başarıyı görmezden GELEMEZ, `durum` alanını ayırmak zorunda.
 */
export type SilmeSonucu =
  | { durum: "tamam"; purgeAt?: string; deletedAt?: string }
  | { durum: "kismi"; failed: string[]; purgeAt?: string; deletedAt?: string };

async function silmeYaniti(res: Response, fallback: string): Promise<SilmeSonucu> {
  if (!res.ok) throw new Error(await parseError(res, fallback));
  const data = await res.json().catch(() => ({}));
  const purgeAt = typeof data?.purgeAt === "string" ? data.purgeAt : undefined;
  const deletedAt = typeof data?.deletedAt === "string" ? data.deletedAt : undefined;
  if (res.status === 207) {
    const failed = Array.isArray(data?.failed) ? (data.failed as string[]) : [];
    return { durum: "kismi", failed, purgeAt, deletedAt };
  }
  return { durum: "tamam", purgeAt, deletedAt };
}

/**
 * Ağacı beklemeye alır (30 gün sonra kalıcı silme). ANA ağaç silinemez —
 * sunucu reddediyor, arayüz de seçeneği hiç göstermiyor (bkz. TreeSwitcher):
 * gösterilip reddedilen bir düğme, sebebi anlaşılmayan bir hatadır.
 */
export async function deleteTree(
  treeId: string,
  fallback = "Ağaç silinemedi."
): Promise<SilmeSonucu> {
  const res = await fetch("/api/trees", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ treeId }),
  });
  return silmeYaniti(res, fallback);
}

/**
 * Beklemedeki ağacı geri getirir. Bekleme süresinin TEK anlamı bu: geri
 * getirme yolu olmasaydı elimizde yalnız gecikmeli bir silme kalırdı.
 */
export async function restoreTree(
  treeId: string,
  fallback = "Ağaç geri getirilemedi."
): Promise<void> {
  const res = await fetch("/api/trees/restore", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ treeId }),
  });
  if (!res.ok) throw new Error(await parseError(res, fallback));
}

/**
 * Hesabın tamamını beklemeye alır. `confirm` hesabın aile adıdır ve sunucuda
 * birebir karşılaştırılır; şifre AYRICA sorulur. İkisi birden isteniyor çünkü
 * açık kalmış bir oturumda tek tıkla hesap silmek — bekleme süresi dolunca
 * geri dönüşü olmayan — bir kazadır.
 */
export async function deleteAccount(
  password: string,
  confirm: string,
  fallback = "Hesap silinemedi."
): Promise<SilmeSonucu> {
  const res = await fetch("/api/account/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password, confirm }),
  });
  return silmeYaniti(res, fallback);
}

/**
 * Bekleme süresindeki hesabı geri getirir — OTURUMSUZ (giriş ekranından).
 *
 * Silinmiş hesapla giriş YAPILAMIYOR (`lib/credentials.ts`), o yüzden geri
 * almanın da oturumu olamaz: kullanıcı elinde yalnız aile adı ve şifresiyle
 * geliyor. Uç kimliği doğrudan şifreyle doğruluyor.
 */
export async function restoreAccount(
  familyName: string,
  password: string,
  fallback = "Hesap geri getirilemedi."
): Promise<SilmeSonucu> {
  const res = await fetch("/api/account/restore", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ familyName, password }),
  });
  return silmeYaniti(res, fallback);
}
