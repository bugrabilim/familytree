"use client";

import { useRef, useState } from "react";
import Modal from "./ui/Modal";
import Button from "./ui/Button";
import { useLang, useT } from "@/lib/i18n";

interface Props {
  peopleCount: number;
  onClose: () => void;
  onImported: (count: number) => void;
  onDemoLoaded: (count: number) => void;
  onCleared: () => void;
}

export default function GedcomDialog({ peopleCount, onClose, onImported, onDemoLoaded, onCleared }: Props) {
  const t = useT();
  const { lang } = useLang();
  const fileRef = useRef<HTMLInputElement>(null);
  const aiRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [exportFmt, setExportFmt] = useState<"gedcom" | "csv" | "json">("gedcom");
  const [busy, setBusy] = useState<"" | "export" | "import" | "ai" | "demo" | "clear">("");
  const [error, setError] = useState("");
  const [demoOnay, setDemoOnay] = useState(false);
  const [clearOnay, setClearOnay] = useState(false);

  const handleClear = async () => {
    setBusy("clear");
    setError("");
    try {
      const res = await fetch("/api/family/clear", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? t("gedcom.clearFailed"));
      onCleared();
    } catch (err) {
      setError((err as Error).message);
      setBusy("");
    }
  };

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
      if (!data.count) throw new Error(t("gedcom.importEmpty"));
      onImported(data.count);
    } catch (err) {
      setError((err as Error).message);
      setBusy("");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleAiImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy("ai");
    setError("");
    // Yapısal soy dosyaları (.ftz / GEDCOM / CSV / JSON) yapay zekâ ile değil,
    // doğrudan içe aktarıcıyla çözülür — .ftz ikili bir ZIP olduğundan AI onu
    // okuyamaz. Kullanıcı yanlış kutuyu seçse de doğru yola yönlendiriyoruz.
    const structured = /\.(ftz|ged|gedcom|csv|tsv|json)$/i.test(file.name || "");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mode", mode);
      let res: Response;
      if (structured) {
        res = await fetch("/api/family/import", { method: "POST", body: fd });
      } else {
        fd.append("lang", lang === "en" ? "en" : "tr");
        res = await fetch("/api/ai/extract", { method: "POST", body: fd });
      }
      const data = await res.json();
      if (res.status === 503) throw new Error(t("ai.story.notConfigured"));
      if (!res.ok) throw new Error(data?.error ?? t("gedcom.importFailed"));
      if (!data.count) throw new Error(t("gedcom.importEmpty"));
      onImported(data.count);
    } catch (err) {
      setError((err as Error).message);
      setBusy("");
    } finally {
      if (aiRef.current) aiRef.current.value = "";
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
               (GEDCOM/.ftz/CSV/JSON/PDF), o yüzden tüm dosyalar seçilebilir. */
            className="hidden"
            onChange={handleImport}
          />

          {/* Yapay zekâ ile herhangi bir dosyadan içe aktarma (madde 7) */}
          <div className="mt-4 rounded-xl border border-primary/25 bg-primary-soft/40 p-3.5">
            <p className="text-sm font-semibold text-text mb-0.5">✨ {t("ai.import.title")}</p>
            <p className="text-xs text-text-muted leading-relaxed mb-2.5">{t("ai.import.body")}</p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => aiRef.current?.click()}
              disabled={busy !== ""}
            >
              {busy === "ai" ? t("ai.import.working") : t("ai.import.choose")}
            </Button>
            <input
              ref={aiRef}
              type="file"
              className="hidden"
              onChange={handleAiImport}
            />
          </div>
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

        {peopleCount > 0 && (
          <>
            <div className="h-px bg-border" />
            {/* Tehlikeli bölge — tüm kişileri tek seferde sil (geri alınamaz). */}
            <section>
              <h3 className="text-sm font-semibold text-danger mb-1">{t("gedcom.clearTitle")}</h3>
              <p className="text-xs text-text-muted leading-relaxed mb-3">{t("gedcom.clearBody")}</p>
              {clearOnay ? (
                <div className="space-y-2.5">
                  <p className="text-[11px] text-danger bg-danger-soft px-3 py-2 rounded-lg leading-relaxed">
                    {t("gedcom.clearWarn", { count: peopleCount })}
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="danger" onClick={handleClear} disabled={busy !== ""}>
                      {busy === "clear" ? t("gedcom.clearing") : t("gedcom.clearConfirm", { count: peopleCount })}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setClearOnay(false)} disabled={busy !== ""}>
                      {t("gedcom.cancel")}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => setClearOnay(true)} disabled={busy !== ""}>
                  {t("gedcom.clearButton")}
                </Button>
              )}
            </section>
          </>
        )}

        {error && (
          <p className="text-xs text-danger bg-danger-soft px-3 py-2.5 rounded-xl">{error}</p>
        )}
      </div>
    </Modal>
  );
}
