"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { Person } from "@/types/family";
import TopBar, { type ViewKey } from "@/components/TopBar";
import PersonDrawer from "@/components/PersonDrawer";
import CommandPalette from "@/components/CommandPalette";
import GedcomDialog from "@/components/GedcomDialog";
import EmptyState from "@/components/EmptyState";
import ListView from "@/components/ListView";
import PanelView from "@/components/PanelView";
import PedigreeView from "@/components/PedigreeView";
import Modal from "@/components/ui/Modal";
import PersonForm from "@/components/PersonForm";
import { RELATION_LABELS, type RelationType } from "@/lib/actions";
import { ancestorDepths, indexPeople } from "@/lib/relations";

const FamilyTree = dynamic(() => import("@/components/FamilyTree"), {
  ssr: false,
  loading: () => (
    <div className="h-full grid place-items-center">
      <div className="flex items-center gap-2.5 text-text-subtle text-sm">
        <span className="w-4 h-4 rounded-full border-2 border-border border-t-primary animate-spin" />
        Ağaç yükleniyor…
      </div>
    </div>
  ),
});

interface EditorState {
  personId?: string;
  relation?: { type: RelationType; target: Person };
}

export default function Workspace({
  people,
  familyName,
  initialSelectedId,
}: {
  people: Person[];
  familyName?: string;
  initialSelectedId?: string;
}) {
  const router = useRouter();

  const [view, setView] = useState<ViewKey>("agac");
  const [selectedId, setSelectedId] = useState<string | undefined>(initialSelectedId);
  const [rootId, setRootId] = useState<string | undefined>(initialSelectedId);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [gedcomOpen, setGedcomOpen] = useState(false);
  const [toast, setToast] = useState<string>();

  const idx = useMemo(() => indexPeople(people), [people]);
  const selected = selectedId ? idx.get(selectedId) : undefined;
  /**
   * Soy görünümünün kökü ve akrabalık rozetinin referansı.
   * Kullanıcı bir kök seçmediyse en uzun ata zincirine sahip kişiyi alıyoruz —
   * böylece soy görünümü boş açılmıyor.
   */
  const varsayilanKok = useMemo(() => {
    let bestId: string | undefined;
    let bestDepth = -1;
    for (const p of people) {
      let d = 0;
      for (const v of ancestorDepths(p.id, idx).values()) if (v > d) d = v;
      if (d > bestDepth) {
        bestDepth = d;
        bestId = p.id;
      }
    }
    return bestId;
  }, [people, idx]);

  const effectiveRoot = (rootId && idx.has(rootId) ? rootId : undefined) ?? varsayilanKok;

  /* Klavye kısayolları */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(undefined), 3200);
  }, []);

  const openAdd = useCallback(() => setEditor({}), []);

  const openEdit = useCallback((id: string) => setEditor({ personId: id }), []);

  const openQuickAdd = useCallback(
    (type: RelationType, targetId: string) => {
      const target = idx.get(targetId);
      if (!target) return;
      setEditor({ relation: { type, target } });
    },
    [idx]
  );

  const handleSaved = useCallback(
    (person: Person) => {
      setEditor(null);
      setSelectedId(person.id);
      if (!rootId) setRootId(person.id);
      router.refresh();
    },
    [router, rootId]
  );

  const handleDeleted = useCallback(() => {
    setSelectedId(undefined);
    notify("Kişi silindi");
    router.refresh();
  }, [router, notify]);

  const handleImported = useCallback(
    (count: number) => {
      setGedcomOpen(false);
      notify(`${count} kişi içe aktarıldı`);
      router.refresh();
    },
    [router, notify]
  );

  const focusPerson = useCallback((id: string) => {
    setRootId(id);
    setView("soy");
  }, []);

  const isEmpty = people.length === 0;

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopBar
        familyName={familyName}
        view={view}
        onViewChange={setView}
        onSearch={() => setPaletteOpen(true)}
        onImportExport={() => setGedcomOpen(true)}
        peopleCount={people.length}
      />

      <main
        className={`flex-1 min-h-0 relative transition-[padding] duration-300 ${
          selected ? "lg:pr-[380px]" : ""
        }`}
      >
        {isEmpty ? (
          <EmptyState onAdd={openAdd} onImport={() => setGedcomOpen(true)} />
        ) : view === "agac" ? (
          <FamilyTree
            people={people}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onQuickAdd={openQuickAdd}
          />
        ) : view === "soy" ? (
          <PedigreeView
            people={people}
            rootId={effectiveRoot}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onSetRoot={setRootId}
            onQuickAdd={openQuickAdd}
          />
        ) : view === "liste" ? (
          <ListView
            people={people}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onAdd={openAdd}
          />
        ) : (
          <PanelView
            people={people}
            onSelect={setSelectedId}
            onAdd={openAdd}
            onImportExport={() => setGedcomOpen(true)}
          />
        )}

        {/* Kayan ekle düğmesi — ağaç ve soy görünümünde */}
        {!isEmpty && (view === "agac" || view === "soy") && (
          <button
            onClick={openAdd}
            className="
              absolute bottom-6 right-4 lg:right-[400px] z-20
              h-12 pl-4 pr-5 rounded-full
              bg-primary text-primary-text font-medium text-sm
              shadow-float hover:brightness-110 active:translate-y-px
              flex items-center gap-2 transition-all
            "
          >
            <svg width="15" height="15" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
            Kişi ekle
          </button>
        )}
      </main>

      {/* Detay paneli */}
      {selected && (
        <PersonDrawer
          key={selected.id}
          person={selected}
          people={people}
          referenceId={effectiveRoot !== selected.id ? effectiveRoot : undefined}
          onClose={() => setSelectedId(undefined)}
          onSelect={setSelectedId}
          onEdit={openEdit}
          onQuickAdd={openQuickAdd}
          onFocus={focusPerson}
          onDeleted={handleDeleted}
        />
      )}

      {/* Ekle / düzenle */}
      {editor && (
        <Modal
          title={
            editor.personId
              ? "Kişiyi düzenle"
              : editor.relation
              ? RELATION_LABELS[editor.relation.type].title
              : "Yeni kişi ekle"
          }
          subtitle={
            editor.relation
              ? `${editor.relation.target.firstName} ${editor.relation.target.lastName}`
              : undefined
          }
          onClose={() => setEditor(null)}
        >
          <PersonForm
            people={people}
            initial={editor.personId ? idx.get(editor.personId) : undefined}
            personId={editor.personId}
            relation={editor.relation}
            onCancel={() => setEditor(null)}
            onSaved={handleSaved}
          />
        </Modal>
      )}

      {/* Arama */}
      {paletteOpen && (
        <CommandPalette
          people={people}
          onSelect={setSelectedId}
          onClose={() => setPaletteOpen(false)}
          onAdd={openAdd}
        />
      )}

      {/* GEDCOM */}
      {gedcomOpen && (
        <GedcomDialog
          peopleCount={people.length}
          onClose={() => setGedcomOpen(false)}
          onImported={handleImported}
        />
      )}

      {/* Bildirim */}
      {toast && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] px-4 py-2.5 rounded-xl bg-text text-bg text-sm font-medium shadow-modal animate-pop"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
