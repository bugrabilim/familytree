"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n";
import type { TreeMeta } from "@/lib/trees";

type Tree = TreeMeta & { home: boolean };

/**
 * Çoklu ağaç seçici (yalnız founder). Aktif ağacı gösterir; açılır menüden
 * ağaç değiştir / yeni ağaç oluştur / yeniden adlandır / sil. Değişiklik
 * sonrası sunucu bileşenleri tazelensin diye router.refresh().
 */
export default function TreeSwitcher({
  trees,
  activeTreeId,
  peopleCount,
}: {
  trees: Tree[];
  activeTreeId: string;
  peopleCount: number;
}) {
  const router = useRouter();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState("");
  const [error, setError] = useState<string>();

  const active = trees.find((tr) => tr.treeId === activeTreeId) ?? trees[0];

  const call = async (
    method: "POST" | "PATCH" | "DELETE",
    body: Record<string, unknown>
  ): Promise<Response> => {
    return fetch("/api/trees", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  };

  const switchTo = async (treeId: string) => {
    if (treeId === activeTreeId) {
      setOpen(false);
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch("/api/trees/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ treeId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error ?? t("tree.switchFailed"));
      }
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    const name = newName.trim();
    if (name.length < 2) {
      setError(t("tree.nameTooShort"));
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const res = await call("POST", { name });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error ?? t("tree.createFailed"));
      // Yeni ağaca geç.
      await switchTo(d.treeId);
      setCreating(false);
      setNewName("");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const rename = async (treeId: string) => {
    const name = renameName.trim();
    if (name.length < 2) {
      setError(t("tree.nameTooShort"));
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const res = await call("PATCH", { treeId, name });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error ?? t("tree.renameFailed"));
      setRenamingId(null);
      setRenameName("");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (tree: Tree) => {
    if (!window.confirm(t("tree.deleteConfirm", { name: tree.name }))) return;
    setBusy(true);
    setError(undefined);
    try {
      const res = await call("DELETE", { treeId: tree.treeId });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error ?? t("tree.deleteFailed"));
      // Silinen aktif ağaçsa sunucu ana ağaca düşer; her hâlükârda tazele.
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative min-w-0">
      <button
        onClick={() => {
          setOpen((o) => !o);
          setError(undefined);
          setCreating(false);
          setRenamingId(null);
        }}
        aria-expanded={open}
        aria-label={t("tree.switcherAria")}
        className="flex items-center gap-1.5 min-w-0 max-w-[180px] sm:max-w-[220px] h-9 px-2 rounded-lg hover:bg-surface-2 transition-colors group"
      >
        <div className="min-w-0 text-left">
          <p className="font-serif font-semibold text-[15px] leading-tight text-text truncate flex items-center gap-1">
            {active?.name ?? t("topbar.appName")}
          </p>
          <p className="text-[11px] leading-tight text-text-subtle">
            {t("common.peopleCount", { count: peopleCount })}
          </p>
        </div>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
          className="shrink-0 text-text-subtle group-hover:text-text-muted transition-colors"
        >
          <path d="M7 10l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-11 z-20 w-72 rounded-xl border border-border bg-bg-elevated shadow-float overflow-hidden animate-scale-in origin-top-left">
            <div className="px-3.5 py-2 text-[11px] font-medium uppercase tracking-wide text-text-subtle border-b border-border">
              {t("tree.myTrees")}
            </div>

            <div className="max-h-72 overflow-y-auto py-1">
              {trees.map((tree) => {
                const isActive = tree.treeId === activeTreeId;
                if (renamingId === tree.treeId) {
                  return (
                    <div key={tree.treeId} className="px-2.5 py-1.5">
                      <input
                        autoFocus
                        value={renameName}
                        onChange={(e) => setRenameName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") rename(tree.treeId);
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        disabled={busy}
                        className="w-full h-8 px-2.5 rounded-lg border border-border bg-surface text-sm text-text focus:border-primary focus:outline-none"
                      />
                      <div className="flex items-center gap-1 mt-1.5">
                        <button
                          onClick={() => rename(tree.treeId)}
                          disabled={busy}
                          className="flex-1 h-7 rounded-lg bg-primary text-primary-text text-xs font-medium hover:brightness-110 disabled:opacity-50"
                        >
                          {t("tree.save")}
                        </button>
                        <button
                          onClick={() => setRenamingId(null)}
                          disabled={busy}
                          className="flex-1 h-7 rounded-lg border border-border text-xs font-medium text-text-muted hover:bg-surface-2"
                        >
                          {t("tree.cancel")}
                        </button>
                      </div>
                    </div>
                  );
                }
                return (
                  <div
                    key={tree.treeId}
                    className={`group flex items-center gap-1 px-1.5 mx-1 rounded-lg ${
                      isActive ? "bg-primary-soft" : "hover:bg-surface-2"
                    }`}
                  >
                    <button
                      onClick={() => switchTo(tree.treeId)}
                      disabled={busy}
                      className="flex-1 min-w-0 flex items-center gap-2 py-2 pl-1.5 text-left"
                    >
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden
                        className={isActive ? "text-primary shrink-0" : "text-text-subtle shrink-0"}
                      >
                        {tree.home ? (
                          <path d="M4 11l8-6 8 6M6 10v9h12v-9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                        ) : (
                          <path d="M12 22V11M12 11L7.5 7.5M12 11l4.5-3.5M12 4.5a2 2 0 100-.01" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                        )}
                      </svg>
                      <span className={`text-sm truncate ${isActive ? "text-text font-medium" : "text-text"}`}>
                        {tree.name}
                      </span>
                      {tree.home && (
                        <span className="text-[10px] text-text-subtle shrink-0">{t("tree.home")}</span>
                      )}
                      {isActive && (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden className="ml-auto text-primary shrink-0">
                          <path d="M5 12l5 5L20 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                    {/* Ana ağaç yeniden adlandırılamaz/silinemez (kayıtta tutulmaz). */}
                    {!tree.home && (
                      <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => {
                            setRenamingId(tree.treeId);
                            setRenameName(tree.name);
                            setError(undefined);
                          }}
                          disabled={busy}
                          title={t("tree.rename")}
                          className="w-7 h-7 grid place-items-center rounded-md text-text-subtle hover:text-text hover:bg-surface-3"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                            <path d="M4 20h4L18 10l-4-4L4 16v4zM14 6l4 4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                        <button
                          onClick={() => remove(tree)}
                          disabled={busy}
                          title={t("tree.delete")}
                          className="w-7 h-7 grid place-items-center rounded-md text-text-subtle hover:text-danger hover:bg-surface-3"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                            <path d="M5 7h14M9 7V5h6v2M6 7l1 13h10l1-13" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="h-px bg-border" />

            {creating ? (
              <div className="p-2.5">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") create();
                    if (e.key === "Escape") setCreating(false);
                  }}
                  disabled={busy}
                  placeholder={t("tree.newNamePlaceholder")}
                  className="w-full h-8 px-2.5 rounded-lg border border-border bg-surface text-sm text-text placeholder:text-text-subtle focus:border-primary focus:outline-none"
                />
                <div className="flex items-center gap-1 mt-1.5">
                  <button
                    onClick={create}
                    disabled={busy}
                    className="flex-1 h-7 rounded-lg bg-primary text-primary-text text-xs font-medium hover:brightness-110 disabled:opacity-50"
                  >
                    {t("tree.create")}
                  </button>
                  <button
                    onClick={() => {
                      setCreating(false);
                      setNewName("");
                    }}
                    disabled={busy}
                    className="flex-1 h-7 rounded-lg border border-border text-xs font-medium text-text-muted hover:bg-surface-2"
                  >
                    {t("tree.cancel")}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => {
                  setCreating(true);
                  setError(undefined);
                }}
                disabled={busy}
                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-text hover:bg-surface-2 transition-colors text-left"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden className="text-text-muted">
                  <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                {t("tree.new")}
              </button>
            )}

            {error && (
              <p className="px-3.5 pb-2.5 -mt-1 text-[11px] text-danger">{error}</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
