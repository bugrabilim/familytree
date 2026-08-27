"use client";

import { useMemo, useRef, useState } from "react";
import type { Person, Gender } from "@/types/family";
import { storedToDisplay, displayToStored } from "@/lib/date";
import { fullName } from "@/lib/name";
import { entrySourceLabel } from "@/lib/entry-source";
import { isAssociate, isMember } from "@/lib/associates";
import { useReadOnly } from "./ReadOnlyContext";
import { useT, useLang } from "@/lib/i18n";
import Button from "./ui/Button";

/** Şablon sütunları — başlıklar içe-aktarma eş-adlarıyla uyumlu (lib/import.ts).
 *  Örnek satırlar "Kimlik" ile baba/anne/eş bağını nasıl kuracağını gösterir. */
const TPL_COLUMNS = [
  { tr: "Kimlik", en: "ID" },
  { tr: "Ad", en: "First name" },
  { tr: "Soyad", en: "Last name" },
  { tr: "Cinsiyet", en: "Gender" },
  { tr: "Doğum", en: "Birth" },
  { tr: "Ölüm", en: "Death" },
  { tr: "Doğum Yeri", en: "Birth place" },
  { tr: "Meslek", en: "Occupation" },
  { tr: "Lakap", en: "Nickname" },
  { tr: "Baba Adı", en: "Patronymic" },
  { tr: "Baba", en: "Father" },
  { tr: "Anne", en: "Mother" },
  { tr: "Eş", en: "Spouse" },
  { tr: "Not", en: "Note" },
] as const;

const TPL_EXAMPLES: Record<"tr" | "en", string[][]> = {
  tr: [
    ["1", "Ahmet", "Yılmaz", "erkek", "1950", "2010", "Ankara", "Öğretmen", "", "", "", "", "2", ""],
    ["2", "Ayşe", "Yılmaz", "kadın", "1955", "", "İzmir", "", "", "", "", "", "1", ""],
    ["3", "Mehmet", "Yılmaz", "erkek", "1980", "", "Ankara", "Mühendis", "", "", "1", "2", "", ""],
  ],
  en: [
    ["1", "Ahmet", "Yilmaz", "male", "1950", "2010", "Ankara", "Teacher", "", "", "", "", "2", ""],
    ["2", "Ayse", "Yilmaz", "female", "1955", "", "Izmir", "", "", "", "", "", "1", ""],
    ["3", "Mehmet", "Yilmaz", "male", "1980", "", "Ankara", "Engineer", "", "", "1", "2", "", ""],
  ],
};

type Filter = "hepsi" | "uyeler" | "arkadaslar" | "yasayan" | "vefat";

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
  const { lang } = useLang();
  const { readOnly } = useReadOnly();
  const [query, setQuery] = useState("");
  // #5 — Excel şablon indir + toplu yükle.
  const fileRef = useRef<HTMLInputElement>(null);
  const [impBusy, setImpBusy] = useState(false);
  const [impMsg, setImpMsg] = useState("");
  const [filter, setFilter] = useState<Filter>("hepsi");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Cinsiyet <select> sunucu tazelemesini (router.refresh) beklerken donuk
  // görünmesin diye anlık yerel değer; kayıt arka planda sürer (#18).
  const [genderOverride, setGenderOverride] = useState<Record<string, Gender>>({});

  const rows = useMemo(() => {
    let out = [...people].sort((a, b) => fullName(a).localeCompare(fullName(b), "tr"));
    out = out.filter((p) => {
      if (filter === "uyeler" && !isMember(p)) return false;
      if (filter === "arkadaslar" && !isAssociate(p)) return false;
      if (filter === "yasayan" && p.deathDate) return false;
      if (filter === "vefat" && !p.deathDate) return false;
      return true;
    });
    const q = norm(query.trim());
    if (!q) return out;
    return out.filter((p) =>
      norm([fullName(p), p.birthDate ?? "", p.deathDate ?? "", p.birthPlace ?? "", p.code ?? ""].join(" ")).includes(q)
    );
  }, [people, query, filter]);

  const FILTERS: Array<{ k: Filter; l: string }> = [
    { k: "hepsi", l: t("list.filter.all") },
    { k: "uyeler", l: t("list.filter.members") },
    { k: "arkadaslar", l: t("list.filter.friends") },
    { k: "yasayan", l: t("list.filter.living") },
    { k: "vefat", l: t("list.filter.deceased") },
  ];

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

  // Şablonu (.xlsx) SheetJS ile üret ve indir. xlsx yalnız gerekince yüklenir.
  const downloadTemplate = async () => {
    setImpMsg("");
    try {
      const XLSX = await import("xlsx");
      const L = lang === "en" ? "en" : "tr";
      const header = TPL_COLUMNS.map((c) => c[L]);
      const aoa = [header, ...TPL_EXAMPLES[L]];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws["!cols"] = header.map(() => ({ wch: 14 }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, t("table.tpl.sheetName"));
      // Açıklama sayfası
      const info = XLSX.utils.aoa_to_sheet(
        t("table.tpl.infoBody").split("\n").map((line) => [line])
      );
      info["!cols"] = [{ wch: 90 }];
      XLSX.utils.book_append_sheet(wb, info, t("table.tpl.infoSheet"));
      XLSX.writeFile(wb, "soyagaci-sablon.xlsx");
    } catch {
      setImpMsg(t("table.tpl.importFailed"));
    }
  };

  // Excel/CSV yükle: Excel'i istemcide CSV'ye çevirip mevcut içe-aktarma ucuna
  // gönder (sunucu CSV'yi zaten anlıyor). Yeni kişiler mevcutlara eklenir.
  const handleFile = async (file: File) => {
    setImpBusy(true);
    setImpMsg("");
    try {
      let csv: string;
      if (/\.csv$/i.test(file.name) || file.type === "text/csv") {
        csv = await file.text();
      } else {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        csv = XLSX.utils.sheet_to_csv(ws);
      }
      const fd = new FormData();
      fd.append("file", new Blob([csv], { type: "text/csv" }), "toplu-yukleme.csv");
      fd.append("mode", "merge");
      const res = await fetch("/api/family/import", { method: "POST", body: fd });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.error ?? t("table.tpl.importFailed"));
      setImpMsg(t("table.tpl.imported", { count: d?.count ?? 0 }));
      onChanged();
    } catch (e) {
      setImpMsg((e as Error).message || t("table.tpl.importFailed"));
    } finally {
      setImpBusy(false);
      if (fileRef.current) fileRef.current.value = "";
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
          {/* #5 — Excel şablon indir + toplu yükle */}
          {!readOnly && (
            <>
              <button
                onClick={downloadTemplate}
                title={t("table.tpl.downloadHint")}
                className="shrink-0 h-9 px-2.5 rounded-xl border border-border bg-surface text-text-muted hover:text-text hover:border-border-strong text-xs font-medium flex items-center gap-1.5 transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M12 3v11m0 0l-4-4m4 4l4-4M5 21h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="hidden sm:inline">{t("table.tpl.download")}</span>
              </button>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={impBusy}
                title={t("table.tpl.uploadHint")}
                className="shrink-0 h-9 px-2.5 rounded-xl border border-primary/30 bg-primary-soft text-primary hover:brightness-105 text-xs font-medium flex items-center gap-1.5 transition-all disabled:opacity-50"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M12 16V5m0 0L8 9m4-4l4 4M5 21h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="hidden sm:inline">{impBusy ? t("table.tpl.importing") : t("table.tpl.upload")}</span>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </>
          )}
          <span className="ml-auto text-xs text-text-subtle tabular-nums">
            {t("common.peopleCount", { count: rows.length })}
          </span>
        </div>
        {impMsg && <p className="text-xs text-text-muted">{impMsg}</p>}

        {/* Süzgeç çipleri */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f.k}
              onClick={() => setFilter(f.k)}
              className={`h-7 px-2.5 rounded-lg text-xs font-medium transition-colors ${
                filter === f.k
                  ? "bg-primary text-primary-text"
                  : "bg-surface border border-border text-text-muted hover:text-text"
              }`}
            >
              {f.l}
            </button>
          ))}
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
        <table className="w-full text-sm border-collapse min-w-[3200px]">
          <thead className="sticky top-0 z-10 bg-bg-elevated border-b border-border">
            <tr className="text-left text-xs text-text-muted">
              {!readOnly && (
                <th className="w-10 px-3 py-2">
                  <input type="checkbox" checked={allShownSelected} onChange={toggleAll} aria-label={t("table.selectAll")} />
                </th>
              )}
              <th className="px-3 py-2 font-medium">{t("table.col.name")}</th>
              <th className="px-3 py-2 font-medium">{t("table.col.surname")}</th>
              <th className="px-3 py-2 font-medium">{t("form.nickname")}</th>
              <th className="px-3 py-2 font-medium">{t("form.patronymic")}</th>
              <th className="px-3 py-2 font-medium">{t("table.col.birth")}</th>
              <th className="px-3 py-2 font-medium">{t("form.field.officialBirthDate")}</th>
              <th className="px-3 py-2 font-medium">{t("table.col.death")}</th>
              <th className="px-3 py-2 font-medium">{t("table.col.gender")}</th>
              <th className="px-3 py-2 font-medium">{t("table.col.place")}</th>
              <th className="px-3 py-2 font-medium">{t("burial.label")}</th>
              <th className="px-3 py-2 font-medium">{t("drawer.occupation")}</th>
              <th className="px-3 py-2 font-medium">{t("drawer.education")}</th>
              <th className="px-3 py-2 font-medium">{t("drawer.religion")}</th>
              <th className="px-3 py-2 font-medium">{t("drawer.denomination")}</th>
              <th className="px-3 py-2 font-medium">{t("drawer.language")}</th>
              <th className="px-3 py-2 font-medium">{t("drawer.ethnicity")}</th>
              <th className="px-3 py-2 font-medium">{t("drawer.nationality")}</th>
              <th className="px-3 py-2 font-medium">{t("form.orientation")}</th>
              <th className="px-3 py-2 font-medium">{t("form.deathCause")}</th>
              <th className="px-3 py-2 font-medium">{t("form.congenital")}</th>
              <th className="px-3 py-2 font-medium">{t("form.health")}</th>
              <th className="px-3 py-2 font-medium">{t("form.bio")}</th>
              {/* #1 — Kaynak (ekleniş): kartın nasıl eklendiği; salt-okunur. */}
              <th className="px-3 py-2 font-medium">{t("drawer.entrySource")}</th>
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
                <Cell readOnly={readOnly} defaultValue={p.nickname ?? ""} onSave={(v) => saveField(p.id, { nickname: v })} />
                <Cell readOnly={readOnly} defaultValue={p.patronymic ?? ""} onSave={(v) => saveField(p.id, { patronymic: v })} />
                <Cell
                  readOnly={readOnly}
                  defaultValue={storedToDisplay(p.birthDate)}
                  placeholder="YYYY"
                  onSave={(v) => saveField(p.id, { birthDate: displayToStored(v) })}
                />
                <Cell
                  readOnly={readOnly}
                  defaultValue={storedToDisplay(p.officialBirthDate)}
                  placeholder="YYYY"
                  onSave={(v) => saveField(p.id, { officialBirthDate: displayToStored(v) })}
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
                      value={genderOverride[p.id] ?? p.gender}
                      onChange={(e) => {
                        const g = e.target.value as Gender;
                        setGenderOverride((m) => ({ ...m, [p.id]: g }));
                        saveField(p.id, { gender: g });
                      }}
                      className="h-8 px-1.5 rounded-lg bg-transparent border border-transparent hover:border-border focus:border-primary focus:bg-surface text-text text-sm outline-none cursor-pointer"
                    >
                      <option value="male">{t("form.gender.male")}</option>
                      <option value="female">{t("form.gender.female")}</option>
                      <option value="other">{t("form.gender.other")}</option>
                      {/* "Bilinmiyor" artık seçilemez; yalnız eski kayıt bozulmasın diye tutulur */}
                      {p.gender === "unknown" && <option value="unknown">—</option>}
                    </select>
                  )}
                </td>
                <Cell readOnly={readOnly} defaultValue={p.birthPlace ?? ""} onSave={(v) => saveField(p.id, { birthPlace: v })} />
                <Cell readOnly={readOnly} defaultValue={p.burialPlace ?? ""} onSave={(v) => saveField(p.id, { burialPlace: v })} />
                <Cell readOnly={readOnly} defaultValue={p.occupation ?? ""} onSave={(v) => saveField(p.id, { occupation: v })} />
                <Cell readOnly={readOnly} defaultValue={p.education ?? ""} onSave={(v) => saveField(p.id, { education: v })} />
                <Cell readOnly={readOnly} defaultValue={p.religion ?? ""} onSave={(v) => saveField(p.id, { religion: v })} />
                <Cell readOnly={readOnly} defaultValue={p.denomination ?? ""} onSave={(v) => saveField(p.id, { denomination: v })} />
                <Cell readOnly={readOnly} defaultValue={p.language ?? ""} onSave={(v) => saveField(p.id, { language: v })} />
                <Cell readOnly={readOnly} defaultValue={p.ethnicity ?? ""} onSave={(v) => saveField(p.id, { ethnicity: v })} />
                <Cell readOnly={readOnly} defaultValue={p.nationality ?? ""} onSave={(v) => saveField(p.id, { nationality: v })} />
                <Cell readOnly={readOnly} defaultValue={p.orientation ?? ""} onSave={(v) => saveField(p.id, { orientation: v })} />
                <Cell wide readOnly={readOnly} defaultValue={p.deathCause ?? ""} onSave={(v) => saveField(p.id, { deathCause: v })} />
                <Cell wide readOnly={readOnly} defaultValue={p.congenitalCondition ?? ""} onSave={(v) => saveField(p.id, { congenitalCondition: v })} />
                <Cell wide readOnly={readOnly} defaultValue={p.healthCondition ?? ""} onSave={(v) => saveField(p.id, { healthCondition: v })} />
                <Cell wide readOnly={readOnly} defaultValue={p.bio ?? ""} onSave={(v) => saveField(p.id, { bio: v })} />
                {/* Kaynak — salt-okunur; kartın nasıl eklendiğini gösterir (#1). */}
                <td className="px-3 py-1.5 whitespace-nowrap text-text-muted">
                  {p.entrySource ? entrySourceLabel(p.entrySource, t) : <span className="text-text-subtle">—</span>}
                </td>
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
  wide,
}: {
  defaultValue: string;
  onSave: (v: string) => void;
  readOnly: boolean;
  placeholder?: string;
  /** Serbest metin alanları (biyografi vb.) için daha geniş sütun. */
  wide?: boolean;
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
        className={`w-full h-8 px-2 rounded-lg bg-transparent border border-transparent hover:border-border focus:border-primary focus:bg-surface text-text text-sm outline-none ${
          wide ? "min-w-[240px]" : "min-w-[150px]"
        }`}
      />
    </td>
  );
}
