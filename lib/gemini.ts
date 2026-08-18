import "server-only";

/**
 * Google Gemini istemcisi (sunucu-taraflı). Ücretsiz kotalı; anahtar
 * `GEMINI_API_KEY` env ile verilir. Yoksa `isGeminiConfigured()` false döner ve
 * AI özellikleri kibarca kapalı kalır. Model `GEMINI_MODEL` ile değiştirilebilir
 * (varsayılan gemini-3.6-flash — hızlı/ucuz).
 */

export function isGeminiConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

function model(): string {
  return process.env.GEMINI_MODEL?.trim() || "gemini-3.6-flash";
}

/** Gemini `parts` — metin ya da satır-içi ikili veri (görsel/PDF). */
export type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

/**
 * Çok-parçalı (multimodal) üretim: metin + dosya(lar). Görsel/PDF `inlineData`
 * (base64) olarak gönderilir. `generateContent`'e tek istek. Uzun çıkarımlar
 * için daha yüksek token sınırı ve daha uzun zaman aşımı.
 */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function geminiGenerateParts(
  parts: GeminiPart[],
  system?: string,
  opts?: { temperature?: number; maxOutputTokens?: number; timeoutMs?: number; retries?: number }
): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY yapılandırılmamış.");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model()}:generateContent?key=${encodeURIComponent(key)}`;
  const body = {
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature: opts?.temperature ?? 0.7,
      maxOutputTokens: opts?.maxOutputTokens ?? 800,
    },
  };
  const timeoutMs = opts?.timeoutMs ?? 25000;
  const retries = opts?.retries ?? 1; // toplam deneme = retries + 1

  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(800 * attempt * attempt); // 0.8s, 3.2s… geri çekilme
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) {
        const json = (await res.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const out = json.candidates?.[0]?.content?.parts;
        const text = Array.isArray(out) ? out.map((p) => p.text ?? "").join("") : "";
        if (!text.trim()) throw new Error("Gemini boş yanıt döndü.");
        return text.trim();
      }
      // Geçici yük/hız hataları (429/503/500) → yeniden dene; diğerleri kalıcı.
      const txt = await res.text().catch(() => "");
      const err = new Error(`Gemini HTTP ${res.status}${txt ? `: ${txt.slice(0, 160)}` : ""}`);
      if (![429, 500, 503].includes(res.status)) throw err;
      lastErr = err;
    } catch (e) {
      // Zaman aşımı (AbortError) da yeniden denenebilir
      lastErr = e as Error;
      const name = (e as Error).name;
      if (name !== "TimeoutError" && name !== "AbortError" && !/HTTP (429|500|503)/.test(lastErr.message)) {
        throw lastErr;
      }
    }
  }
  throw lastErr ?? new Error("Gemini hatası.");
}

/** Metin üretimi. Hata durumunda anlamlı bir Error fırlatır. */
export async function geminiGenerate(prompt: string, system?: string): Promise<string> {
  return geminiGenerateParts([{ text: prompt }], system);
}
