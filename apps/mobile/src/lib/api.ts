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
export function loginRequest(familyName: string, password: string) {
  return apiFetch<{ token: string; user: ApiUser }>("/api/mobile/login", {
    method: "POST",
    body: { familyName, password },
  });
}

export function registerRequest(familyName: string, password: string) {
  return apiFetch<{ token: string; recoveryCode: string; user: ApiUser }>("/api/mobile/register", {
    method: "POST",
    body: { familyName, password },
  });
}
