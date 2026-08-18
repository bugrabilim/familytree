import "server-only";

/**
 * Google Gemini istemcisi (sunucu-taraflı). Ücretsiz kotalı; anahtar
 * `GEMINI_API_KEY` env ile verilir. Yoksa `isGeminiConfigured()` false döner ve
 * AI özellikleri kibarca kapalı kalır. Model `GEMINI_MODEL` ile değiştirilebilir
 * (varsayılan gemini-2.0-flash — hızlı/ucuz).
 */

export function isGeminiConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

function model(): string {
  return process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash";
}

/** Metin üretimi. Hata durumunda anlamlı bir Error fırlatır. */
export async function geminiGenerate(prompt: string, system?: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY yapılandırılmamış.");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model()}:generateContent?key=${encodeURIComponent(key)}`;
  const body = {
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 800 },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Gemini HTTP ${res.status}${txt ? `: ${txt.slice(0, 160)}` : ""}`);
  }
  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const parts = json.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts) ? parts.map((p) => p.text ?? "").join("") : "";
  if (!text.trim()) throw new Error("Gemini boş yanıt döndü.");
  return text.trim();
}
