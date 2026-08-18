import { NextRequest, NextResponse } from "next/server";
import { resolveActiveTree } from "@/lib/tree-context";
import { buildWikidataSearchUrl, parseWikidataSearch } from "@/lib/records";

export const dynamic = "force-dynamic";

/**
 * Tarihsel kayıt ipucu araması (Wikidata). Giriş yapmış kullanıcıya açık.
 * GET ?name=<ad>&lang=<tr|en> → { results: RecordHint[] }
 *
 * Sunucu tarafı çağrı: CORS yok, dış servise yalnız AD gider. Ağ hatası/zaman
 * aşımında boş liste döner (özellik "en iyi çaba" ipucudur).
 */
export async function GET(req: NextRequest) {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status });

  const name = (req.nextUrl.searchParams.get("name") ?? "").trim();
  const lang = req.nextUrl.searchParams.get("lang") === "en" ? "en" : "tr";
  if (name.length < 2) return NextResponse.json({ results: [] });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(buildWikidataSearchUrl(name, lang), {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "SoyAgaci/1.0 (family tree app)" },
    });
    if (!res.ok) return NextResponse.json({ results: [], error: `HTTP ${res.status}` });
    const json = await res.json();
    return NextResponse.json({ results: parseWikidataSearch(json) });
  } catch (e) {
    return NextResponse.json({ results: [], error: (e as Error).message });
  } finally {
    clearTimeout(timer);
  }
}
