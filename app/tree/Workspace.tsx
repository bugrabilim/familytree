"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { Person } from "@/types/family";
import type { TreeRole } from "@/types/user";
import type { TreeMeta } from "@/lib/trees";
import TopBar, { type ViewKey } from "@/components/TopBar";
import PersonDrawer from "@/components/PersonDrawer";
import CommandPalette from "@/components/CommandPalette";
import GedcomDialog from "@/components/GedcomDialog";
import AiChat from "@/components/AiChat";
import PrintView from "@/components/PrintView";
import BookView from "@/components/BookView";
import MembersDialog from "@/components/MembersDialog";
import ShareDialog from "@/components/ShareDialog";
import PairDialog from "@/components/PairDialog";
import EmptyState from "@/components/EmptyState";
import ListView from "@/components/ListView";
import PanelView from "@/components/PanelView";
import PedigreeView from "@/components/PedigreeView";
import FanChart from "@/components/FanChart";
import TimelineView from "@/components/TimelineView";
import Modal from "@/components/ui/Modal";
import Avatar from "@/components/ui/Avatar";
import PersonForm from "@/components/PersonForm";
import { PrivacyProvider } from "@/components/PrivacyContext";
import { ReadOnlyProvider, useReadOnly } from "@/components/ReadOnlyContext";
import { setBaseVersion, type RelationType } from "@/lib/actions";
import { ancestorDepths, descendantDepths, indexPeople } from "@/lib/relations";
import { useT } from "@/lib/i18n";

function TreeLoading() {
  const t = useT();
  return (
    <div className="h-full grid place-items-center">
      <div className="flex items-center gap-2.5 text-text-subtle text-sm">
        <span className="w-4 h-4 rounded-full border-2 border-border border-t-primary animate-spin" />
        {t("ws.treeLoading")}
      </div>
    </div>
  );
}

const FamilyTree = dynamic(() => import("@/components/FamilyTree"), {
  ssr: false,
  loading: () => <TreeLoading />,
});

const PlacesMap = dynamic(() => import("@/components/PlacesMap"), { ssr: false });

/** "Tümü" seçeneği için kuşak sınırı sentineli — 0..8 gerçek derinlikler */
const HERKES = 999;

interface EditorState {
  personId?: string;
  relation?: { type: RelationType; target: Person };
}

export default function Workspace(props: {
  people: Person[];
  version: string;
  familyName?: string;
  displayName?: string;
  role?: TreeRole;
  trees?: Array<TreeMeta & { home: boolean }>;
  activeTreeId?: string;
  isFounder?: boolean;
  initialSelectedId?: string;
  /** Herkese açık salt-okunur paylaşım görünümü (üyeliksiz genel ziyaretçi). */
  publicView?: boolean;
  /** publicView iken yaşayan-gizleme kilit değeri (sahibin tercihi). */
  hideLivingForced?: boolean;
}) {
  // Sağlayıcılar iç içe: görüntüleme modu + gizlilik. WorkspaceInner her ikisini de
  // tüketebilsin diye asıl mantık sağlayıcıların içindeki bir bileşene taşındı.
  // Rol "viewer" ya da genel paylaşım ise salt-okunur zorlanır (sunucu da reddeder).
  const forcedViewer = props.role === "viewer" || !!props.publicView;
  return (
    <ReadOnlyProvider forced={forcedViewer}>
      <PrivacyProvider forced={forcedViewer} forcedValue={props.publicView ? props.hideLivingForced : undefined}>
        <WorkspaceInner {...props} />
      </PrivacyProvider>
    </ReadOnlyProvider>
  );
}

function WorkspaceInner({
  people,
  version,
  familyName,
  role = "admin",
  trees,
  activeTreeId,
  isFounder,
  initialSelectedId,
  publicView,
}: {
  people: Person[];
  version: string;
  familyName?: string;
  displayName?: string;
  role?: TreeRole;
  trees?: Array<TreeMeta & { home: boolean }>;
  activeTreeId?: string;
  isFounder?: boolean;
  initialSelectedId?: string;
  publicView?: boolean;
  hideLivingForced?: boolean;
}) {
  const router = useRouter();
  const { readOnly } = useReadOnly();
  const t = useT();

  // Madde 9 — İyimser kilitleme: değiştirme istekleri, düzenlemenin dayandığı
  // sürümü taşısın diye güncel sürümü aksiyon katmanına bildir. router.refresh()
  // sonrası bu prop tazelenir; başka biri kaydettiyse bizim yazmamız 409 alır.
  useEffect(() => {
    setBaseVersion(version);
  }, [version]);

  const [view, setView] = useState<ViewKey>("agac");
  const [selectedId, setSelectedId] = useState<string | undefined>(initialSelectedId);
  /** Ağaçta gezinirken merkeze alınan/vurgulanan kişi — detay panelinden ayrı */
  const [treeFocus, setTreeFocus] = useState<string | undefined>(initialSelectedId);
  const [rootId, setRootId] = useState<string | undefined>(initialSelectedId);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);
  const [printingView, setPrintingView] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [pairOpen, setPairOpen] = useState(false);
  const [gedcomOpen, setGedcomOpen] = useState(false);
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  /**
   * Ağaçta ne gösterilsin:
   *  0..8      → odak kişinin n kuşak atası + n kuşak soyu (0 = yalnız yakın çevre)
   *  HERKES    → ağaçtaki herkes (kuşak sınırı yok)
   */
  const [treeDepth, setTreeDepth] = useState(3);
  const [toast, setToast] = useState<string>();

  // Madde 8 — "Bu görünümü yazdır": açık görünümü (ağaç/harita/soy/panel/liste)
  // olduğu gibi bas. Detay paneli kapatılıp bir render sonra `print-view`
  // sınıfıyla yalnız görünüm basılır; afterprint'te temizlenir.
  useEffect(() => {
    if (!printingView) return;
    document.body.classList.add("print-view");
    const done = () => {
      document.body.classList.remove("print-view");
      setPrintingView(false);
    };
    window.addEventListener("afterprint", done);
    window.print();
    return () => window.removeEventListener("afterprint", done);
  }, [printingView]);

  const printCurrentView = useCallback(() => {
    setSelectedId(undefined);
    setPrintingView(true);
  }, []);

  const idx = useMemo(() => indexPeople(people), [people]);
  const selected = selectedId ? idx.get(selectedId) : undefined;
  /**
   * Varsayılan kök / odak seçimi (URL'de `kisi` yoksa) ve akrabalık rozetinin
   * referansı. Üstünde ≥4 kuşak ata VE altında ≥4 kuşak torun bulunan, ayrıca
   * yelpazesi en dolu (ata+torun sayısı ve toplam derinlik en yüksek) kişiyi
   * seç — böylece ağaç zengin, karmaşık bir merkezle açılır. Uygun aday yoksa en
   * çok 1. derece bağlantısı (ebeveyn + eş + çocuk) olan kişiye düş; o da yoksa
   * ilk kişi. Böylece hem ağaç hem soy görünümü boş/sığ açılmaz.
   */
  const varsayilanKok = useMemo(() => {
    // Çocuk sayısını tek geçişte hazırla (1. derece bağlantı hesabı için)
    const childCount = new Map<string, number>();
    for (const p of people) {
      for (const pid of p.parentIds) childCount.set(pid, (childCount.get(pid) ?? 0) + 1);
    }

    let bestId: string | undefined;
    let bestScore = -1;
    let fallbackId: string | undefined;
    let fallbackDeg = -1;

    for (const p of people) {
      const anc = ancestorDepths(p.id, idx);
      const desc = descendantDepths(p.id, people);
      let up = 0;
      for (const d of anc.values()) if (d > up) up = d;
      let down = 0;
      for (const d of desc.values()) if (d > down) down = d;

      // 1. derece bağlantı sayısı — fallback ölçütü
      const deg =
        p.parentIds.length +
        p.spouseIds.length +
        (p.formerSpouseIds?.length ?? 0) +
        (childCount.get(p.id) ?? 0);
      if (deg > fallbackDeg) {
        fallbackDeg = deg;
        fallbackId = p.id;
      }

      // Asıl aday: ≥4 ata + ≥4 torun; yelpaze doluluğuna göre skorla
      if (up >= 4 && down >= 4) {
        const score = anc.size + desc.size + up + down;
        if (score > bestScore) {
          bestScore = score;
          bestId = p.id;
        }
      }
    }

    return bestId ?? fallbackId ?? people[0]?.id;
  }, [people, idx]);

  const effectiveRoot = (rootId && idx.has(rootId) ? rootId : undefined) ?? varsayilanKok;

  /**
   * Ağaç görünümünde gösterilecek kişiler — odak kişinin çevresindeki
   * "kum saati" (hourglass): N kuşak ata + N kuşak soy + eşler + kardeşler.
   *
   * Yüzlerce kişilik bir ağacın tamamı tek ekranda okunmuyor; olgun soy
   * ağacı araçları da bu yüzden kuşak sınırı sunuyor.
   */
  const treeFocusId = treeFocus && idx.has(treeFocus) ? treeFocus : effectiveRoot;

  const treePeople = useMemo(() => {
    if (treeDepth >= HERKES || !treeFocusId) return people;

    const keep = new Set<string>([treeFocusId]);
    for (const [id, d] of ancestorDepths(treeFocusId, idx)) if (d <= treeDepth) keep.add(id);
    for (const [id, d] of descendantDepths(treeFocusId, people)) if (d <= treeDepth) keep.add(id);

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

  // Madde 2 — İlk yüklemede URL'de `kisi` yoksa uygun bir kök/odak kişiyi
  // otomatik seç (rootId + treeFocus + selectedId). Yalnızca mount'ta bir kez;
  // başlangıç değerini türetilmiş varsayılandan kurmak (mount'ta tek ek render).
  useEffect(() => {
    if (!initialSelectedId && varsayilanKok) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setRootId(varsayilanKok);
      setTreeFocus(varsayilanKok);
      // Not: `selectedId` bilerek ayarlanmaz — ağaç iyi bir kök/odakla açılır
      // ama detay (profil) paneli KAPALI gelir. Demo dâhil her ağaçta ilk
      // yüklemede profil kendiliğinden açılmasın.
      /* eslint-enable react-hooks/set-state-in-effect */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Madde 5 — Sekme (görünüm) değişince açık profil panelini kapat. İlk mount
  // atlanır ki madde 2'nin seçtiği başlangıç seçimi korunsun.
  const ilkGorunum = useRef(true);
  useEffect(() => {
    if (ilkGorunum.current) {
      ilkGorunum.current = false;
      return;
    }
    setSelectedId(undefined);
  }, [view]);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(undefined), 3200);
  }, []);

  // Görüntüleme modunda düzenleyici hiç açılmamalı. Arayüzde tetikleyiciler
  // zaten gizli; buradaki kontroller bir tetikleyici atlansa bile güvenlik ağı.
  const openAdd = useCallback(() => {
    if (readOnly) return;
    setEditor({});
  }, [readOnly]);

  const openEdit = useCallback(
    (id: string) => {
      if (readOnly) return;
      setEditor({ personId: id });
    },
    [readOnly]
  );

  const openQuickAdd = useCallback(
    (type: RelationType, targetId: string) => {
      if (readOnly) return;
      const target = idx.get(targetId);
      if (!target) return;
      setEditor({ relation: { type, target } });
    },
    [idx, readOnly]
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
    notify(t("ws.toast.deleted"));
    router.refresh();
  }, [router, notify, t]);

  const handleImported = useCallback(
    (count: number) => {
      setGedcomOpen(false);
      notify(t("ws.toast.imported", { count }));
      router.refresh();
    },
    [router, notify, t]
  );

  const handleDemoLoaded = useCallback(
    (count: number) => {
      setGedcomOpen(false);
      setDemoLoading(false);
      setSelectedId(undefined);
      setRootId(undefined);
      notify(t("ws.toast.demoLoaded", { count }));
      router.refresh();
    },
    [router, notify, t]
  );

  /** Boş durumdan tek tıkla demo yükle */
  const loadDemoDirect = useCallback(async () => {
    setDemoLoading(true);
    try {
      const res = await fetch("/api/family/demo", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? t("ws.demoFailed"));
      handleDemoLoaded(data.count ?? 0);
    } catch (err) {
      setDemoLoading(false);
      notify((err as Error).message);
    }
  }, [handleDemoLoaded, notify, t]);

  // "Merkeze al": ağaçta kişiyi merkeze alır ve şecere kökü yapar; görünüm
  // değiştirmez (eskiden Soy sayfasına atlıyordu).
  const focusPerson = useCallback((id: string) => {
    setRootId(id);
    setTreeFocus(id);
  }, []);

  const isEmpty = people.length === 0;

  return (
    <div className="app-shell flex flex-col h-screen overflow-hidden">
      <TopBar
        familyName={familyName}
        view={view}
        onViewChange={setView}
        onSearch={() => setPaletteOpen(true)}
        onImportExport={() => setGedcomOpen(true)}
        onPrint={() => setPrintOpen(true)}
        onBook={() => setBookOpen(true)}
        onPrintView={printCurrentView}
        onManageMembers={role === "admin" && !publicView ? () => setMembersOpen(true) : undefined}
        onShare={role === "admin" && !publicView ? () => setShareOpen(true) : undefined}
        onPair={role === "admin" && !publicView ? () => setPairOpen(true) : undefined}
        onAiChat={!publicView && role !== "viewer" ? () => setAiChatOpen(true) : undefined}
        peopleCount={people.length}
        trees={trees}
        activeTreeId={activeTreeId}
        isFounder={isFounder}
        publicView={publicView}
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
              selectedId={treeFocus}
              focusId={effectiveRoot}
              depth={treeDepth}
              onSelect={(id) => {
                // Madde 1 — Karta tek tık: kişiyi merkeze al (treeFocus) VE
                // profil panelini aç (selectedId). Çift tık da onOpen ile açar.
                setTreeFocus(id);
                setSelectedId(id);
              }}
              onOpen={setSelectedId}
              onDeselect={() => setTreeFocus(undefined)}
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
        ) : view === "yelpaze" ? (
          <FanChart
            people={people}
            rootId={effectiveRoot}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onSetRoot={setRootId}
            onClose={() => setSelectedId(undefined)}
          />
        ) : view === "zaman" ? (
          <TimelineView people={people} selectedId={selectedId} onSelect={setSelectedId} />
        ) : view === "liste" ? (
          <ListView
            people={people}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onAdd={openAdd}
          />
        ) : view === "harita" ? (
          <PlacesMap people={people} onSelect={setSelectedId} />
        ) : (
          <PanelView
            people={people}
            onSelect={setSelectedId}
            onAdd={openAdd}
            onImportExport={() => setGedcomOpen(true)}
          />
        )}

        {/* Kayan ekle düğmesi — ağaç ve soy görünümünde (görüntüleme modunda gizli) */}
        {!readOnly && !isEmpty && (view === "agac" || view === "soy") && (
          <button
            onClick={openAdd}
            className="
              no-print
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
            {t("common.addPerson")}
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
              ? t("ws.modal.edit")
              : editor.relation
              ? t(`relation.${editor.relation.type}.title`)
              : t("ws.modal.new")
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

      {aiChatOpen && <AiChat onClose={() => setAiChatOpen(false)} />}

      {printOpen && (
        <PrintView people={people} familyName={familyName} onClose={() => setPrintOpen(false)} />
      )}

      {bookOpen && (
        <BookView people={people} familyName={familyName} onClose={() => setBookOpen(false)} />
      )}

      {pairOpen && role === "admin" && !publicView && (
        <PairDialog onClose={() => setPairOpen(false)} />
      )}

      {shareOpen && role === "admin" && !publicView && (
        <ShareDialog treeName={familyName} onClose={() => setShareOpen(false)} />
      )}

      {membersOpen && role === "admin" && (
        <MembersDialog treeName={familyName} onClose={() => setMembersOpen(false)} />
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
  const t = useT();
  if (total <= 25) return null;

  const sayilar = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const metinler: Array<{ d: number; l: string; ipucu: string }> = [
    { d: HERKES, l: t("ws.depth.all"), ipucu: t("ws.depth.allHint") },
  ];

  return (
    <div className="absolute top-4 left-4 right-4 lg:right-auto z-10 flex items-center gap-1.5 h-9 pl-1.5 pr-2 rounded-xl bg-bg-elevated/90 backdrop-blur border border-border shadow-card overflow-x-auto no-scrollbar">
      {focusPerson && (
        <button
          onClick={onGoToFocus}
          title={t("ws.depth.focusTitle")}
          className="flex items-center gap-1.5 h-7 pl-1 pr-2 rounded-lg hover:bg-surface-2 transition-colors shrink-0"
        >
          <Avatar person={focusPerson} size="xs" />
          <span className="text-[11px] font-medium text-text whitespace-nowrap max-w-20 truncate">
            {focusPerson.firstName}
          </span>
        </button>
      )}
      <span className="h-4 w-px bg-border shrink-0" />
      <div className="flex items-center gap-0.5 shrink-0">
        {sayilar.map((d) => (
          <button
            key={d}
            onClick={() => onChange(d)}
            title={t("ws.depth.genHint", { d })}
            className={`h-6 w-6 grid place-items-center rounded-md text-[11px] font-medium tabular-nums transition-colors ${
              depth === d
                ? "bg-primary text-primary-text"
                : "text-text-muted hover:text-text hover:bg-surface-2"
            }`}
          >
            {d}
          </button>
        ))}
        {metinler.map((o) => (
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
      <span className="text-[11px] text-text-subtle tabular-nums whitespace-nowrap border-l border-border pl-2 shrink-0">
        {shown}/{total}
      </span>
    </div>
  );
}
