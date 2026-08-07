"use client";

import { useRef, useState } from "react";
import Modal from "./ui/Modal";
import Button from "./ui/Button";

interface Props {
  peopleCount: number;
  onClose: () => void;
  onImported: (count: number) => void;
  onDemoLoaded: (count: number) => void;
}

export default function GedcomDialog({ peopleCount, onClose, onImported, onDemoLoaded }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [busy, setBusy] = useState<"" | "export" | "import" | "demo">("");
  const [error, setError] = useState("");
  const [demoOnay, setDemoOnay] = useState(false);

  const handleDemo = async () => {
    setBusy("demo");
    setError("");
    try {
      const res = await fetch("/api/family/demo", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Demo yüklenemedi.");
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
      const res = await fetch("/api/family/export");
      if (!res.ok) throw new Error("Dışa aktarma başarısız oldu.");
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") ?? "";
      const name = cd.match(/filename="([^"]+)"/)?.[1] ?? "aile-agaci.ged";
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
      if (!res.ok) throw new Error(data?.error ?? "İçe aktarma başarısız oldu.");
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
      title="GEDCOM aktar / al"
      subtitle="Tüm soy ağacı programlarının ortak dosya biçimi"
      onClose={onClose}
    >
      <div className="space-y-6">
        {/* Dışa aktar */}
        <section>
          <h3 className="text-sm font-semibold text-text mb-1">Dışa aktar</h3>
          <p className="text-xs text-text-muted leading-relaxed mb-3">
            {peopleCount} kişilik ağacını <code className="text-[11px] px-1 py-0.5 rounded bg-surface-2">.ged</code>{" "}
            dosyası olarak indir. MyHeritage, Ancestry, FamilySearch, Gramps ve
            diğerlerine yükleyebilirsin.
          </p>
          <Button variant="secondary" size="sm" onClick={handleExport} disabled={busy !== ""}>
            {busy === "export" ? "Hazırlanıyor…" : "GEDCOM indir"}
          </Button>
        </section>

        <div className="h-px bg-border" />

        {/* İçe aktar */}
        <section>
          <h3 className="text-sm font-semibold text-text mb-1">İçe aktar</h3>
          <p className="text-xs text-text-muted leading-relaxed mb-3">
            Başka bir programdan indirdiğin <code className="text-[11px] px-1 py-0.5 rounded bg-surface-2">.ged</code>{" "}
            dosyasını buraya yükle. Kişiler, tarihler ve aile bağları aktarılır.
          </p>

          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-surface-2 border border-border mb-3">
            {([
              { v: "merge", l: "Mevcuda ekle" },
              { v: "replace", l: "Hepsini değiştir" },
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
              Dikkat: mevcut {peopleCount} kişi silinip dosyadaki kayıtlarla değiştirilecek.
            </p>
          )}

          <Button
            variant="secondary"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={busy !== ""}
          >
            {busy === "import" ? "Aktarılıyor…" : "Dosya seç"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".ged,.gedcom,text/plain"
            className="hidden"
            onChange={handleImport}
          />
        </section>

        <div className="h-px bg-border" />

        {/* Demo ağacı */}
        <section>
          <h3 className="text-sm font-semibold text-text mb-1">Demo ağacı</h3>
          <p className="text-xs text-text-muted leading-relaxed mb-3">
            11 kuşaklık örnek bir aile: 1730&apos;lardan bugüne 172 kişi. Soyadı
            Kanunu öncesi lakaplar, çok eşlilik, boşanmalar, akraba evlilikleri,
            göç ve savaş kayıpları — uygulamanın tüm özelliklerini gösterir.
          </p>

          {demoOnay || peopleCount === 0 ? (
            <div className="space-y-2.5">
              {peopleCount > 0 && (
                <p className="text-[11px] text-danger bg-danger-soft px-3 py-2 rounded-lg leading-relaxed">
                  Mevcut {peopleCount} kişi silinip demo ağacıyla değiştirilecek.
                  Önce GEDCOM olarak yedek almak isteyebilirsin.
                </p>
              )}
              <div className="flex gap-2">
                <Button size="sm" onClick={handleDemo} disabled={busy !== ""}>
                  {busy === "demo" ? "Yükleniyor…" : "Demo ağacını yükle"}
                </Button>
                {peopleCount > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => setDemoOnay(false)}>
                    Vazgeç
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
              Demo ağacını yükle
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
