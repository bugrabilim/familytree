"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { Person } from "@/types/family";
import type { TreeRole } from "@/types/user";
import type { TreeMeta } from "@/lib/trees";
import TopBar, { type ViewKey } from "@/components/TopBar";
import PersonDrawer from "@/components/PersonDrawer";
import EgoNetwork from "@/components/EgoNetwork";
import CommandPalette from "@/components/CommandPalette";
import GedcomDialog from "@/components/GedcomDialog";
import SettingsDialog from "@/components/SettingsDialog";
import PeopleDialog from "@/components/PeopleDialog";
import ShareHubDialog from "@/components/ShareHubDialog";
import AiChat, { type AiMsg } from "@/components/AiChat";
import PrintView from "@/components/PrintView";
import BookView from "@/components/BookView";
import MembersDialog from "@/components/MembersDialog";
import ShareDialog from "@/components/ShareDialog";
import PairDialog from "@/components/PairDialog";
import EmptyState from "@/components/EmptyState";
import ListView from "@/components/ListView";
import TableView from "@/components/TableView";
import PanelView from "@/components/PanelView";
import PedigreeView from "@/components/PedigreeView";
import FanChart from "@/components/FanChart";
import TimelineView from "@/components/TimelineView";
import Modal from "@/components/ui/Modal";
import CalendarView from "@/components/CalendarView";
import Avatar from "@/components/ui/Avatar";
import PersonForm from "@/components/PersonForm";
import { PrivacyProvider, usePrivacy } from "@/components/PrivacyContext";
import TreeSchema from "@/components/TreeSchema";
import { ReadOnlyProvider, useReadOnly } from "@/components/ReadOnlyContext";
import { setBaseVersion, type RelationType } from "@/lib/actions";
import { ancestorDepths, descendantDepths, indexPeople } from "@/lib/relations";
import { isMember } from "@/lib/associates";
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
  coverPhoto?: string;
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
  coverPhoto: initialCoverPhoto,
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
  coverPhoto?: string;
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
  const { view: maskView } = usePrivacy();
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
  /** Aile Kitabı kapak fotoğrafı (header). */
  const [coverPhoto, setCoverPhotoState] = useState<string | undefined>(initialCoverPhoto);
  /** Kişi merkezli "Çevre" grafiği — açıksa bu kişiyle merkezlenir. */
  const [egoId, setEgoId] = useState<string | undefined>(undefined);
  const [printingView, setPrintingView] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [pairOpen, setPairOpen] = useState(false);
  const [gedcomOpen, setGedcomOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [shareHubOpen, setShareHubOpen] = useState(false);
  const [aiChatOpen, setAiChatOpen] = useState(false);
  // AI sohbet geçmişi burada tutulur → panel kapanıp açılınca konuşma korunur.
  const [aiMessages, setAiMessages] = useState<AiMsg[]>([]);
  const [starterLoading, setStarterLoading] = useState(false);

  /** Başlangıç iskeleti — anne/baba ve büyükanne-büyükbaba için boş kartlar. */
  const createStarter = useCallback(async () => {
    setStarterLoading(true);
    try {
      const res = await fetch("/api/family/starter", { method: "POST" });
      if (!res.ok) throw new Error("starter");
      router.refresh();
    } catch {
      setStarterLoading(false);
    }
  }, [router]);
  /**
   * Ağaçta ne gösterilsin:
   *  0..8      → odak kişinin n kuşak atası + n kuşak soyu (0 = yalnız yakın çevre)
   *  HERKES    → ağaçtaki herkes (kuşak sınırı yok)
   */
  const [treeDepth, setTreeDepth] = useState(3);
  const [toast, setToast] = useState<string>();

  // "Arkadaşları göster" — açıkken çevre (aile-dışı) kişiler ağaçta bağlı
  // oldukları üyenin yanında (kesikli arkadaşlık çizgisiyle) görünür. Cihazda
  // (localStorage) kalıcı; soy-ağacı hesaplarını ETKİLEMEZ, yalnız ağaç görünümü.
  // Varsayılan AÇIK — arkadaşlar (çevre) ağaçta baştan görünür. Kullanıcı
  // kapatırsa "0" saklanır; yalnız açıkça "0" ise gizlenir.
  const [showAssociates, setShowAssociatesState] = useState(true);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowAssociatesState(localStorage.getItem("soyagaci_show_associates") !== "0");
    } catch { /* yoksay */ }
  }, []);
  const setShowAssociates = useCallback((v: boolean) => {
    setShowAssociatesState(v);
    try { localStorage.setItem("soyagaci_show_associates", v ? "1" : "0"); } catch { /* yoksay */ }
  }, []);

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

  // Soy-ağacı süzgeci: "çevre" (aile-dışı yakınlar) kan/evlilik motoruna
  // KATILMAZ. Ağaç, şecere, yelpaze, zaman, panel, harita ve kitap yalnız
  // ÜYELERİ görür; profil, arama, liste, tablo ve düzenleyici TÜM kişileri
  // görür (çevre kişilerinin profilleri açılabilsin, bağları çözülebilsin).
  const members = useMemo(() => people.filter(isMember), [people]);
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
    // Başlangıç iskeletinde odak her zaman kullanıcının kendisi olsun —
    // böylece her iki taraftaki büyükanne/büyükbaba da ilk açılışta görünür.
    const iskeletBen = members.find((p) => p.placeholder === "self");
    if (iskeletBen) return iskeletBen.id;
    // Çocuk sayısını tek geçişte hazırla (1. derece bağlantı hesabı için)
    const childCount = new Map<string, number>();
    for (const p of members) {
      for (const pid of p.parentIds) childCount.set(pid, (childCount.get(pid) ?? 0) + 1);
    }

    let bestId: string | undefined;
    let bestScore = -1;
    let fallbackId: string | undefined;
    let fallbackDeg = -1;

    for (const p of members) {
      const anc = ancestorDepths(p.id, idx);
      const desc = descendantDepths(p.id, members);
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

    return bestId ?? fallbackId ?? members[0]?.id;
  }, [members, idx]);

  const effectiveRoot = (rootId && idx.has(rootId) ? rootId : undefined) ?? varsayilanKok;

  // "Çevre" sekmesinin merkezi: profilden "Çevre grafiği"yle gelen kişi (egoId),
  // yoksa o an seçili kişi, yoksa ağacın odağı.
  const egoCenterId =
    (egoId && idx.has(egoId) ? egoId : undefined) ??
    (selectedId && idx.has(selectedId) ? selectedId : undefined) ??
    effectiveRoot;

  /**
   * Ağaç görünümünde gösterilecek kişiler — odak kişinin çevresindeki
   * "kum saati" (hourglass): N kuşak ata + N kuşak soy + eşler + kardeşler.
   *
   * Yüzlerce kişilik bir ağacın tamamı tek ekranda okunmuyor; olgun soy
   * ağacı araçları da bu yüzden kuşak sınırı sunuyor.
   */
  const treeFocusId = treeFocus && idx.has(treeFocus) ? treeFocus : effectiveRoot;

  const treePeople = useMemo(() => {
    // "Tümü" modunda bile yalnız üyeler (çevre kişileri ağaçta düğüm olmaz).
    if (treeDepth >= HERKES || !treeFocusId) return members;

    const keep = new Set<string>([treeFocusId]);
    for (const [id, d] of ancestorDepths(treeFocusId, idx)) if (d <= treeDepth) keep.add(id);
    for (const [id, d] of descendantDepths(treeFocusId, members)) if (d <= treeDepth) keep.add(id);

    // Odak kişinin kardeşleri
    const focus = idx.get(treeFocusId);
    if (focus?.parentIds.length) {
      for (const p of members) {
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
    return members.filter((p) => keep.has(p.id));
  }, [members, idx, treeFocusId, treeDepth]);

  // "Arkadaşları göster" açıkken: görünür üyelerle bağı olan çevre kişilerini
  // ağaca ekle (kesikli arkadaşlık çizgisiyle bağlanır). Kapalıysa değişmez.
  const treeWithAssoc = useMemo(() => {
    if (!showAssociates) return treePeople;
    const memberIds = new Set(treePeople.map((p) => p.id));
    const extra: Person[] = [];
    for (const p of people) {
      if (p.kind !== "cevre") continue;
      const bonded =
        (p.associations ?? []).some((a) => memberIds.has(a.personId)) ||
        treePeople.some((m) => (m.associations ?? []).some((a) => a.personId === p.id));
      if (bonded) extra.push(p);
    }
    return extra.length ? [...treePeople, ...extra] : treePeople;
  }, [showAssociates, treePeople, people]);

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
  // AI'dan bir kişiye giderken görünümü "ağaç"a çevirirken seçimi (paneli) KORU:
  // görünüm değişince seçimi temizleyen aşağıdaki efekt bir kez atlanır.
  const secimiKoruRef = useRef(false);
  useEffect(() => {
    if (ilkGorunum.current) {
      ilkGorunum.current = false;
      return;
    }
    if (secimiKoruRef.current) {
      secimiKoruRef.current = false;
      return;
    }
    setSelectedId(undefined);
  }, [view]);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(undefined), 3200);
  }, []);

  // Aile Kitabı kapak fotoğrafını ayarla/kaldır (kalıcı; yalnız düzenleyici).
  const setCover = useCallback(async (url: string | null) => {
    try {
      const res = url
        ? await fetch("/api/family/cover", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) })
        : await fetch("/api/family/cover", { method: "DELETE" });
      if (!res.ok) throw new Error();
      setCoverPhotoState(url ?? undefined);
    } catch {
      notify(t("book.coverFailed"));
    }
  }, [notify, t]);

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
      // Mevcut veriye eklendiyse yeni kişiler ayrı bir "ada" olarak gelebilir;
      // kullanıcıyı Panel'deki "olası eşleşmeler → birleştir" akışına yönlendir.
      const hadPeople = people.length > 0;
      router.refresh();
      if (hadPeople && count > 0) {
        setView("istatistik");
        notify(t("ws.toast.importedMerge", { count }));
      } else {
        notify(t("ws.toast.imported", { count }));
      }
    },
    [people.length, router, notify, t]
  );

  const handleCleared = useCallback(() => {
    setSettingsOpen(false);
    notify(t("ws.toast.cleared"));
    router.refresh();
  }, [router, notify, t]);


  // "Merkeze al": ağaçta kişiyi merkeze alır ve şecere kökü yapar; görünüm
  // değiştirmez (eskiden Soy sayfasına atlıyordu).
  const focusPerson = useCallback((id: string) => {
    setRootId(id);
    setTreeFocus(id);
  }, []);

  // "Odakla": kamerayı bir kereliğine kişiye götürür (ağacın kökünü/görünür
  // kümesini DEĞİŞTİRMEZ). seq her istekte artar; FamilyTree bunu izler.
  const locateSeq = useRef(0);
  const [locateReq, setLocateReq] = useState<{ id: string; seq: number } | undefined>(undefined);
  const locatePerson = useCallback(
    (id: string) => {
      if (!idx.has(id)) return;
      if (view !== "agac") {
        secimiKoruRef.current = true;
        setView("agac");
      }
      locateSeq.current += 1;
      setLocateReq({ id, seq: locateSeq.current });
    },
    [idx, view]
  );

  // AI yanıtındaki bir kişiye tıklanınca: ağaç görünümüne geç, o kişiyi merkeze
  // al ve profilini aç. Sohbet paneli kapanır ama geçmişi korunur (aiMessages
  // üst bileşende). Görünüm zaten "ağaç" değilse seçim-temizleme efekti atlanır.
  const goToPersonFromAi = useCallback(
    (id: string) => {
      if (!idx.has(id)) return;
      setAiChatOpen(false);
      if (view !== "agac") {
        secimiKoruRef.current = true;
        setView("agac");
      }
      focusPerson(id);
      setSelectedId(id);
    },
    [idx, view, focusPerson]
  );

  const isEmpty = people.length === 0;

  return (
    <div className="app-shell flex flex-col h-screen overflow-hidden">
      <TopBar
        familyName={familyName}
        view={view}
        onViewChange={(v) => {
          // Madde 1 — Veri yokken "Aile Kitabı" açılmaz; diğer görünüm
          // düğmeleri gibi davranır (boş ağaçta bir şey açmaz).
          if (v === "kitap") {
            if (!isEmpty) setBookOpen(true);
          } else {
            setView(v);
          }
        }}
        onSearch={() => setPaletteOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenShare={() => setShareHubOpen(true)}
        onOpenPeople={!publicView ? () => setPeopleOpen(true) : undefined}
        onPrintView={printCurrentView}
        onAiChat={!publicView && role !== "viewer" ? () => setAiChatOpen(true) : undefined}
        peopleCount={people.length}
        trees={trees}
        activeTreeId={activeTreeId}
        isFounder={isFounder}
        publicView={publicView}
      />

      <main
        className={`flex-1 min-h-0 relative transition-[padding] duration-300 ${
          selected ? "sm:pr-[340px]" : ""
        }`}
      >
        {isEmpty ? (
          <EmptyState
            onAdd={openAdd}
            onStarter={createStarter}
            starterLoading={starterLoading}
            onImport={() => setGedcomOpen(true)}
          />
        ) : view === "agac" ? (
          <>
            {/* Etkileşimli ağaç (React Flow) yazdırılamıyor (transform'lu tuval);
                Madde 6 — yazdırırken bunu gizle, yerine statik şema bas. */}
            <div className="no-print h-full">
              <FamilyTree
                people={treeWithAssoc}
                selectedId={selectedId}
                focusId={effectiveRoot}
                depth={treeDepth}
                onSelect={(id) => {
                  // Karta tek tık: yalnız profil panelini aç ve kartı yumuşakça
                  // ortala. Görünür kümeyi (treeFocus) DEĞİŞTİRMEZ — böylece ağaç
                  // yeniden yerleşip ekran zıplamıyordu (eski davranış çok
                  // hareketliydi). Yeniden köklemek için panelden "merkeze al".
                  setSelectedId(id);
                }}
                onOpen={setSelectedId}
                onDeselect={() => setSelectedId(undefined)}
                onQuickAdd={openQuickAdd}
                locateReq={locateReq}
              />
              <TreeDepthControl
                depth={treeDepth}
                onChange={setTreeDepth}
                shown={treeWithAssoc.length}
                total={members.length}
                focusPerson={treeFocusId ? idx.get(treeFocusId) : undefined}
                onGoToFocus={() => treeFocusId && setSelectedId(treeFocusId)}
              />
            </div>
            {/* Yazdırma-özel statik şema (yalnız @media print'te görünür).
                Normal akışta sabit yükseklikle basılır (React Flow gizli). */}
            <div className="hidden print:flex print:h-[240mm] w-full bg-white">
              <TreeSchema people={treePeople.map(maskView)} />
            </div>
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
          />
        ) : view === "tablo" ? (
          <TableView people={people} onAdd={openAdd} onChanged={() => router.refresh()} />
        ) : view === "harita" ? (
          <PlacesMap people={people} onSelect={setSelectedId} />
        ) : view === "cevre" ? (
          <EgoNetwork
            key={egoCenterId}
            personId={egoCenterId}
            people={people}
            embedded
            onOpenProfile={setSelectedId}
          />
        ) : view === "iliski" ? (
          <PanelView
            people={people}
            mode="relations"
            onSelect={setSelectedId}
            onAdd={openAdd}
            focusId={effectiveRoot}
          />
        ) : view === "takvim" ? (
          <CalendarView people={people} onSelect={setSelectedId} />
        ) : (
          <PanelView
            people={people}
            mode="stats"
            onSelect={setSelectedId}
            onAdd={openAdd}
            onPrint={printCurrentView}
          />
        )}

        {/* Kayan "Kişi ekle" düğmesi KALDIRILDI (#1): ağaç ve soy görünümünde
           kişi, küçük kartın üzerindeki + düğmeleriyle eklenir. */}
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
          onLocate={locatePerson}
          onFocus={focusPerson}
          onEgo={(id) => { setEgoId(id); setView("cevre"); }}
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

      {/* İçe/dışa aktar */}
      {gedcomOpen && (
        <GedcomDialog
          peopleCount={people.length}
          onClose={() => setGedcomOpen(false)}
          onImported={handleImported}
          onPrintBook={() => { setGedcomOpen(false); setPrintOpen(true); }}
        />
      )}

      {/* Ayarlar hub'ı (⋮ → Ayarlar) */}
      {settingsOpen && (
        <SettingsDialog
          onClose={() => setSettingsOpen(false)}
          showAssociates={showAssociates}
          onToggleAssociates={setShowAssociates}
        />
      )}

      {/* Kişiler hub'ı (⋮ → Kişiler) */}
      {peopleOpen && (
        <PeopleDialog
          onClose={() => setPeopleOpen(false)}
          editable={!readOnly}
          peopleCount={people.length}
          people={people}
          onSelect={setSelectedId}
          onImportExport={() => { setPeopleOpen(false); setGedcomOpen(true); }}
          onOpenTable={() => { setPeopleOpen(false); setView("tablo"); }}
          onCleared={() => { setPeopleOpen(false); handleCleared(); }}
          onRestored={() => { setPeopleOpen(false); notify(t("history.restored")); router.refresh(); }}
        />
      )}

      {/* Paylaş hub'ı (⋮ → Paylaş) */}
      {shareHubOpen && (
        <ShareHubDialog
          onClose={() => setShareHubOpen(false)}
          onShare={role === "admin" && !publicView ? () => { setShareHubOpen(false); setShareOpen(true); } : undefined}
          onManageMembers={role === "admin" && !publicView ? () => { setShareHubOpen(false); setMembersOpen(true); } : undefined}
          onPair={role === "admin" && !publicView ? () => { setShareHubOpen(false); setPairOpen(true); } : undefined}
        />
      )}

      {aiChatOpen && (
        <AiChat
          onClose={() => setAiChatOpen(false)}
          messages={aiMessages}
          setMessages={setAiMessages}
          people={people}
          onGoToPerson={goToPersonFromAi}
          onImported={() => router.refresh()}
          onSetView={setView}
          onSetAssociates={setShowAssociates}
          onOpenShare={role === "admin" && !publicView ? () => setShareOpen(true) : undefined}
          onOpenBook={() => setBookOpen(true)}
          onAddPerson={openAdd}
          onPersonAdded={() => router.refresh()}
        />
      )}

      {printOpen && (
        <PrintView people={people} allPeople={people} familyName={familyName} coverPhoto={coverPhoto} onClose={() => setPrintOpen(false)} />
      )}

      {bookOpen && (
        <BookView
          people={people}
          allPeople={people}
          familyName={familyName}
          coverPhoto={coverPhoto}
          onSetCover={!readOnly ? setCover : undefined}
          onClose={() => setBookOpen(false)}
          onPrint={() => { setBookOpen(false); setPrintOpen(true); }}
        />
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
    <div className="absolute top-4 left-4 right-4 lg:right-auto z-10 flex flex-wrap lg:flex-nowrap items-center gap-1.5 gap-y-1 min-h-9 py-1 lg:py-0 lg:h-9 pl-1.5 pr-12 md:pr-2 rounded-xl bg-bg-elevated/90 backdrop-blur border border-border shadow-card">
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
