"use client";

import { useState } from "react";
import Link from "next/link";
import type { DriftReport, TreeDrift } from "@/lib/drift";

/**
 * Kayma denetimi arayüzü. İki adım:
 *  1) Denetle (GET) — hiçbir şey yazmaz.
 *  2) Onar (POST) — Blob'u kaynak alır, Postgres'i hizaya getirir.
 *
 * Rapor bilerek "kaç kişi" demiyor, "ne ayrıştı" diyor: sayı eşitliği bu
 * aracın var olma nedeni olan tuzağın ta kendisi (bkz. `lib/drift.ts`).
 */

type Rapor = DriftReport & { note?: string; error?: string };
type Onarim = {
  ok?: boolean;
  error?: string;
  trees?: Array<Record<string, unknown>>;
};

const KIND_LABEL: Record<string, string> = {
  eksik: "Postgres'te yok",
  fazla: "Blob'da yok (silinmemiş)",
  farkli: "içerik ayrışmış",
};

function Rozet({ n, ad, ton }: { n: number; ad: string; ton: string }) {
  if (n === 0) return null;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${ton}`}>
      <b className="tabular-nums">{n}</b> {ad}
    </span>
  );
}

function AgacKarti({ t }: { t: TreeDrift & { error?: string } }) {
  const [acik, setAcik] = useState(false);
  const kayma = t.people.missing + t.people.extra + t.people.changed;

  return (
    <li className="rounded-xl border border-border bg-bg-elevated p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{t.name}</p>
          <p className="text-[11px] text-text-subtle tabular-nums">
            Blob {t.blobPeople} · Postgres {t.dbPeople}
            {/*
              Sayılar eşit ama ayrışma varsa bunu AÇIKÇA söylüyoruz: eski
              ölçünün ("sayılar eşit → eşitlenmiş") yanılttığı tam olarak
              bu durum.
            */}
            {t.countsEqual && kayma > 0 ? " · sayılar eşit ama içerik değil" : ""}
          </p>
        </div>
        <span className="shrink-0 text-sm">
          {t.error ? (
            <span className="text-danger" title={t.error}>✗ okunamadı</span>
          ) : !t.inDb ? (
            <span className="text-text-muted">göç edilmemiş</span>
          ) : t.clean ? (
            <span className="text-primary">✓ ayrışma yok</span>
          ) : (
            <span className="text-danger">✗ ayrışma var</span>
          )}
        </span>
      </div>

      {(kayma > 0 || t.columns.length > 0 || t.meta.length > 0 || t.duplicateIds.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Rozet n={t.people.missing} ad="eksik" ton="bg-danger/10 text-danger" />
          <Rozet n={t.people.extra} ad="fazla" ton="bg-danger/10 text-danger" />
          <Rozet n={t.people.changed} ad="ayrışmış" ton="bg-surface-2 text-text-muted" />
          <Rozet n={t.columns.length} ad="sütun kayması" ton="bg-surface-2 text-text-muted" />
          <Rozet n={t.meta.length} ad="ağaç bilgisi" ton="bg-surface-2 text-text-muted" />
          <Rozet n={t.duplicateIds.length} ad="çift kimlik" ton="bg-danger/10 text-danger" />
        </div>
      )}

      {t.people.items.length > 0 && (
        <>
          <button
            onClick={() => setAcik((v) => !v)}
            className="mt-2 text-[11px] text-accent hover:underline"
          >
            {acik ? "Ayrıntıyı gizle" : `Ayrıntı (${t.people.items.length})`}
          </button>
          {acik && (
            <ul className="mt-2 space-y-1.5">
              {t.people.items.map((it) => (
                <li key={`${it.id}-${it.kind}`} className="text-[11px] leading-snug">
                  <span className="text-text">{it.label ?? <i className="text-text-subtle">gizli kayıt</i>}</span>
                  <span className="text-text-subtle"> · {KIND_LABEL[it.kind] ?? it.kind}</span>
                  {it.fields && (
                    <span className="block text-text-muted font-mono">
                      {it.fields.map((f) => `${f.field}: ${f.blob} → ${f.db}`).join("  ·  ")}
                    </span>
                  )}
                </li>
              ))}
              {t.people.truncated > 0 && (
                <li className="text-[11px] text-text-subtle">
                  …ve {t.people.truncated} kayıt daha (tam liste için <code>?full=1</code>).
                </li>
              )}
            </ul>
          )}
        </>
      )}

      {t.columns.length > 0 && (
        <p className="mt-2 text-[11px] text-text-muted leading-snug">
          <b>Sütun kayması:</b>{" "}
          {t.columns.slice(0, 6).map((c) => `${c.column} (${c.row} → ${c.data})`).join(", ")}
          {t.columns.length > 6 ? ` …+${t.columns.length - 6}` : ""}
        </p>
      )}
    </li>
  );
}

export default function DriftClient() {
  const [loading, setLoading] = useState<"" | "check" | "repair">("");
  const [rapor, setRapor] = useState<Rapor | null>(null);
  const [onarim, setOnarim] = useState<Onarim | null>(null);

  const denetle = async () => {
    setLoading("check");
    setOnarim(null);
    try {
      const res = await fetch("/api/admin/drift", { cache: "no-store" });
      setRapor((await res.json()) as Rapor);
    } catch (e) {
      setRapor({ error: (e as Error).message } as Rapor);
    } finally {
      setLoading("");
    }
  };

  const onar = async () => {
    if (!window.confirm("Blob kaynak alınarak Postgres hizaya getirilecek. Blob'a dokunulmaz. Devam edilsin mi?"))
      return;
    setLoading("repair");
    try {
      const res = await fetch("/api/admin/drift", { method: "POST" });
      setOnarim((await res.json()) as Onarim);
      // Onarımdan sonra taze rapor — ekranda eski durum kalmasın.
      const tekrar = await fetch("/api/admin/drift", { cache: "no-store" });
      setRapor((await tekrar.json()) as Rapor);
    } catch (e) {
      setOnarim({ error: (e as Error).message });
    } finally {
      setLoading("");
    }
  };

  const trees = (rapor?.trees ?? []) as Array<TreeDrift & { error?: string }>;

  return (
    <main className="min-h-screen bg-bg text-text px-5 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between mb-1">
          <h1 className="font-serif text-2xl font-semibold">Kayma Denetimi</h1>
          <Link href="/tree" className="text-sm text-text-muted hover:text-text underline">
            ← Ağaca dön
          </Link>
        </div>
        <p className="text-sm text-text-muted mb-6 leading-relaxed">
          <b>Vercel Blob</b> ile <b>Supabase Postgres</b> hâlâ aynı mı? Göç aracı veriyi bir kez
          taşır; bu araç ayrışıp ayrışmadığını sürekli denetler. Kişi <i>sayısının</i> eşit olması
          yetmez — biri eklenip başkası silindiğinde sayı aynı kalır. Burada karşılaştırma kayıt
          kayıt, alan alan yapılır. <b>Denetle</b> hiçbir şey yazmaz; <b>Onar</b> Blob&apos;u kaynak
          alıp yalnız Postgres&apos;i düzeltir.
        </p>

        <div className="flex gap-2 mb-6">
          <button
            onClick={denetle}
            disabled={!!loading}
            className="h-10 px-4 rounded-lg border border-border bg-surface hover:bg-surface-2 text-sm font-medium disabled:opacity-50"
          >
            {loading === "check" ? "Denetleniyor…" : "Denetle"}
          </button>
          <button
            onClick={onar}
            disabled={!!loading || !rapor || rapor.clean}
            title={rapor?.clean ? "Ayrışma yok — onaracak bir şey yok." : undefined}
            className="h-10 px-4 rounded-lg bg-primary text-primary-text text-sm font-medium hover:brightness-110 disabled:opacity-50"
          >
            {loading === "repair" ? "Onarılıyor…" : "Onar"}
          </button>
          <Link
            href="/admin/migrate"
            className="h-10 px-4 rounded-lg border border-border bg-surface hover:bg-surface-2 text-sm font-medium inline-flex items-center"
          >
            Göç aracı
          </Link>
        </div>

        {rapor?.error && <p className="text-sm text-danger mb-4">Hata: {rapor.error}</p>}

        {rapor && !rapor.error && (
          <>
            <div
              className={`rounded-xl border p-3 mb-4 text-sm ${
                rapor.clean ? "border-primary/40 bg-primary/5" : "border-danger/40 bg-danger/5"
              }`}
            >
              <p className="font-medium">
                {rapor.clean ? "✓ İki kaynak ayrışmamış." : "✗ Ayrışma var."}
              </p>
              <p className="text-[11px] text-text-muted tabular-nums mt-0.5">
                {rapor.totals.same} aynı · {rapor.totals.missing} eksik · {rapor.totals.extra} fazla ·{" "}
                {rapor.totals.changed} ayrışmış · {rapor.totals.columns} sütun kayması
              </p>
            </div>

            <ul className="space-y-3">
              {trees.map((t) => (
                <AgacKarti key={t.treeId} t={t} />
              ))}
            </ul>
          </>
        )}

        {onarim && (
          <div className="mt-5 rounded-xl border border-border bg-bg-elevated p-4 text-sm">
            <p className="font-medium mb-2">
              {onarim.error ? "Onarım hatası" : onarim.ok ? "✅ Onarıldı" : "⚠️ Onarım kısmen başarısız"}
            </p>
            {onarim.error ? (
              <p className="text-danger">{onarim.error}</p>
            ) : (
              <ul className="space-y-1 text-[11px] text-text-muted">
                {(onarim.trees ?? []).map((t, i) => (
                  <li key={i}>
                    <b className="text-text">{String(t.tree)}</b>{" "}
                    {t.skipped
                      ? String(t.skipped)
                      : `${t.upserted ?? 0} yazıldı, ${t.deleted ?? 0} silindi` +
                        (t.clean ? " — temiz" : ` — ${t.remaining ?? "?"} kayma kaldı`)}
                    {t.error ? ` — ${String(t.error)}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
