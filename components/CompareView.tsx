"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { mutationHeaders } from "@/lib/actions";

export interface MatchRow {
  reason: "yearMatch" | "sharedParent" | "sharedSpouse";
  mine: { id: string; name: string; span: string };
  peer: { id: string; name: string; span: string };
}

/**
 * Bağlı iki ağacın kesişimleri (P2). Olası ortak kişileri yan yana gösterir;
 * kişiye tıklanınca ilgili ağaçta açılır. (P3/P4 eylemleri sonraki fazlarda
 * bu görünüme eklenecek.)
 */
export default function CompareView({
  peerTreeId,
  peerName,
  rows,
  mineCount,
  peerCount,
}: {
  peerTreeId: string;
  peerName: string;
  rows: MatchRow[];
  mineCount: number;
  peerCount: number;
}) {
  const t = useT();
  const router = useRouter();
  const [status, setStatus] = useState<Record<string, "busy" | { added: number; linked: number } | string>>({});

  const [fullBusy, setFullBusy] = useState(false);
  const [fullDone, setFullDone] = useState<{ added: number; linked: number } | string | null>(null);

  const mergeAll = async () => {
    if (!window.confirm(t("compare.mergeAllConfirm", { peer: peerName }))) return;
    setFullBusy(true);
    setFullDone(null);
    try {
      const res = await fetch("/api/tree/merge-tree", {
        method: "POST",
        headers: mutationHeaders(),
        body: JSON.stringify({ peerTreeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? t("compare.mergeAllFailed"));
      setFullDone({ added: data.added ?? 0, linked: data.linked ?? 0 });
      router.refresh();
    } catch (e) {
      setFullDone((e as Error).message);
    } finally {
      setFullBusy(false);
    }
  };

  const graft = async (peerRootId: string) => {
    setStatus((s) => ({ ...s, [peerRootId]: "busy" }));
    try {
      const res = await fetch("/api/tree/graft", {
        method: "POST",
        headers: mutationHeaders(),
        body: JSON.stringify({ peerTreeId, rootPeerId: peerRootId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? t("compare.graftFailed"));
      setStatus((s) => ({ ...s, [peerRootId]: { added: data.added ?? 0, linked: data.linked ?? 0 } }));
      router.refresh();
    } catch (e) {
      setStatus((s) => ({ ...s, [peerRootId]: (e as Error).message }));
    }
  };

  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-serif text-xl font-semibold">{t("compare.title", { peer: peerName })}</h1>
            <p className="text-sm text-text-muted">
              {t("compare.subtitle", { count: rows.length, mine: mineCount, peer: peerCount })}
            </p>
          </div>
          <Link href="/tree" className="text-sm text-text-muted hover:text-text underline shrink-0">
            {t("compare.back")}
          </Link>
        </div>

        {/* P4 — tüm karşı ağacı kendi ağacıma kat (kesişimlerde dedup) */}
        <div className="rounded-2xl border border-border bg-surface p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-text">{t("compare.mergeAllTitle")}</p>
            <p className="text-[11px] text-text-subtle">{t("compare.mergeAllHint")}</p>
          </div>
          {fullDone && typeof fullDone === "object" ? (
            <span className="text-xs text-primary">
              {t("compare.grafted", { added: fullDone.added, linked: fullDone.linked })}
            </span>
          ) : typeof fullDone === "string" ? (
            <span className="text-xs text-danger">{fullDone}</span>
          ) : (
            <button
              onClick={mergeAll}
              disabled={fullBusy}
              className="h-9 px-4 rounded-lg border border-border bg-surface-2 hover:bg-surface text-sm font-medium text-text disabled:opacity-50 shrink-0"
            >
              {fullBusy ? t("compare.merging") : t("compare.mergeAll")}
            </button>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface p-6 text-center">
            <p className="text-4xl mb-3">🔍</p>
            <p className="text-sm text-text-muted">{t("compare.empty")}</p>
          </div>
        ) : (
          <ul className="space-y-2">
            <li className="grid grid-cols-[1fr_auto_1fr] gap-3 px-3 text-[11px] font-medium text-text-subtle">
              <span>{t("compare.mineCol")}</span>
              <span />
              <span className="text-right">{t("compare.peerCol", { peer: peerName })}</span>
            </li>
            {rows.map((r, i) => {
              const st = status[r.peer.id];
              const done = st && typeof st === "object";
              return (
                <li
                  key={`${r.mine.id}-${r.peer.id}-${i}`}
                  className="rounded-xl border border-border bg-surface p-3 space-y-2"
                >
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                    <Link href={`/tree?kisi=${encodeURIComponent(r.mine.id)}`} className="min-w-0 hover:opacity-80">
                      <p className="text-sm text-text truncate">{r.mine.name}</p>
                      <p className="text-[11px] text-text-subtle tabular-nums">{r.mine.span || "—"}</p>
                    </Link>
                    <span
                      className="text-[10px] font-medium px-2 py-1 rounded-lg bg-primary-soft text-primary text-center whitespace-nowrap"
                      title={t(`panel.dup.${r.reason}`)}
                    >
                      ↔
                    </span>
                    <Link
                      href={`/p/${encodeURIComponent(peerTreeId)}?kisi=${encodeURIComponent(r.peer.id)}`}
                      className="min-w-0 text-right hover:opacity-80"
                    >
                      <p className="text-sm text-text truncate">{r.peer.name}</p>
                      <p className="text-[11px] text-text-subtle tabular-nums">{r.peer.span || "—"}</p>
                    </Link>
                  </div>
                  {/* P3 — bu kişinin (karşı ağaçtaki) ata soyunu benim ağacıma ekle */}
                  <div className="flex items-center justify-end gap-2 border-t border-border/60 pt-2">
                    {done ? (
                      <span className="text-[11px] text-primary">
                        {t("compare.grafted", { added: (st as { added: number }).added, linked: (st as { linked: number }).linked })}
                      </span>
                    ) : typeof st === "string" && st !== "busy" ? (
                      <span className="text-[11px] text-danger">{st}</span>
                    ) : (
                      <button
                        onClick={() => graft(r.peer.id)}
                        disabled={st === "busy"}
                        className="text-[11px] font-medium text-primary hover:underline disabled:opacity-50"
                      >
                        {st === "busy" ? t("compare.grafting") : t("compare.graft")}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
