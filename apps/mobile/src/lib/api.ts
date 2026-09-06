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

/** Bearer jetonuyla JSON isteği. `token` verilirse Authorization eklenir. */
export async function apiFetch<T>(
  path: string,
  opts: { method?: string; body?: unknown; token?: string | null; treeId?: string } = {}
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.token) headers["Authorization"] = `Bearer ${opts.token}`;
  if (opts.treeId) headers["x-tree-id"] = opts.treeId;

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

export function createPerson(
  token: string,
  payload: Record<string, unknown>,
  relation?: { type: RelationType; targetId: string }
) {
  return apiFetch<{ id: string }>("/api/family/person", {
    method: "POST",
    token,
    body: relation ? { ...payload, relation } : payload,
  });
}

export function updatePerson(token: string, id: string, payload: Record<string, unknown>) {
  return apiFetch<{ id: string }>(`/api/family/person/${id}`, {
    method: "PUT",
    token,
    body: payload,
  });
}

export function deletePerson(token: string, id: string) {
  return apiFetch<{ success: boolean }>(`/api/family/person/${id}`, {
    method: "DELETE",
    token,
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
    const msg =
      (data && typeof data === "object" && "error" in data && (data as { error?: string }).error) ||
      `Yükleme hatası (${res.status})`;
    throw new ApiError(String(msg), res.status);
  }
  const url = (data as { url?: string } | null)?.url;
  if (!url) throw new ApiError("Yükleme yanıtı geçersiz.", 500);
  return url;
}
