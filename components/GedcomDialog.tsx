"use client";

import { useRef, useState } from "react";
import Modal from "./ui/Modal";
import Button from "./ui/Button";
import { useLang, useT } from "@/lib/i18n";
import { importAnyFile } from "@/lib/import-client";

type ExportChoice = "gedcom" | "gedcom7" | "gedzip" | "csv" | "json" | "xlsx" | "book";

interface Props {
  peopleCount: number;
  onClose: () => void;
  onImported: (count: number) => void;
  /** "Aile Kitabı" dışa aktarımı — bası (PDF) görünümünü açar. */
  onPrintBook: () => void;
}

export default function GedcomDialog({ peopleCount, onClose, onImported, onPrintBook }: Props) {
  const t = useT();
  const { lang } = useLang();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [exportFmt, setExportFmt] = useState<ExportChoice>("gedcom");
  const [busy, setBusy] = useState<"" | "export" | "import">("");
  const [error, setError] = useState("");

  const handleExport = async () => {
    // "Aile Kitabı" = bası (PDF) görünümü; dosya indirmek yerine kitabı açar.
    if (exportFmt === "book") {
      onPrintBook();
      return;
    }
    setBusy("export");
    setError("");
    try {
      const res = await fetch(`/api/family/export?format=${exportFmt}`);
      if (!res.ok) throw new Error(t("gedcom.exportFailed"));
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") ?? "";
      // GEDCOM 7 dosyası da .ged uzantısıdır; sürüm başlıkta yazar.
      // GEDZIP ise bir paket: .gdz.
      const ext =
        exportFmt === "gedcom" || exportFmt === "gedcom7"
          ? "ged"
          : exportFmt === "gedzip"
          ? "gdz"
          : exportFmt;
      const name = cd.match(/filename="([^"]+)"/)?.[1] ?? `aile-agaci.${ext}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy("");
    }
  };

  // Tek "Dosya seç": dosya türüne göre normal içe aktarma ↔ yapay zekâ dağıtımı
  // (importAnyFile). .ftz/GEDCOM/CSV/JSON yapısal; foto/PDF/Excel/Word yapay zekâ.
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy("import");
    setError("");
    try {
      const count = await importAnyFile(file, {
        mode,
        lang: lang === "en" ? "en" : "tr",
        aiNotConfigured: t("ai.story.notConfigured"),
        emptyMessage: t("gedcom.importEmpty"),
      });
      onImported(count);
    } catch (err) {
      setError((err as Error).message);
      setBusy("");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <Modal
      title={t("common.gedcom")}
      subtitle={t("gedcom.subtitle")}
      onClose={onClose}
    >
      <div className="space-y-6">
        {/*
          BOŞ AĞAÇTA DIŞA AKTARMA YOK (madde 40).

          Sıfır kişiyi dışa aktarmak anlamsız; üstelik e-Devlet belgesiyle
          gelen yeni kullanıcı ilk temasta önce bir "dışa aktar" bloğuyla
          karşılaşıyordu. İçe aktarma zaten aşağıda ve tek anlamlı eylem o.
        */}
        {peopleCount > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-text mb-1">{t("gedcom.exportTitle")}</h3>
          <p className="text-xs text-text-muted leading-relaxed mb-3">
            {t("gedcom.exportBody2", { count: peopleCount })}
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-1 p-1 rounded-xl bg-surface-2 border border-border mb-3">
            {([
              { v: "gedcom", l: "GEDCOM 5.5.1" },
              { v: "gedcom7", l: "GEDCOM 7" },
              { v: "gedzip", l: "GEDZIP" },
              { v: "csv", l: "CSV" },
              { v: "json", l: "JSON" },
              { v: "xlsx", l: t("gedcom.fmtExcel") },
              { v: "book", l: t("gedcom.fmtBook") },
            ] as const).map((f) => (
              <button
                key={f.v}
                type="button"
                onClick={() => setExportFmt(f.v)}
                className={`h-8 rounded-lg text-xs font-medium transition-all ${
                  exportFmt === f.v ? "bg-bg-elevated text-text shadow-soft" : "text-text-muted hover:text-text"
                }`}
              >
                {f.l}
              </button>
            ))}
          </div>
          <Button variant="secondary" size="sm" onClick={handleExport} disabled={busy !== ""}>
            {busy === "export" ? t("gedcom.preparing") : t("gedcom.export")}
          </Button>
        </section>
        )}

        {peopleCount > 0 && <div className="h-px bg-border" />}

        {/* İçe aktar */}
        <section>
          <h3 className="text-sm font-semibold text-text mb-1">{t("gedcom.importTitle")}</h3>
          <p className="text-xs text-text-muted leading-relaxed mb-2">
            {t("gedcom.importBodyBefore")}{" "}
            <span className="text-text">{t("gedcom.importBodyAfter")}</span>
          </p>
          <p className="text-[11px] text-text-subtle leading-relaxed mb-3">{t("common.import.formatsNote")}</p>

          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-surface-2 border border-border mb-3">
            {([
              { v: "merge", l: t("gedcom.modeMerge") },
              { v: "replace", l: t("gedcom.modeReplace") },
            ] as const).map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => setMode(o.v)}
                className={`h-8 rounded-lg text-xs font-medium transition-all ${
                  mode === o.v ? "bg-bg-elevated text-text shadow-soft" : "text-text-muted hover:text-text"
                }`}
              >
                {o.l}
              </button>
            ))}
          </div>

          {mode === "replace" && peopleCount > 0 && (
            <p className="text-[11px] text-danger bg-danger-soft px-3 py-2 rounded-lg mb-3 leading-relaxed">
              {t("gedcom.replaceWarn", { count: peopleCount })}
            </p>
          )}

          <Button
            variant="secondary"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={busy !== ""}
          >
            {busy === "import" ? t("gedcom.importing") : t("gedcom.chooseFile")}
          </Button>
          <input
            ref={fileRef}
            type="file"
            /* accept KISITI YOK: iOS, tanımadığı uzantıları (.ftz gibi) accept
               listesi varken soluk/seçilemez yapıyor. Biçimi arka uç doğruluyor
               (GEDCOM/.ftz/CSV/JSON/PDF) ya da yapay zekâ tanıyor; tüm dosyalar seçilebilir. */
            className="hidden"
            onChange={handleFile}
          />
        </section>

        {error && (
          <p className="text-xs text-danger bg-danger-soft px-3 py-2.5 rounded-xl">{error}</p>
        )}
      </div>
    </Modal>
  );
}
