"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Person, Gender } from "@/types/family";
import { storedToDisplay, displayToStored } from "@/lib/date";
import { fullName } from "@/lib/name";
import { entrySourceLabel } from "@/lib/entry-source";
import { isAssociate } from "@/lib/associates";
import { useReadOnly } from "./ReadOnlyContext";
import { useT, useLang, type TFunction } from "@/lib/i18n";
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

interface Props {
  people: Person[];
  onAdd: () => void;
  /** Kaydetme/silme sonrası sunucu verisini tazele (router.refresh). */
  onChanged: () => void;
}

const norm = (s: string) =>
  s.toLocaleLowerCase("tr").replace(/ı/g, "i").replace(/[çğöşü]/g, (c) => ({ ç: "c", ğ: "g", ö: "o", ş: "s", ü: "u" }[c] ?? c));

/** Bir sütunun tanımı: başlık, değeri okuma ve (varsa) satır-içi düzenleme. */
interface Col {
  key: string;
  label: string;
  /** Hem gösterim hem FİLTRE değeri (boş dize = "(boş)"). */
  get: (p: Person) => string;
  /** Verilmişse hücre düzenlenebilir; kaydedilecek yamayı üretir. */
  save?: (v: string) => Record<string, unknown>;
  kind?: "text" | "gender" | "readonly";
  wide?: boolean;
  placeholder?: string;
  /** Tarih sütunu: filtre Excel gibi yıl > ay > gün ağacı olarak açılır (#4). */
  dateHierarchy?: boolean;
  /** Ham (stored) değer — hiyerarşik tarih filtresi bunu kullanır ("YYYY[-MM[-DD]]"). */
  raw?: (p: Person) => string;
}

/**
 * Tablo görünümü — kişileri elektronik tablo gibi listeler, satır-içi düzenleme,
 * çoktan-seçmeli toplu silme ve **Excel benzeri sütun başlığı filtreleri** sunar.
 * Her başlıktaki huni simgesine basınca o sütundaki farklı değerler listelenir;
 * istenen değer(ler) işaretlenerek satırlar süzülür. Yalnız düzenleyiciler için
 * etkileşimli; izleyicide salt-okunur.
 */
export default function TableView({ people, onAdd, onChanged }: Props) {
  const t = useT();
  const { lang } = useLang();
  const { readOnly } = useReadOnly();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Sütun filtreleri: sütun anahtarı → seçili değerler. Anahtar yoksa süzgeç yok.
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  // Cinsiyet <select> sunucu tazelemesini beklerken donuk görünmesin diye
  // anlık yerel değer; kayıt arka planda sürer.
  const [genderOverride, setGenderOverride] = useState<Record<string, Gender>>({});
  // Excel şablon indir + toplu yükle.
  const fileRef = useRef<HTMLInputElement>(null);
  const [impBusy, setImpBusy] = useState(false);
  const [impMsg, setImpMsg] = useState("");

  const COLS: Col[] = useMemo(() => {
    const genderLabel = (g: Gender) => (g === "unknown" ? "—" : t(`form.gender.${g}`));
    return [
      { key: "firstName", label: t("table.col.name"), get: (p) => p.firstName ?? "", save: (v) => ({ firstName: v }) },
      { key: "lastName", label: t("table.col.surname"), get: (p) => p.lastName ?? "", save: (v) => ({ lastName: v }) },
      { key: "nickname", label: t("form.nickname"), get: (p) => p.nickname ?? "", save: (v) => ({ nickname: v }) },
      { key: "patronymic", label: t("form.patronymic"), get: (p) => p.patronymic ?? "", save: (v) => ({ patronymic: v }) },
      { key: "birthDate", label: t("table.col.birth"), get: (p) => storedToDisplay(p.birthDate), placeholder: "YYYY", save: (v) => ({ birthDate: displayToStored(v) }), dateHierarchy: true, raw: (p) => p.birthDate ?? "" },
      { key: "officialBirthDate", label: t("form.field.officialBirthDate"), get: (p) => storedToDisplay(p.officialBirthDate), placeholder: "YYYY", save: (v) => ({ officialBirthDate: displayToStored(v) }), dateHierarchy: true, raw: (p) => p.officialBirthDate ?? "" },
      { key: "deathDate", label: t("table.col.death"), get: (p) => storedToDisplay(p.deathDate), placeholder: "YYYY", save: (v) => ({ deathDate: displayToStored(v) }), dateHierarchy: true, raw: (p) => p.deathDate ?? "" },
      // Kaldırılan çip satırının yerine geçen, süzülebilir türetilmiş sütunlar (#4).
      { key: "status", label: t("table.col.status"), kind: "readonly", get: (p) => (p.deathDate ? t("list.filter.deceased") : t("list.filter.living")) },
      { key: "kind", label: t("table.col.kind"), kind: "readonly", get: (p) => (isAssociate(p) ? t("list.filter.friends") : t("list.filter.members")) },
      { key: "gender", label: t("table.col.gender"), kind: "gender", get: (p) => genderLabel(p.gender) },
      { key: "birthPlace", label: t("table.col.place"), get: (p) => p.birthPlace ?? "", save: (v) => ({ birthPlace: v }) },
      { key: "burialPlace", label: t("burial.label"), get: (p) => p.burialPlace ?? "", save: (v) => ({ burialPlace: v }) },
      { key: "occupation", label: t("drawer.occupation"), get: (p) => p.occupation ?? "", save: (v) => ({ occupation: v }) },
      { key: "education", label: t("drawer.education"), get: (p) => p.education ?? "", save: (v) => ({ education: v }) },
      { key: "religion", label: t("drawer.religion"), get: (p) => p.religion ?? "", save: (v) => ({ religion: v }) },
      { key: "denomination", label: t("drawer.denomination"), get: (p) => p.denomination ?? "", save: (v) => ({ denomination: v }) },
      { key: "language", label: t("drawer.language"), get: (p) => p.language ?? "", save: (v) => ({ language: v }) },
      { key: "ethnicity", label: t("drawer.ethnicity"), get: (p) => p.ethnicity ?? "", save: (v) => ({ ethnicity: v }) },
      { key: "nationality", label: t("drawer.nationality"), get: (p) => p.nationality ?? "", save: (v) => ({ nationality: v }) },
      { key: "orientation", label: t("form.orientation"), get: (p) => p.orientation ?? "", save: (v) => ({ orientation: v }) },
      { key: "deathCause", label: t("form.deathCause"), wide: true, get: (p) => p.deathCause ?? "", save: (v) => ({ deathCause: v }) },
      { key: "congenitalCondition", label: t("form.congenital"), wide: true, get: (p) => p.congenitalCondition ?? "", save: (v) => ({ congenitalCondition: v }) },
      { key: "healthCondition", label: t("form.health"), wide: true, get: (p) => p.healthCondition ?? "", save: (v) => ({ healthCondition: v }) },
      { key: "bio", label: t("form.bio"), wide: true, get: (p) => p.bio ?? "", save: (v) => ({ bio: v }) },
      { key: "entrySource", label: t("drawer.entrySource"), kind: "readonly", get: (p) => (p.entrySource ? entrySourceLabel(p.entrySource, t) : "") },
    ];
  }, [t]);

  const colByKey = useMemo(() => new Map(COLS.map((c) => [c.key, c])), [COLS]);

  /** Arama sorgusuna göre süz (sütun süzgeçleri hariç). */
  const searched = useMemo(() => {
    const base = [...people].sort((a, b) => fullName(a).localeCompare(fullName(b), "tr"));
    const q = norm(query.trim());
    if (!q) return base;
    return base.filter((p) =>
      norm([fullName(p), p.birthDate ?? "", p.deathDate ?? "", p.birthPlace ?? "", p.code ?? ""].join(" ")).includes(q)
    );
  }, [people, query]);

  /** Bir sütun HARİÇ tüm süzgeçleri uygula (Excel'de olduğu gibi: bir sütunun
   *  seçenek listesi kendi süzgecinden etkilenmez). */
  const applyFilters = useMemo(
    () => (list: Person[], exceptKey?: string) =>
      list.filter((p) =>
        Object.entries(filters).every(([k, vals]) => {
          if (k === exceptKey || !vals.length) return true;
          const col = colByKey.get(k);
          if (!col) return true;
          if (col.dateHierarchy && col.raw) {
            // Seçili değerler tarih ÖN-EKLERİ: "1950" (tüm yıl), "1950-03" (ay),
            // "1950-03-15" (gün) ya da "" (tarihsiz). Kişinin ham tarihi bir
            // ön-ekle başlıyorsa eşleşir.
            const r = col.raw(p);
            return vals.some((v) => (v === "" ? r === "" : r === v || r.startsWith(v + "-")));
          }
          return vals.includes(col.get(p));
        })
      ),
    [filters, colByKey]
  );

  const rows = useMemo(() => applyFilters(searched), [applyFilters, searched]);

  const activeFilterCount = Object.values(filters).filter((v) => v.length).length;

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
      <div className="shrink-0 border-b border-border bg-bg-elevated/60 px-4 sm:px-6 py-3 space-y-2">
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

        {/* Etkin sütun süzgeçleri — özet + temizle */}
        {activeFilterCount > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-text-muted">
              {t("table.filter.active", { count: activeFilterCount })}
            </span>
            {Object.entries(filters).filter(([, v]) => v.length).map(([k, v]) => (
              <button
                key={k}
                onClick={() => setFilters((f) => { const n = { ...f }; delete n[k]; return n; })}
                className="h-7 px-2.5 rounded-lg bg-primary-soft border border-primary/30 text-primary text-[11px] font-medium inline-flex items-center gap-1.5 hover:brightness-105"
              >
                {colByKey.get(k)?.label ?? k}
                <span className="tabular-nums opacity-70">{v.length}</span>
                <span aria-hidden>✕</span>
              </button>
            ))}
            <button onClick={() => setFilters({})} className="text-[11px] text-text-subtle hover:text-text">
              {t("table.filter.clearAll")}
            </button>
          </div>
        )}

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
              {COLS.map((c) => (
                <th key={c.key} className="px-3 py-2 font-medium whitespace-nowrap">
                  <HeaderFilter
                    col={c}
                    values={applyFilters(searched, c.key).map((p) => (c.dateHierarchy && c.raw ? c.raw(p) : c.get(p)))}
                    lang={lang}
                    selectedValues={filters[c.key] ?? []}
                    open={openFilter === c.key}
                    onToggleOpen={() => setOpenFilter((k) => (k === c.key ? null : c.key))}
                    onClose={() => setOpenFilter(null)}
                    onApply={(vals) =>
                      setFilters((f) => {
                        const n = { ...f };
                        if (vals.length) n[c.key] = vals;
                        else delete n[c.key];
                        return n;
                      })
                    }
                    t={t}
                  />
                </th>
              ))}
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
                {COLS.map((c) => {
                  if (c.kind === "gender") {
                    return (
                      <td key={c.key} className="px-2 py-1.5">
                        {readOnly ? (
                          <span className="text-text-muted">{c.get(p)}</span>
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
                    );
                  }
                  const save = c.save;
                  if (c.kind === "readonly" || !save) {
                    const v = c.get(p);
                    return (
                      <td key={c.key} className="px-3 py-1.5 whitespace-nowrap text-text-muted">
                        {v || <span className="text-text-subtle">—</span>}
                      </td>
                    );
                  }
                  return (
                    <Cell
                      key={c.key}
                      readOnly={readOnly}
                      defaultValue={c.get(p)}
                      placeholder={c.placeholder}
                      wide={c.wide}
                      onSave={(v) => saveField(p.id, save(v))}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="text-center text-sm text-text-muted py-12">
            {query || activeFilterCount ? t("table.noMatch") : t("table.empty")}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Sütun başlığı + Excel benzeri süzgeç açılır penceresi. Pencere `body`'ye
 * portallanır ve düğmenin ekran konumuna göre yerleştirilir; böylece tablonun
 * kaydırma kutusu tarafından kırpılmaz.
 */
function HeaderFilter({
  col, values, lang, selectedValues, open, onToggleOpen, onClose, onApply, t,
}: {
  col: Col;
  values: string[];
  lang: string;
  selectedValues: string[];
  open: boolean;
  onToggleOpen: () => void;
  onClose: () => void;
  onApply: (vals: string[]) => void;
  t: TFunction;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  // Panelin konumu, düğmeye BASILDIĞI anda ölçülür (olay işleyicisinde) ve
  // düz veri olarak aktarılır; böylece render sırasında ref okunmaz.
  const [anchor, setAnchor] = useState<{ left: number; bottom: number } | null>(null);
  const active = selectedValues.length > 0;

  const handleClick = () => {
    const r = btnRef.current?.getBoundingClientRect();
    setAnchor(r ? { left: r.left, bottom: r.bottom } : null);
    onToggleOpen();
  };

  return (
    <span className="inline-flex items-center gap-1">
      {col.label}
      <button
        ref={btnRef}
        onClick={handleClick}
        aria-label={t("table.filter.aria", { col: col.label })}
        aria-expanded={open}
        className={`shrink-0 w-5 h-5 grid place-items-center rounded transition-colors ${
          active ? "text-primary bg-primary-soft" : "text-text-subtle hover:text-text hover:bg-surface-2"
        }`}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M3 5h18l-7 8v6l-4 2v-8L3 5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Panel YALNIZ açıkken monte edilir; böylece taslak seçim ve konum
          ilk durumdan (lazy useState) okunur — efekt içinde setState gerekmez. */}
      {open && anchor && (
        col.dateHierarchy ? (
          <DateFilterPopover
            anchor={anchor}
            values={values}
            lang={lang}
            selectedValues={selectedValues}
            onClose={onClose}
            onApply={onApply}
            t={t}
          />
        ) : (
          <FilterPopover
            anchor={anchor}
            values={values}
            selectedValues={selectedValues}
            onClose={onClose}
            onApply={onApply}
            t={t}
          />
        )
      )}
    </span>
  );
}

/** Süzgeç paneli — `body`'ye portallanır, düğmenin ekran konumuna yerleşir;
 *  böylece tablonun kaydırma kutusu tarafından kırpılmaz. */
function FilterPopover({
  anchor, values, selectedValues, onClose, onApply, t,
}: {
  anchor: { left: number; bottom: number };
  values: string[];
  selectedValues: string[];
  onClose: () => void;
  onApply: (vals: string[]) => void;
  t: TFunction;
}) {
  const WIDTH = 248;
  const [pos] = useState(() => ({
    left: Math.min(Math.max(8, anchor.left), Math.max(8, window.innerWidth - WIDTH - 8)),
    top: anchor.bottom + 4,
  }));
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState<Set<string>>(() => new Set(selectedValues));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const BLANK = t("table.filter.blank");
  // Değerler her render'da YENİ dizi olur; bağımlılık olarak kimliği değil
  // içeriği kullan (ayraç olarak veride bulunmayan bir kontrol karakteri).
  const valuesKey = values.join("\u0001");
  const distinct = useMemo(() => {
    const set = new Set(values.map((v) => v.trim() || BLANK));
    const coll = new Intl.Collator("tr", { numeric: true });
    return [...set].sort((a, b) => (a === BLANK ? 1 : b === BLANK ? -1 : coll.compare(a, b)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valuesKey, BLANK]);

  const shown = useMemo(() => {
    const s = norm(q.trim());
    return s ? distinct.filter((v) => norm(v).includes(s)) : distinct;
  }, [distinct, q]);

  /** "(boş)" etiketi gerçek veride boş dizeye karşılık gelir. */
  const toStored = (v: string) => (v === BLANK ? "" : v);

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} aria-hidden />
      <div
        className="fixed z-[61] rounded-xl border border-border bg-bg-elevated shadow-float p-2 animate-scale-in origin-top-left"
        style={{ left: pos.left, top: pos.top, width: WIDTH }}
      >
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("table.filter.search")}
          className="w-full h-8 px-2.5 mb-1.5 rounded-lg bg-surface-2 border border-border text-xs text-text placeholder:text-text-subtle focus:outline-none focus:border-primary"
        />
        <div className="flex items-center justify-between px-1 pb-1.5 text-[11px]">
          <button onClick={() => setDraft(new Set(shown.map(toStored)))} className="text-primary hover:underline">
            {t("table.filter.selectAll")}
          </button>
          <button onClick={() => setDraft(new Set())} className="text-text-subtle hover:text-text">
            {t("table.filter.clear")}
          </button>
        </div>
        <ul className="max-h-56 overflow-y-auto space-y-0.5">
          {shown.map((v) => {
            const sv = toStored(v);
            return (
              <li key={v}>
                <label className="flex items-center gap-2 px-1.5 py-1 rounded-lg hover:bg-surface-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.has(sv)}
                    onChange={() =>
                      setDraft((prev) => {
                        const n = new Set(prev);
                        if (n.has(sv)) n.delete(sv); else n.add(sv);
                        return n;
                      })
                    }
                    className="shrink-0 accent-[var(--primary)]"
                  />
                  <span className={`text-xs truncate ${v === BLANK ? "text-text-subtle italic" : "text-text"}`}>{v}</span>
                </label>
              </li>
            );
          })}
          {shown.length === 0 && (
            <li className="text-[11px] text-text-subtle px-1.5 py-2 text-center">{t("table.noMatch")}</li>
          )}
        </ul>
        <div className="flex items-center gap-1.5 pt-2 mt-1 border-t border-border">
          <Button size="sm" onClick={() => { onApply([...draft]); onClose(); }} className="flex-1">
            {t("table.filter.apply")}
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            {t("table.cancel")}
          </Button>
        </div>
      </div>
    </>,
    document.body
  );
}


/**
 * Tarih sütunu için Excel benzeri hiyerarşik filtre: yıl > ay > gün ağacı (#4).
 * Değerler ham stored tarihlerdir ("YYYY", "YYYY-MM", "YYYY-MM-DD" ya da "").
 * Seçim, en üst kapsayan ÖN-EKİ tutar: bir yıl tümüyle seçiliyse yalnız "YYYY".
 * Üst düzey seçiliyse alt düğümler "kapsandı" (işaretli + edilgen) görünür.
 */
function DateFilterPopover({
  anchor, values, lang, selectedValues, onClose, onApply, t,
}: {
  anchor: { left: number; bottom: number };
  values: string[];
  lang: string;
  selectedValues: string[];
  onClose: () => void;
  onApply: (vals: string[]) => void;
  t: TFunction;
}) {
  const WIDTH = 272;
  const [pos] = useState(() => ({
    left: Math.min(Math.max(8, anchor.left), Math.max(8, window.innerWidth - WIDTH - 8)),
    top: anchor.bottom + 4,
  }));
  const [draft, setDraft] = useState<Set<string>>(() => new Set(selectedValues));
  const [openYears, setOpenYears] = useState<Set<string>>(new Set());
  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const BLANK = t("table.filter.blank");
  const monthName = (m: number) => {
    try { return new Date(2000, m - 1, 1).toLocaleDateString(lang === "en" ? "en" : "tr", { month: "long" }); }
    catch { return String(m).padStart(2, "0"); }
  };

  // Ham tarihlerden yıl>ay>gün ağacı (yalnız veride var olanlar). Boş ayrı.
  const valuesKey = values.join("");
  const { tree, hasBlank } = useMemo(() => {
    const tree = new Map<string, Map<string, Set<string>>>();
    let hasBlank = false;
    for (const raw of values) {
      const r = (raw ?? "").trim();
      if (!r) { hasBlank = true; continue; }
      const [y, m, d] = r.split("-");
      if (!/^\d{4}$/.test(y)) continue;
      if (!tree.has(y)) tree.set(y, new Map());
      const months = tree.get(y)!;
      if (m) {
        if (!months.has(m)) months.set(m, new Set());
        if (d) months.get(m)!.add(d);
      }
    }
    return { tree, hasBlank };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valuesKey]);

  const years = useMemo(
    () => [...tree.keys()].sort((a, b) => Number(b) - Number(a)),
    [tree]
  );

  // Bir ön-ek, kendisi ya da bir ATASI seçiliyse "kapsanmış"tır.
  const coveredBy = (prefix: string): string | null => {
    const parts = prefix.split("-");
    for (let i = 1; i <= parts.length; i++) {
      const anc = parts.slice(0, i).join("-");
      if (draft.has(anc)) return anc;
    }
    return null;
  };

  /** Bir düğümü aç/kapat: kendi ön-ekini ekler ve altındaki daha spesifik
   *  seçimleri temizler; zaten kapsanmışsa kapsayan atayı kaldırır. */
  const toggle = (prefix: string) => {
    setDraft((prev) => {
      const n = new Set(prev);
      const anc = (() => {
        const parts = prefix.split("-");
        for (let i = 1; i <= parts.length; i++) {
          const a = parts.slice(0, i).join("-");
          if (n.has(a)) return a;
        }
        return null;
      })();
      if (anc) {
        // Kapsanmış → seçimi kaldır (kapsayan atayı sil).
        n.delete(anc);
      } else {
        // Alt (daha spesifik) seçimleri temizle, bu ön-eki ekle.
        for (const v of [...n]) if (v.startsWith(prefix + "-")) n.delete(v);
        n.add(prefix);
      }
      return n;
    });
  };

  const isChecked = (prefix: string) => coveredBy(prefix) !== null;
  const isCoveredByAncestor = (prefix: string) => {
    const anc = coveredBy(prefix);
    return anc !== null && anc !== prefix;
  };

  const toggleBlank = () =>
    setDraft((prev) => { const n = new Set(prev); if (n.has("")) n.delete(""); else n.add(""); return n; });

  const toggleOpenYear = (y: string) =>
    setOpenYears((p) => { const n = new Set(p); if (n.has(y)) n.delete(y); else n.add(y); return n; });
  const toggleOpenMonth = (ym: string) =>
    setOpenMonths((p) => { const n = new Set(p); if (n.has(ym)) n.delete(ym); else n.add(ym); return n; });

  const Row = ({ prefix, label, depth, expandable, isOpen, onExpand }: {
    prefix: string; label: string; depth: number; expandable: boolean; isOpen?: boolean; onExpand?: () => void;
  }) => {
    const covered = isCoveredByAncestor(prefix);
    return (
      <div className="flex items-center gap-1" style={{ paddingInlineStart: depth * 16 }}>
        <button
          type="button"
          onClick={onExpand}
          className={`w-4 h-4 shrink-0 grid place-items-center text-text-subtle ${expandable ? "hover:text-text" : "invisible"}`}
          aria-label={isOpen ? "-" : "+"}
        >
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden className={`transition-transform ${isOpen ? "rotate-90" : ""}`}>
            <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <label className={`flex items-center gap-2 py-1 flex-1 min-w-0 rounded-lg px-1 hover:bg-surface-2 cursor-pointer ${covered ? "opacity-60" : ""}`}>
          <input
            type="checkbox"
            checked={isChecked(prefix)}
            disabled={covered}
            onChange={() => toggle(prefix)}
            className="shrink-0 accent-[var(--primary)]"
          />
          <span className="text-xs text-text truncate tabular-nums">{label}</span>
        </label>
      </div>
    );
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} aria-hidden />
      <div
        className="fixed z-[61] rounded-xl border border-border bg-bg-elevated shadow-float p-2 animate-scale-in origin-top-left"
        style={{ left: pos.left, top: pos.top, width: WIDTH }}
      >
        <div className="flex items-center justify-between px-1 pb-1.5 text-[11px]">
          <button onClick={() => setDraft(new Set(years))} className="text-primary hover:underline">
            {t("table.filter.selectAll")}
          </button>
          <button onClick={() => setDraft(new Set())} className="text-text-subtle hover:text-text">
            {t("table.filter.clear")}
          </button>
        </div>
        <div className="max-h-72 overflow-y-auto pr-0.5">
          {years.length === 0 && !hasBlank && (
            <p className="text-[11px] text-text-subtle px-1.5 py-2 text-center">{t("table.noMatch")}</p>
          )}
          {years.map((y) => {
            const months = tree.get(y)!;
            const monthKeys = [...months.keys()].sort();
            const yOpen = openYears.has(y);
            return (
              <div key={y}>
                <Row prefix={y} label={y} depth={0} expandable={monthKeys.length > 0} isOpen={yOpen} onExpand={() => toggleOpenYear(y)} />
                {yOpen && monthKeys.map((m) => {
                  const ym = `${y}-${m}`;
                  const days = [...months.get(m)!].sort();
                  const mOpen = openMonths.has(ym);
                  return (
                    <div key={ym}>
                      <Row prefix={ym} label={monthName(Number(m))} depth={1} expandable={days.length > 0} isOpen={mOpen} onExpand={() => toggleOpenMonth(ym)} />
                      {mOpen && days.map((d) => (
                        <Row key={`${ym}-${d}`} prefix={`${ym}-${d}`} label={String(Number(d))} depth={2} expandable={false} />
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })}
          {hasBlank && (
            <label className="flex items-center gap-2 py-1 px-1 rounded-lg hover:bg-surface-2 cursor-pointer" style={{ paddingInlineStart: 20 }}>
              <input type="checkbox" checked={draft.has("")} onChange={toggleBlank} className="shrink-0 accent-[var(--primary)]" />
              <span className="text-xs text-text-subtle italic">{BLANK}</span>
            </label>
          )}
        </div>
        <div className="flex items-center gap-1.5 pt-2 mt-1 border-t border-border">
          <Button size="sm" onClick={() => { onApply([...draft]); onClose(); }} className="flex-1">
            {t("table.filter.apply")}
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            {t("table.cancel")}
          </Button>
        </div>
      </div>
    </>,
    document.body
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
