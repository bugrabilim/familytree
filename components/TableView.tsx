"use client";

import { useMemo, useState } from "react";
import type { Person, Gender } from "@/types/family";
import { storedToDisplay, displayToStored } from "@/lib/date";
import { fullName } from "@/lib/name";
import { useReadOnly } from "./ReadOnlyContext";
import { useT } from "@/lib/i18n";
import Button from "./ui/Button";

interface Props {
  people: Person[];
  onAdd: () => void;
  /** Kaydetme/silme sonrası sunucu verisini tazele (router.refresh). */
  onChanged: () => void;
}

const norm = (s: string) =>
  s.toLocaleLowerCase("tr").replace(/ı/g, "i").replace(/[çğöşü]/g, (c) => ({ ç: "c", ğ: "g", ö: "o", ş: "s", ü: "u" }[c] ?? c));

/**
 * Tablo görünümü — kişileri elektronik tablo gibi listeler, satır-içi düzenleme
 * ve çoktan-seçmeli toplu silme sağlar. Yalnız düzenleyiciler için etkileşimli;
 * izleyicide salt-okunur.
 */
export default function TableView({ people, onAdd, onChanged }: Props) {
  const t = useT();
  const { readOnly } = useReadOnly();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const rows = useMemo(() => {
    const sorted = [...people].sort((a, b) => fullName(a).localeCompare(fullName(b), "tr"));
    const q = norm(query.trim());
    if (!q) return sorted;
    return sorted.filter((p) =>
      norm([fullName(p), p.birthDate ?? "", p.deathDate ?? "", p.birthPlace ?? "", p.code ?? ""].join(" ")).includes(q)
    );
  }, [people, query]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const allShownSelected = rows.length > 0 && rows.every((p) => selected.has(p.id));
  const toggleAll = () =>
    setSelected((prev) => {
      if (allShownSelected) {
        const n = new Set(prev);
        rows.forEach((p) => n.delete(p.id));
        return n;
      }
      return new Set([...prev, ...rows.map((p) => p.id)]);
    });

  const saveField = async (id: string, patch: Record<string, unknown>) => {
    setError("");
    try {
      const res = await fetch(`/api/family/person/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? t("table.saveFailed"));
      }
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const bulkDelete = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/family/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected] }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error ?? t("table.deleteFailed"));
      setSelected(new Set());
      setConfirmDel(false);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Araç çubuğu */}
      <div className="shrink-0 border-b border-border bg-bg-elevated/60 px-4 sm:px-6 py-3 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("list.searchPlaceholder")}
            className="h-9 flex-1 min-w-[140px] max-w-md px-3 rounded-xl bg-surface border border-border text-sm text-text placeholder:text-text-subtle focus:outline-none focus:border-primary"
          />
          {!readOnly && (
            <Button size="sm" onClick={onAdd} className="shrink-0">
              + {t("common.addPerson")}
            </Button>
          )}
          <span className="ml-auto text-xs text-text-subtle tabular-nums">
            {t("common.peopleCount", { count: rows.length })}
          </span>
        </div>

        {/* Seçim + toplu silme */}
        {!readOnly && selected.size > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {confirmDel ? (
              <>
                <span className="text-xs text-danger">{t("table.confirmDelete", { count: selected.size })}</span>
                <Button size="sm" variant="danger" onClick={bulkDelete} disabled={busy}>
                  {busy ? t("table.deleting") : t("table.confirmYes")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDel(false)} disabled={busy}>
                  {t("table.cancel")}
                </Button>
              </>
            ) : (
              <>
                <span className="text-xs text-text-muted tabular-nums">{t("table.selected", { count: selected.size })}</span>
                <Button size="sm" variant="danger" onClick={() => setConfirmDel(true)}>
                  {t("table.deleteSelected")}
                </Button>
                <button onClick={() => setSelected(new Set())} className="text-xs text-text-subtle hover:text-text">
                  {t("table.clearSelection")}
                </button>
              </>
            )}
          </div>
        )}
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>

      {/* Tablo */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm border-collapse min-w-[720px]">
          <thead className="sticky top-0 z-10 bg-bg-elevated border-b border-border">
            <tr className="text-left text-xs text-text-muted">
              {!readOnly && (
                <th className="w-10 px-3 py-2">
                  <input type="checkbox" checked={allShownSelected} onChange={toggleAll} aria-label={t("table.selectAll")} />
                </th>
              )}
              <th className="px-3 py-2 font-medium">{t("table.col.name")}</th>
              <th className="px-3 py-2 font-medium">{t("table.col.surname")}</th>
              <th className="px-3 py-2 font-medium">{t("table.col.birth")}</th>
              <th className="px-3 py-2 font-medium">{t("table.col.death")}</th>
              <th className="px-3 py-2 font-medium">{t("table.col.gender")}</th>
              <th className="px-3 py-2 font-medium">{t("table.col.place")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className={`border-b border-border/60 ${selected.has(p.id) ? "bg-primary-soft/40" : "hover:bg-surface-2/60"}`}>
                {!readOnly && (
                  <td className="px-3 py-1.5 align-middle">
                    <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} aria-label={fullName(p)} />
                  </td>
                )}
                <Cell readOnly={readOnly} defaultValue={p.firstName} onSave={(v) => saveField(p.id, { firstName: v })} />
                <Cell readOnly={readOnly} defaultValue={p.lastName} onSave={(v) => saveField(p.id, { lastName: v })} />
                <Cell
                  readOnly={readOnly}
                  defaultValue={storedToDisplay(p.birthDate)}
                  placeholder="YYYY"
                  onSave={(v) => saveField(p.id, { birthDate: displayToStored(v) })}
                />
                <Cell
                  readOnly={readOnly}
                  defaultValue={storedToDisplay(p.deathDate)}
                  placeholder="YYYY"
                  onSave={(v) => saveField(p.id, { deathDate: displayToStored(v) })}
                />
                <td className="px-2 py-1.5">
                  {readOnly ? (
                    <span className="text-text-muted">{p.gender !== "unknown" ? t(`form.gender.${p.gender}`) : "—"}</span>
                  ) : (
                    <select
                      value={p.gender}
                      onChange={(e) => saveField(p.id, { gender: e.target.value as Gender })}
                      className="h-8 px-1.5 rounded-lg bg-transparent border border-transparent hover:border-border focus:border-primary focus:bg-surface text-text text-sm outline-none cursor-pointer"
                    >
                      <option value="male">{t("form.gender.male")}</option>
                      <option value="female">{t("form.gender.female")}</option>
                      <option value="other">{t("form.gender.other")}</option>
                      <option value="unknown">—</option>
                    </select>
                  )}
                </td>
                <Cell readOnly={readOnly} defaultValue={p.birthPlace ?? ""} onSave={(v) => saveField(p.id, { birthPlace: v })} />
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="text-center text-sm text-text-muted py-12">{query ? t("table.noMatch") : t("table.empty")}</p>
        )}
      </div>
    </div>
  );
}

/** Satır-içi düzenlenebilir metin hücresi — değişiklikte (blur/Enter) kaydeder. */
function Cell({
  defaultValue,
  onSave,
  readOnly,
  placeholder,
}: {
  defaultValue: string;
  onSave: (v: string) => void;
  readOnly: boolean;
  placeholder?: string;
}) {
  if (readOnly) {
    return <td className="px-3 py-1.5 text-text">{defaultValue || <span className="text-text-subtle">—</span>}</td>;
  }
  return (
    <td className="px-2 py-1.5">
      <input
        defaultValue={defaultValue}
        placeholder={placeholder}
        onBlur={(e) => {
          if (e.target.value !== defaultValue) onSave(e.target.value.trim());
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="w-full h-8 px-2 rounded-lg bg-transparent border border-transparent hover:border-border focus:border-primary focus:bg-surface text-text text-sm outline-none"
      />
    </td>
  );
}
