"use client";

import { useRef, useState } from "react";
import Modal from "./ui/Modal";
import Button from "./ui/Button";
import { useT } from "@/lib/i18n";

interface Props {
  peopleCount: number;
  onClose: () => void;
  onImported: (count: number) => void;
  onDemoLoaded: (count: number) => void;
}

export default function GedcomDialog({ peopleCount, onClose, onImported, onDemoLoaded }: Props) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [exportFmt, setExportFmt] = useState<"gedcom" | "csv" | "json">("gedcom");
  const [busy, setBusy] = useState<"" | "export" | "import" | "demo">("");
  const [error, setError] = useState("");
  const [demoOnay, setDemoOnay] = useState(false);

  const handleDemo = async () => {
    setBusy("demo");
    setError("");
    try {
      const res = await fetch("/api/family/demo", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? t("gedcom.demoFailed"));
      onDemoLoaded(data.count ?? 0);
    } catch (err) {
      setError((err as Error).message);
      setBusy("");
    }
  };

  const handleExport = async () => {
    setBusy("export");
    setError("");
    try {
      const res = await fetch(`/api/family/export?format=${exportFmt}`);
      if (!res.ok) throw new Error(t("gedcom.exportFailed"));
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") ?? "";
      const ext = exportFmt === "gedcom" ? "ged" : exportFmt;
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

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy("import");
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mode", mode);
      const res = await fetch("/api/family/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? t("gedcom.importFailed"));
      onImported(data.count ?? 0);
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
        {/* Dışa aktar */}
        <section>
          <h3 className="text-sm font-semibold text-text mb-1">{t("gedcom.exportTitle")}</h3>
          <p className="text-xs text-text-muted leading-relaxed mb-3">
            {t("gedcom.exportBodyBefore", { count: peopleCount })}{" "}
            <code className="text-[11px] px-1 py-0.5 rounded bg-surface-2">{t("common.export.formatLabel")}</code>{" "}
            {t("gedcom.exportBodyAfter")}
          </p>
          <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-surface-2 border border-border mb-3">
            {(["gedcom", "csv", "json"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setExportFmt(f)}
                className={`h-8 rounded-lg text-xs font-medium uppercase transition-all ${
                  exportFmt === f ? "bg-bg-elevated text-text shadow-soft" : "text-text-muted hover:text-text"
                }`}
              >
                {f === "gedcom" ? "GEDCOM" : f.toUpperCase()}
              </button>
            ))}
          </div>
          <Button variant="secondary" size="sm" onClick={handleExport} disabled={busy !== ""}>
            {busy === "export" ? t("gedcom.preparing") : t("gedcom.download")}
          </Button>
        </section>

        <div className="h-px bg-border" />

        {/* İçe aktar */}
        <section>
          <h3 className="text-sm font-semibold text-text mb-1">{t("gedcom.importTitle")}</h3>
          <p className="text-xs text-text-muted leading-relaxed mb-2">
            {t("gedcom.importBodyBefore")}{" "}
            <code className="text-[11px] px-1 py-0.5 rounded bg-surface-2">.ged</code>{" "}
            {t("gedcom.importBodyAfter")}
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
            accept=".ged,.gedcom,.csv,.tsv,.json,.txt,.ftz,.pdf,text/plain,text/csv,application/json,application/pdf"
            className="hidden"
            onChange={handleImport}
          />
        </section>

        <div className="h-px bg-border" />

        {/* Demo ağacı */}
        <section>
          <h3 className="text-sm font-semibold text-text mb-1">{t("gedcom.demoTitle")}</h3>
          <p className="text-xs text-text-muted leading-relaxed mb-3">
            {t("gedcom.demoBody")}
          </p>

          {demoOnay || peopleCount === 0 ? (
            <div className="space-y-2.5">
              {peopleCount > 0 && (
                <p className="text-[11px] text-danger bg-danger-soft px-3 py-2 rounded-lg leading-relaxed">
                  {t("gedcom.demoReplaceWarn", { count: peopleCount })}
                </p>
              )}
              <div className="flex gap-2">
                <Button size="sm" onClick={handleDemo} disabled={busy !== ""}>
                  {busy === "demo" ? t("gedcom.demoLoading") : t("gedcom.loadDemo")}
                </Button>
                {peopleCount > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => setDemoOnay(false)}>
                    {t("gedcom.cancel")}
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setDemoOnay(true)}
              disabled={busy !== ""}
            >
              {t("gedcom.loadDemo")}
            </Button>
          )}
        </section>

        {error && (
          <p className="text-xs text-danger bg-danger-soft px-3 py-2.5 rounded-xl">{error}</p>
        )}
      </div>
    </Modal>
  );
}
