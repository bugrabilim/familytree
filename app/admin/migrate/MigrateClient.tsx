"use client";

import { useState } from "react";
import Link from "next/link";

type Result = { ok?: boolean; dryRun?: boolean; error?: string } & Record<string, unknown>;

/** `authUser` alanını (önizlemede boolean|null, göçte metin) okunur etikete çevirir. */
function authUserLabel(kind: "preview" | "migrate" | "", v: unknown) {
  if (kind === "preview") {
    if (v === true) return <span className="text-primary">✓ Auth&apos;a taşınmış</span>;
    if (v === false) return <span className="text-text-muted">henüz taşınmadı (Göçü başlat)</span>;
    return <span className="text-text-subtle">belirsiz</span>;
  }
  if (v === "created") return <span className="text-primary">✓ Auth&apos;a aktarıldı</span>;
  if (v === "exists") return <span className="text-primary">✓ zaten Auth&apos;ta</span>;
  if (v === "skipped" || v === "atlandı") return <span className="text-text-muted">atlandı</span>;
  return <span className="text-danger">{String(v ?? "—")}</span>;
}

/**
 * Blob → Postgres göç aracının istemci arayüzü. İki adım:
 *  1) Önizle (GET /api/admin/migrate) — hiçbir şey yazmaz, sayıları gösterir.
 *  2) Göçü başlat (POST) — veriyi Postgres'e kopyalar; Blob'a dokunmaz.
 */
export default function MigrateClient() {
  const [loading, setLoading] = useState<"" | "preview" | "migrate">("");
  const [result, setResult] = useState<Result | null>(null);
  const [kind, setKind] = useState<"preview" | "migrate" | "">("");

  const run = async (method: "GET" | "POST") => {
    const which = method === "GET" ? "preview" : "migrate";
    if (method === "POST" && !window.confirm("Blob'daki veri Postgres'e kopyalanacak. Devam edilsin mi?")) return;
    setLoading(which);
    setResult(null);
    try {
      const res = await fetch("/api/admin/migrate", { method });
      const data = await res.json();
      setResult(data);
      setKind(which);
    } catch (e) {
      setResult({ error: (e as Error).message });
      setKind(which);
    } finally {
      setLoading("");
    }
  };

  const trees = Array.isArray(result?.trees) ? (result!.trees as Array<Record<string, unknown>>) : [];

  return (
    <main className="min-h-screen bg-bg text-text px-5 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between mb-1">
          <h1 className="font-serif text-2xl font-semibold">Veri Göçü — Faz 2</h1>
          <Link href="/tree" className="text-sm text-text-muted hover:text-text underline">
            ← Ağaca dön
          </Link>
        </div>
        <p className="text-sm text-text-muted mb-6 leading-relaxed">
          Mevcut veriyi <b>Vercel Blob</b>&apos;dan <b>Supabase Postgres</b>&apos;e kopyalar. Blob&apos;a
          dokunulmaz (kaynak doğruluğu hâlâ Blob&apos;da), uygulama kesintisiz çalışmaya devam eder.
          Önce <b>Önizle</b>, sonra <b>Göçü başlat</b>. Tekrar çalıştırmak güvenlidir (idempotent).
        </p>
        <p className="text-sm text-text-muted mb-6 leading-relaxed">
          Buradaki sayılar yalnız <b>kaç kişi</b> olduğunu söyler; iki kaynağın <i>içeriğinin</i> de
          aynı olduğunu göstermez. Onun için{" "}
          <Link href="/admin/drift" className="text-accent underline">kayma denetimi</Link> var.
        </p>

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => run("GET")}
            disabled={!!loading}
            className="h-10 px-4 rounded-lg border border-border bg-surface hover:bg-surface-2 text-sm font-medium disabled:opacity-50"
          >
            {loading === "preview" ? "Önizleniyor…" : "Önizle"}
          </button>
          <button
            onClick={() => run("POST")}
            disabled={!!loading}
            className="h-10 px-4 rounded-lg bg-primary text-primary-text text-sm font-medium hover:brightness-110 disabled:opacity-50"
          >
            {loading === "migrate" ? "Taşınıyor…" : "Göçü başlat"}
          </button>
        </div>

        {result && (
          <div className="rounded-xl border border-border bg-bg-elevated p-4">
            {result.error ? (
              <p className="text-sm text-danger">Hata: {String(result.error)}</p>
            ) : (
              <>
                <p className="text-sm font-medium mb-3">
                  {kind === "preview" ? "Önizleme (yazılmadı)" : result.ok ? "✅ Göç tamamlandı" : "⚠️ Göç kısmen başarısız"}
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-text-subtle border-b border-border">
                        <th className="py-1.5 pr-3 font-medium">Ağaç</th>
                        <th className="py-1.5 px-2 font-medium tabular-nums">Kişi (Blob)</th>
                        {kind === "preview" && (
                          <th className="py-1.5 px-2 font-medium tabular-nums">Postgres</th>
                        )}
                        <th className="py-1.5 px-2 font-medium tabular-nums">Üye</th>
                        <th className="py-1.5 px-2 font-medium tabular-nums">Davet</th>
                        <th className="py-1.5 pl-2 font-medium">Sayı</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trees.map((t, i) => (
                        <tr key={i} className="border-b border-border/60 last:border-0">
                          <td className="py-1.5 pr-3">
                            {String(t.tree)} {t.home ? <span className="text-[10px] text-text-subtle">(ana)</span> : null}
                          </td>
                          <td className="py-1.5 px-2 tabular-nums">{String(t.people ?? "—")}</td>
                          {kind === "preview" && (
                            <td className="py-1.5 px-2 tabular-nums">
                              {t.postgresPeople == null ? "—" : String(t.postgresPeople)}
                            </td>
                          )}
                          <td className="py-1.5 px-2 tabular-nums">{String(t.members ?? "—")}</td>
                          <td className="py-1.5 px-2 tabular-nums">{String(t.invites ?? "—")}</td>
                          <td className="py-1.5 pl-2">
                            {kind === "preview" ? (
                              /*
                                "eşitlenmiş" DEMİYORUZ. Bu yalnız bir SAYI
                                karşılaştırması: bir kişi eklenip başkası
                                silindiğinde sayı aynı kalır, içerik ayrışır.
                                Gerçek yanıt kayma denetiminde (/admin/drift).
                              */
                              t.inSync ? (
                                <span className="text-text-muted">sayılar eşit</span>
                              ) : (
                                <span className="text-danger">✗ sayılar farklı</span>
                              )
                            ) : t.ok ? (
                              <span className="text-primary">✓ {String(t.verifiedPeople)} doğrulandı</span>
                            ) : (
                              <span className="text-danger" title={String(t.error ?? "")}>✗ hata</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Faz 3b — hesabın Supabase Auth durumu (giriş bundan etkilenmez). */}
                <div className="mt-3 pt-3 border-t border-border/60 text-sm">
                  <span className="text-text-subtle">Supabase Auth hesabı: </span>
                  {authUserLabel(kind, result.authUser)}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
