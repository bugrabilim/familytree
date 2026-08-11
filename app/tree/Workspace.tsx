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
import Avatar from "@/components/ui/Avatar";
import PersonForm from "@/components/PersonForm";
import { RELATION_LABELS, type RelationType } from "@/lib/actions";
import { ancestorDepths, descendantDepths, indexPeople } from "@/lib/relations";

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
  const [demoLoading, setDemoLoading] = useState(false);
  /**
   * Ağaçta ne gösterilsin:
   *  n > 0 → odak kişinin n kuşak atası + n kuşak soyu
   *  -1    → odak kişinin TÜM atası ve TÜM soyu (bağlı olduğu herkes)
   *   0    → ağaçtaki herkes
   */
  const [treeDepth, setTreeDepth] = useState(3);
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

  /**
   * Ağaç görünümünde gösterilecek kişiler — odak kişinin çevresindeki
   * "kum saati" (hourglass): N kuşak ata + N kuşak soy + eşler + kardeşler.
   *
   * Yüzlerce kişilik bir ağacın tamamı tek ekranda okunmuyor; olgun soy
   * ağacı araçları da bu yüzden kuşak sınırı sunuyor.
   */
  const treeFocusId = selectedId && idx.has(selectedId) ? selectedId : effectiveRoot;

  const treePeople = useMemo(() => {
    if (treeDepth === 0 || !treeFocusId) return people;

    const sinirsiz = treeDepth < 0;
    const keep = new Set<string>([treeFocusId]);
    for (const [id, d] of ancestorDepths(treeFocusId, idx)) if (sinirsiz || d <= treeDepth) keep.add(id);
    for (const [id, d] of descendantDepths(treeFocusId, people)) if (sinirsiz || d <= treeDepth) keep.add(id);

    // Tüm soy modunda ataların diğer çocukları da (kardeşler, amcalar, kuzenler)
    if (sinirsiz) {
      let buyudu = true;
      while (buyudu) {
        buyudu = false;
        for (const p of people) {
          if (keep.has(p.id)) continue;
          if (p.parentIds.some((pid) => keep.has(pid))) {
            keep.add(p.id);
            buyudu = true;
          }
        }
      }
    }

    // Odak kişinin kardeşleri
    const focus = idx.get(treeFocusId);
    if (focus?.parentIds.length) {
      for (const p of people) {
        if (p.parentIds.some((pid) => focus.parentIds.includes(pid))) keep.add(p.id);
      }
    }
    // Kalanların eşleri — çiftler bölünmesin
    for (const id of [...keep]) {
      const p = idx.get(id);
      if (!p) continue;
      for (const s of [...p.spouseIds, ...(p.formerSpouseIds ?? [])]) {
        if (idx.has(s)) keep.add(s);
      }
    }
    return people.filter((p) => keep.has(p.id));
  }, [people, idx, treeFocusId, treeDepth]);

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

  const handleDemoLoaded = useCallback(
    (count: number) => {
      setGedcomOpen(false);
      setDemoLoading(false);
      setSelectedId(undefined);
      setRootId(undefined);
      notify(`Demo ağacı yüklendi — ${count} kişi`);
      router.refresh();
    },
    [router, notify]
  );

  /** Boş durumdan tek tıkla demo yükle */
  const loadDemoDirect = useCallback(async () => {
    setDemoLoading(true);
    try {
      const res = await fetch("/api/family/demo", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Demo yüklenemedi.");
      handleDemoLoaded(data.count ?? 0);
    } catch (err) {
      setDemoLoading(false);
      notify((err as Error).message);
    }
  }, [handleDemoLoaded, notify]);

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
          <EmptyState
            onAdd={openAdd}
            onImport={() => setGedcomOpen(true)}
            onDemo={loadDemoDirect}
            demoLoading={demoLoading}
          />
        ) : view === "agac" ? (
          <>
            <FamilyTree
              people={treePeople}
              selectedId={selectedId}
              focusId={treeFocusId}
              onSelect={setSelectedId}
              onQuickAdd={openQuickAdd}
            />
            <TreeDepthControl
              depth={treeDepth}
              onChange={setTreeDepth}
              shown={treePeople.length}
              total={people.length}
              focusPerson={treeFocusId ? idx.get(treeFocusId) : undefined}
              onGoToFocus={() => treeFocusId && setSelectedId(treeFocusId)}
            />
          </>
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
          onDemoLoaded={handleDemoLoaded}
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

/* ---------------------------------------------------------------- */

function TreeDepthControl({
  depth,
  onChange,
  shown,
  total,
  focusPerson,
  onGoToFocus,
}: {
  depth: number;
  onChange: (d: number) => void;
  shown: number;
  total: number;
  focusPerson?: Person;
  onGoToFocus: () => void;
}) {
  if (total <= 25) return null;

  const secenekler: Array<{ d: number; l: string; ipucu: string }> = [
    { d: 2, l: "2", ipucu: "2 kuşak yukarı ve aşağı" },
    { d: 3, l: "3", ipucu: "3 kuşak yukarı ve aşağı" },
    { d: 4, l: "4", ipucu: "4 kuşak yukarı ve aşağı" },
    { d: -1, l: "Tüm akrabaları", ipucu: "Bu kişinin bağlı olduğu herkes — bütün atalar, tüm soy ve aradaki dallar" },
    { d: 0, l: "Herkes", ipucu: "Ağaçtaki bütün kayıtlar" },
  ];

  return (
    <div className="absolute top-4 left-4 z-10 flex items-center gap-2 h-9 pl-1.5 pr-2 rounded-xl bg-bg-elevated/90 backdrop-blur border border-border shadow-card">
      {focusPerson && (
        <button
          onClick={onGoToFocus}
          title="Odak kişiye dön"
          className="flex items-center gap-1.5 h-7 pl-1 pr-2 rounded-lg hover:bg-surface-2 transition-colors"
        >
          <Avatar person={focusPerson} size="xs" />
          <span className="text-[11px] font-medium text-text whitespace-nowrap">
            {focusPerson.firstName}
          </span>
        </button>
      )}
      <span className="h-4 w-px bg-border" />
      <div className="flex items-center gap-0.5">
        {secenekler.map((o) => (
          <button
            key={o.d}
            onClick={() => onChange(o.d)}
            title={o.ipucu}
            className={`h-6 px-1.5 rounded-md text-[11px] font-medium whitespace-nowrap transition-colors ${
              depth === o.d
                ? "bg-primary text-primary-text"
                : "text-text-muted hover:text-text hover:bg-surface-2"
            }`}
          >
            {o.l}
          </button>
        ))}
      </div>
      <span className="text-[11px] text-text-subtle tabular-nums whitespace-nowrap border-l border-border pl-2">
        {shown}/{total}
      </span>
    </div>
  );
}
