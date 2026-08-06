"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { Person } from "@/types/family";
import PersonModal from "@/components/PersonModal";

const FamilyTree = dynamic(() => import("@/components/FamilyTree"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <div className="text-gray-400">Ağaç yükleniyor…</div>
    </div>
  ),
});

export default function TreeClient({ people }: { people: Person[] }) {
  const router = useRouter();
  const [modal, setModal] = useState<{ open: boolean; personId?: string }>({ open: false });
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const openAdd = useCallback(() => setModal({ open: true }), []);
  const closeModal = useCallback(() => setModal({ open: false }), []);
  const handleSaved = useCallback(() => router.refresh(), [router]);

  const handleExport = async () => {
    const res = await fetch("/api/family/export");
    if (!res.ok) return;
    const blob = await res.blob();
    const cd = res.headers.get("Content-Disposition") ?? "";
    const name = cd.match(/filename="([^"]+)"/)?.[1] ?? "aile-agaci.ged";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportMsg(null);

    const fd = new FormData();
    fd.append("file", file);
    fd.append("mode", "merge");

    const res = await fetch("/api/family/import", { method: "POST", body: fd });
    const data = await res.json();
    setImporting(false);

    if (res.ok) {
      setImportMsg({ text: `${data.count} kişi içe aktarıldı`, ok: true });
      router.refresh();
    } else {
      setImportMsg({ text: data.error ?? "İçe aktarma hatası", ok: false });
    }

    if (fileRef.current) fileRef.current.value = "";
    setTimeout(() => setImportMsg(null), 4000);
  };

  return (
    <div className="relative w-full h-full">
      <FamilyTree people={people} onAddPerson={openAdd} />

      {/* GEDCOM toolbar — bottom left */}
      <div className="absolute bottom-6 left-6 z-10 flex flex-col items-start gap-2">
        {importMsg && (
          <div className={`px-3 py-1.5 rounded-lg text-xs font-medium shadow ${importMsg.ok ? "bg-green-700 text-white" : "bg-red-600 text-white"}`}>
            {importMsg.text}
          </div>
        )}
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            title="GEDCOM olarak indir"
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg shadow text-gray-700 hover:bg-gray-50 transition-colors text-xs font-medium"
          >
            ⬇ GEDCOM
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            title="GEDCOM dosyası yükle"
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg shadow text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors text-xs font-medium"
          >
            {importing ? "Yükleniyor…" : "⬆ GEDCOM"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".ged,.gedcom"
            className="hidden"
            onChange={handleImportFile}
          />
        </div>
      </div>

      {/* Floating Add Button — bottom right */}
      <button
        onClick={openAdd}
        className="absolute bottom-6 right-6 z-10 flex items-center gap-1.5 px-4 py-2.5 bg-green-700 hover:bg-green-800 text-white font-semibold rounded-full shadow-lg transition-colors text-sm"
      >
        <span className="text-xl leading-none font-light">+</span>
        <span>Kişi Ekle</span>
      </button>

      {modal.open && (
        <PersonModal
          people={people}
          personId={modal.personId}
          onClose={closeModal}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
