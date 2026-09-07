"use client";

import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useT } from "@/lib/i18n";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  ControlButton,
  MiniMap,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import PersonNode, { type PersonNodeData } from "./PersonNode";
import BondEdge, { type BondEdgeData } from "./BondEdge";
import { genderTone } from "./ui/Avatar";
import { buildUnions, layout } from "@/lib/tree-layout";
import { isAssociate, isMember } from "@/lib/associates";
import { compareSiblings } from "@/lib/siblings";
import type { Person } from "@/types/family";
import type { Bond } from "@/types/bond";
import { bondTypeKey, pruneBonds } from "@/lib/bonds";
import type { RelationType } from "@/lib/actions";

/**
 * Kuşak sayısı arttıkça kartlar okunmaz hâle geliyordu. "Ayrıntı düzeyi"
 * (detail) yükseldikçe kart büyür ve daha çok bilgi gösterir; kalabalıkta
 * küçülüp sadeleşir. Sıra: önce yaş, sonra şehir, sonra kutu/çizgi yüksekliği.
 */
type Detail = 0 | 1 | 2 | 3;

// Dikey (portre) kartlar — üstte avatar, altında ad, altında doğum yılı.
const DIMS: Record<Detail, { w: number; h: number; gap: number; nodesep: number }> = {
  3: { w: 140, h: 126, gap: 116, nodesep: 30 },
  2: { w: 132, h: 114, gap: 100, nodesep: 28 },
  1: { w: 118, h: 98, gap: 78, nodesep: 24 },
  0: { w: 102, h: 82, gap: 60, nodesep: 20 },
};

/** treeDepth (0-8, büyük değer=Tümü) + görünen kişi sayısı → temel ayrıntı düzeyi */
function detailFor(depth: number, count: number): Detail {
  const byDepth: Detail = depth <= 3 ? 3 : depth <= 5 ? 2 : depth <= 7 ? 1 : 0;
  const byCount: Detail = count > 220 ? 0 : count > 120 ? 1 : count > 60 ? 2 : 3;
  return Math.min(byDepth, byCount) as Detail;
}

/* ---------------------------------------------------------------- */
/* Birlik (union) düğümü — çiftleri yan yana tutar                   */
/* ---------------------------------------------------------------- */

function UnionNode() {
  return (
    <div className="w-1.5 h-1.5 rounded-full bg-border-strong">
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes = { person: PersonNode, union: UnionNode as unknown as React.FC<NodeProps> };
// Genogram bağları için ayrı kenar türü — hazır biçimlerin hiçbiri zigzag/çift
// çizgi çizmiyor (bkz. `components/BondEdge.tsx`).
const edgeTypes = { bond: BondEdge };

/* Birlik (union) mantığı ve dagre yerleşimi test edilebilir olsun diye saf
   modülde: `lib/tree-layout.ts`. */

/* ---------------------------------------------------------------- */

interface Props {
  people: Person[];
  selectedId?: string;
  focusId?: string;
  /** treeDepth: 0-8 kuşak, büyük değer = Tümü — ayrıntı düzeyini belirler */
  depth?: number;
  highlightIds?: Set<string>;
  /** Tek tık: odak/merkez (panel açılmaz) */
  onSelect: (id: string) => void;
  /** Çift tık: detay panelini aç */
  onOpen?: (id: string) => void;
  onDeselect?: () => void;
  onQuickAdd: (relation: RelationType, targetId: string) => void;
  /** Tek seferlik "Odakla" isteği: seq her istekte artar, kamera o kişiye gider. */
  locateReq?: { id: string; seq: number };
  /**
   * Genogram duygusal bağ katmanı. VARSAYILAN KAPALI: ağacın asıl işi soy
   * bağını göstermek, duygusal katman ayrı bir okuma. Boş dizi geçilmesi ile
   * katmanın kapalı olması aynı şey değil — `showBonds` ayrı tutuluyor ki
   * "hiç bağ yok" ile "bakmak istemiyorum" karışmasın.
   */
  bonds?: Bond[];
  showBonds?: boolean;
  /**
   * Tuval üstü ebeveyn değiştirme — bir kartı başka bir kartın üstüne
   * bırakınca çağrılır. YAZMAZ: çağıran yer onay ister.
   *
   * Yalnız "bağ kurma kipi" açıkken tetiklenir. Kartlar zaten serbestçe
   * sürükleniyor (oturum içi konum); düz bir bırakmanın soy bağını
   * değiştirmesi, kartını düzeltmek isteyen herkesin ağacını sessizce
   * bozardı.
   */
  onReparentDrop?: (childId: string, parentId: string) => void;
  linkMode?: boolean;
  /**
   * Çağıranın kendi denetimleri (kuşak derinliği paneli, bağ kurma kipi,
   * gömülü görünümün künyesi…).
   *
   * Neden prop, neden tuvalin yanına serbestçe konulmuyor: bu denetimlerin
   * DURUMU çağıranda (Workspace, EmbedTree), YERİ ise burada olmalı. Eskiden
   * çağıran onları `absolute` ile tuvalin üstüne koyuyordu; tuvalin nerede
   * bittiğini bilen tek yer burası olduğu için, yerleşimi burada toplamak
   * aynı hatanın bir daha yapılmasını yapısal olarak engelliyor — denetim
   * eklemenin tek yolu bu satır.
   */
  toolbar?: ReactNode;
}

function Canvas({ people, selectedId, focusId, depth = 3, highlightIds, onSelect, onOpen, onDeselect, onQuickAdd, locateReq, bonds, showBonds = false, onReparentDrop, linkMode = false, toolbar }: Props) {
  const t = useT();
  const { fitView, setCenter, getZoom, zoomIn, zoomOut, getIntersectingNodes } = useReactFlow();

  // Ayrıntı düzeyi YALNIZ kuşak/kalabalıktan belirlenir — yakınlaştırmadan
  // BAĞIMSIZ. Böylece zoom yaparken `dim` (dolayısıyla `positions` düzeni)
  // değişmez; düğümler yer değiştirmez, ekran savrulmaz. Zoom sadece ölçekler.
  const detail = useMemo(() => detailFor(depth, people.length) as Detail, [depth, people.length]);
  const dim = DIMS[detail];

  const ids = useMemo(() => new Set(people.map((p) => p.id)), [people]);
  const byIdAll = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const unions = useMemo(() => {
    const u = buildUnions(people, ids);
    // Manuel kardeş sırasını uygula: her birliğin çocuklarını sırala.
    for (const un of u) {
      un.childIds.sort((a, b) => compareSiblings(byIdAll.get(a), byIdAll.get(b)));
    }
    return u;
  }, [people, ids, byIdAll]);
  // Çevre (arkadaşlık) bağları — her iki uç da görünürse, üye→çevre yönünde
  // (dedupe). Yerleşimde associate'ı üyesinin altına iliştirmek + kesikli çizgi.
  const assocEdges = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ from: string; to: string }> = [];
    for (const p of people) {
      for (const a of p.associations ?? []) {
        if (!ids.has(p.id) || !ids.has(a.personId) || p.id === a.personId) continue;
        const other = byIdAll.get(a.personId);
        // Üye→çevre yönü: üye kaynak olsun (associate alt sırada dursun).
        const from = isMember(p) || !other || isAssociate(other) ? p.id : a.personId;
        const to = from === p.id ? a.personId : p.id;
        const key = [from, to].sort().join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ from, to });
      }
    }
    return out;
  }, [people, ids, byIdAll]);

  const positions = useMemo(() => layout(people, unions, dim, assocEdges), [people, unions, dim, assocEdges]);

  // Serbest sürükleme (oturum içi): kullanıcı çektiği kartların kimliğini
  // saklarız; render (seçim/zoom) ağacı yeniden kurduğunda bu kartların o anki
  // konumu korunur — kart yerinde kalır. Kalıcı DEĞİL: yerleşim rejimi (ayrıntı
  // düzeyi / kişi sayısı) değişince ya da sayfa yenilenince otomatik düzene döner.
  const draggedIds = useRef<Set<string>>(new Set());
  const onNodeDragStop = useCallback(
    (_: unknown, node: Node) => {
      if (node.type !== "person") return;

      /*
       * Bağ kurma kipi: kart başka bir kartın üstüne bırakıldıysa ebeveyn
       * değişikliği ÖNERİLİR. Kip kapalıyken bırakma yalnız kartı yerinde
       * tutar — eski davranış.
       */
      if (linkMode && onReparentDrop) {
        const ustunde = getIntersectingNodes(node).filter((n) => n.type === "person");
        if (ustunde.length > 0) {
          /*
           * Birden çok kartla kesişiyorsa EN ÇOK örtüşene değil, listenin
           * ilkine gitmek yanlış olurdu. Merkezi en yakın olanı seçiyoruz:
           * kullanıcı kartı nereye bıraktıysa oraya en yakın karttır.
           */
          const mx = node.position.x + (node.measured?.width ?? dim.w) / 2;
          const my = node.position.y + (node.measured?.height ?? dim.h) / 2;
          const enYakin = ustunde.reduce((a, b) => {
            const d = (n: Node) =>
              Math.hypot(
                n.position.x + (n.measured?.width ?? dim.w) / 2 - mx,
                n.position.y + (n.measured?.height ?? dim.h) / 2 - my
              );
            return d(b) < d(a) ? b : a;
          });
          onReparentDrop(node.id, enYakin.id);
          /*
           * Sürüklenen kartı "elle taşındı" saymıyoruz: öneri onaylanırsa
           * ağaç yeniden yerleşecek ve kartın eski, yanlış yerinde kilitli
           * kalması kafa karıştırırdı.
           */
          return;
        }
      }

      draggedIds.current.add(node.id);
    },
    [linkMode, onReparentDrop, getIntersectingNodes, dim.w, dim.h]
  );

  const nodes = useMemo<Node[]>(() => {
    const personNodes: Node[] = people.map((p) => {
      const data: PersonNodeData = {
        person: p,
        selected: p.id === selectedId,
        focused: p.id === focusId,
        dimmed: !!highlightIds && !highlightIds.has(p.id),
        canAddParent: p.parentIds.length < 2,
        associate: isAssociate(p),
        detail,
        width: dim.w,
        height: dim.h,
        onSelect,
        onOpen,
        onQuickAdd,
      };
      return {
        id: p.id,
        type: "person",
        position: positions.get(p.id) ?? { x: 0, y: 0 },
        data: data as unknown as Record<string, unknown>,
        // Serbest sürükleme açık — bırakılan yerde kalır (oturum içi).
        draggable: true,
      } as Node;
    });

    const unionNodes: Node[] = unions.map((u) => ({
      id: u.id,
      type: "union",
      position: positions.get(u.id) ?? { x: 0, y: 0 },
      data: {},
      draggable: false,
      selectable: false,
    })) as Node[];

    return [...unionNodes, ...personNodes];
  }, [people, unions, positions, selectedId, focusId, highlightIds, detail, dim, onSelect, onOpen, onQuickAdd]);

  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  const edges = useMemo<Edge[]>(() => {
    const out: Edge[] = [];
    const soluk = (a: string, b: string) =>
      highlightIds ? !highlightIds.has(a) || !highlightIds.has(b) : false;

    // Soybağı çizgileri tek ve nötr bir renkte (ebeveyn→birlik→çocuk kesintisiz
    // okunur); evlilik çizgileri ayrı, sıcak bir tonda. İki temada da net.
    for (const u of unions) {
      for (const pid of u.parentIds) {
        const faded = highlightIds ? !highlightIds.has(pid) : false;
        out.push({
          id: `${pid}->${u.id}`,
          source: pid,
          target: u.id,
          type: "smoothstep",
          style: {
            stroke: "var(--tree-edge)",
            strokeWidth: 1.8,
            opacity: faded ? 0.25 : 1,
          },
        });
      }
      for (const cid of u.childIds) {
        const faded = highlightIds ? !highlightIds.has(cid) : false;
        const child = byId.get(cid);
        const links = u.parentIds.map((pid) => child?.parentLinks?.[pid]);
        // Bu birliğe bağlı tüm bağlar kan bağı dışıysa kesikli çiz
        const evlatlik =
          links.length > 0 &&
          links.every((l) => l?.kind && l.kind !== "biological");
        const kopuk = links.some((l) => !!l?.estranged);

        out.push({
          id: `${u.id}->${cid}`,
          source: u.id,
          target: cid,
          type: "smoothstep",
          style: {
            stroke: kopuk ? "var(--text-subtle)" : "var(--tree-edge)",
            strokeWidth: 1.8,
            strokeDasharray: evlatlik ? "6 4" : kopuk ? "2 6" : undefined,
            opacity: faded ? 0.25 : kopuk ? 0.45 : 1,
          },
        });
      }
    }

    // Eş bağlarını, ortak birliği olmayan çiftler için göster
    const covered = new Set(unions.map((u) => u.parentIds.join("|")));
    const esKenari = (a: string, b: string, bosanmis: boolean) => {
      if (!ids.has(b)) return;
      const key = [a, b].sort().join("|");
      if (covered.has(key)) return;
      covered.add(key);
      out.push({
        id: `s:${key}`,
        source: a,
        target: b,
        type: "straight",
        style: {
          stroke: "var(--tree-edge-spouse)",
          strokeWidth: 1.6,
          strokeDasharray: bosanmis ? "1 5" : "5 4",
          opacity: soluk(a, b) ? 0.2 : bosanmis ? 0.5 : 0.9,
        },
      });
    };

    for (const p of people) {
      for (const sid of p.spouseIds) esKenari(p.id, sid, false);
      for (const sid of p.formerSpouseIds ?? []) esKenari(p.id, sid, true);
    }

    // Çevre (arkadaşlık) çizgileri — kesikli, ayırt edici mor ton.
    for (const e of assocEdges) {
      out.push({
        id: `a:${e.from}|${e.to}`,
        source: e.from,
        target: e.to,
        type: "straight",
        style: {
          stroke: "var(--accent, #a855f7)",
          strokeWidth: 1.4,
          strokeDasharray: "2 5",
          opacity: soluk(e.from, e.to) ? 0.2 : 0.7,
        },
      });
    }

    /*
     * Duygusal bağlar — yalnız katman açıkken. Her iki ucu da GÖRÜNÜR olan
     * bağlar çiziliyor: `pruneBonds` ağaçtan silinmiş kişileri eler, `ids`
     * ise o an süzgeçle gizlenmiş olanları. Görünmeyen bir karta çizgi
     * çekmek boşluğa uzanan bir çizgi bırakırdı.
     */
    if (showBonds && bonds?.length) {
      for (const b of pruneBonds(bonds, ids)) {
        const data: BondEdgeData = {
          bondType: b.type,
          faded: soluk(b.a, b.b),
          label: t(bondTypeKey(b.type)),
        };
        out.push({
          id: `b:${b.id}`,
          source: b.a,
          target: b.b,
          type: "bond",
          zIndex: 5,
          data: data as unknown as Record<string, unknown>,
        });
      }
    }

    return out;
  }, [people, unions, ids, byId, highlightIds, assocEdges, bonds, showBonds, t]);

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState(nodes);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState(edges);

  // Yerleşim rejimi (ayrıntı düzeyi / kişi sayısı) değişince serbest-sürükleme
  // kilitlerini bırak — yeni otomatik düzen uygulansın. Bu effect, aşağıdaki
  // düğüm-eşitleme effect'inden ÖNCE tanımlı; aynı commit'te önce çalışır.
  useEffect(() => {
    draggedIds.current.clear();
  }, [detail, people.length]);

  // Düğümleri eşitle; kullanıcının sürüklediği kartların KONUMUNU koru (seçim/
  // zoom gibi render'larda yerlerinden oynamasınlar).
  useEffect(() => {
    setRfNodes((prev) => {
      if (draggedIds.current.size === 0) return nodes;
      const prevById = new Map(prev.map((n) => [n.id, n]));
      return nodes.map((n) => {
        if (n.type === "person" && draggedIds.current.has(n.id)) {
          const old = prevById.get(n.id);
          if (old) return { ...n, position: old.position };
        }
        return n;
      });
    });
  }, [nodes, setRfNodes]);
  useEffect(() => setRfEdges(edges), [edges, setRfEdges]);

  /*
   * Tuval ölçeğini bir CSS değişkeni olarak yayınla.
   *
   * Kart kenarındaki hızlı-ekle düğmeleri tuvalin `transform: scale()`
   * altında; ölçek 0.2'ye inince 24px'lik düğme ekranda 6px oluyordu. Onları
   * ölçeğin tersiyle karşı-ölçekleyebilmek için CSS'in ölçeği BİLMESİ gerek
   * (bkz. globals.css `.ft-nub`).
   *
   * Neden React state değil: `useStore(s => s.transform[2])` bu bileşeni her
   * zoom karesinde yeniden çizerdi — 366 düğümlü ağaçta pahalı. Tek bir DOM
   * yazımı, React'e hiç uğramadan aynı işi görüyor. Değişken `:root`ta,
   * çünkü aynı anda tek tuval görünür ve ref zincirini React Flow'un sarmalayıcı
   * div'ine uzatmak gereksiz kırılganlık.
   */
  const yayinlaOlcek = useCallback((z: number) => {
    document.documentElement.style.setProperty("--ft-zoom", String(z));
  }, []);

  const onInit = useCallback(
    (rf: ReactFlowInstance) => {
      requestAnimationFrame(() => {
        rf.fitView({ padding: 0.15, duration: 0 });
        yayinlaOlcek(rf.getZoom());
      });
    },
    [yayinlaOlcek]
  );

  /* Görünür kişi kümesi değiştiğinde yeniden sığdır.
     onInit tek başına yetmiyor: düğümler mount'tan sonra bir effect ile
     yerleşiyor, dolayısıyla ilk fitView eksik bir kümeyi ölçüyordu. */
  const nodeCount = people.length;
  const fitKey = useRef("");
  useEffect(() => {
    // Yalnız görünür küme (kişi sayısı) ya da kuşak derinliği GERÇEKTEN
    // değişince yeniden sığdır. Seçim/zoom gibi başka render'larda çalışmaz —
    // böylece kamera kendiliğinden oynamaz.
    const key = `${nodeCount}:${depth}`;
    if (fitKey.current === key) return;
    const first = fitKey.current === "";
    fitKey.current = key;
    const t = setTimeout(() => {
      fitView({ padding: 0.15, duration: first ? 0 : 300 });
      // Süreli sığdırmada `onMove` animasyonun sonunda gelir; ölçeği bir de
      // burada yazmak, düğmelerin geçiş boyunca doğru boyda kalmasını sağlar.
      setTimeout(() => yayinlaOlcek(getZoom()), first ? 0 : 320);
    }, 60);
    return () => clearTimeout(t);
  }, [nodeCount, depth, fitView, getZoom, yayinlaOlcek]);

  // Kamera OTOMATİK oynamaz. Yalnız kullanıcı profilde "Odakla"ya basınca
  // (locateReq.seq artar) bir kereliğine o kişiye gider. Seçmek ya da zoom
  // yapmak ekranı savurmaz (3A: tüm otomatik odaklama/merkezleme kaldırıldı).
  const lastLocateSeq = useRef(0);
  useEffect(() => {
    if (!locateReq || locateReq.seq === lastLocateSeq.current) return;
    lastLocateSeq.current = locateReq.seq;
    const pos = positions.get(locateReq.id);
    if (!pos) return;
    const zoom = Math.max(getZoom(), 0.7);
    const drawerAcik =
      typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
    const kaydir = drawerAcik ? 190 / zoom : 0; // panelin yarısı kadar dünya birimi
    const t = setTimeout(
      () => setCenter(pos.x + dim.w / 2 + kaydir, pos.y + dim.h / 2, { zoom, duration: 500 }),
      120
    );
    return () => clearTimeout(t);
  }, [locateReq, positions, setCenter, getZoom, dim.w, dim.h]);

  /*
   * ═══ TUVAL ALANI GERÇEKTEN TUVALE AİT ═════════════════════════════════
   *
   * Denetim kapısı (H2'nin kalan yarısı). Bütün ağaç denetimleri — kuşak
   * derinliği paneli, bağ kurma kipi, yakınlaştırma kümesi, mini harita —
   * eskiden `absolute` + `z-10` ile tuvalin ÜSTÜNDEYDİ.
   *
   * #307 onları tuvalin köşesine, `fitView`in bıraktığı kenar boşluğunun
   * içine çekmişti. O ölçüm doğruydu ama yalnız DİNLENME hâli için: boşluk
   * `fitView`in bir defalık armağanı, garantisi yok. Kullanıcı ağacı yukarı
   * sürüklediği anda kartlar boşluğun içine giriyor ve denetimin altında
   * kalıyordu — tıklama gidiyor, hiçbir şey olmuyor. Bir konumlandırma
   * ayarıyla kapatılabilecek bir açık değil bu: üst üste binen iki katman
   * olduğu sürece, kartı denetimin altına götüren BİR sürükleme her zaman
   * vardır.
   *
   * Bu yüzden denetimler katmandan çıkıp yerleşimin kendi hücrelerine
   * taşındı: üstte tam genişlikte bir denetim satırı, sağda (lg+) mini
   * haritanın sütunu, arada `flex-1` ile tuval. Artık tuvalin sınırları
   * ile tıklanabilir alanın sınırları AYNI dikdörtgen; kartın denetim
   * altında kalması, kaydırma ne yaparsa yapsın, mümkün değil.
   *
   * Bedeli dürüstçe: dikeyde ~56px (lg'de 48px) ve lg+'ta yatayda 192px
   * tuval alanı. Zaten kaybedilmiş alandı — orada bir kart varsa
   * açılamıyordu; şimdi orada kart YOK.
   */
  return (
    <div className="h-full flex flex-col">
      {/*
        Denetim satırı. Sarmıyor, KAYIYOR — üst çubuktaki sekme şeridiyle
        (H3) aynı idiom: sarma satır yüksekliğini öngörülemez yapar ve dar
        ekranda başlığı büyütür; tek satır + yatay kaydırma yüksekliği
        sabitler. Yakınlaştırma kümesi `sticky right-0` ile şeridin sağ
        ucuna çivili: şerit kayarken bile ekranda kalıyor, çünkü kaydırıp
        aramak zorunda kalınacak son şey "uzaklaştır" düğmesidir.
      */}
      <div
        role="toolbar"
        aria-label={t("tree.toolbar")}
        className="shrink-0 flex items-center gap-2 h-14 lg:h-12 px-3 border-b border-border bg-bg-elevated overflow-x-auto no-scrollbar"
      >
        {toolbar}
        <div className="ml-auto sticky right-0 shrink-0 flex items-center pl-2 bg-bg-elevated">
          {/*
            Düğmeler React Flow'un `ControlButton`ı olarak kalıyor: dokunma
            boyunu (44px, lg'de 36px) veren `.react-flow__controls-button`
            kuralı #307'de ölçülerek konuldu, onu kaybetmenin sebebi yok.
            Değişen yalnızca sarmalayıcı: konumlandıran `Panel` (yani
            `<Controls>`) yerine satırın içinde akan sıradan bir kutu.
          */}
          <div className="flex items-center gap-px rounded-xl overflow-hidden border border-border bg-border shadow-card">
            {/* Yakınlaştır / Uzaklaştır — React Flow'un varsayılan düğmeleri kapatıldı
               (İngilizce ipucu veriyorlardı); yerine i18n başlıklı düğmeler (#5). */}
            <ControlButton onClick={() => zoomIn({ duration: 200 })} title={t("tree.zoomIn")} aria-label={t("tree.zoomIn")}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </ControlButton>
            <ControlButton onClick={() => zoomOut({ duration: 200 })} title={t("tree.zoomOut")} aria-label={t("tree.zoomOut")}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </ControlButton>
            {/* Ortala — seçili kişiyi ekranın ortasına getir; seçim yoksa tüm ağacı
               sığdır. (#4) Profil kartındaki "Ortala" da aynı işi yapar. */}
            <ControlButton
              onClick={() => {
                const id = selectedId ?? focusId;
                const pos = id ? positions.get(id) : null;
                if (pos) {
                  setCenter(pos.x + dim.w / 2, pos.y + dim.h / 2, { zoom: Math.max(getZoom(), 0.7), duration: 400 });
                } else {
                  fitView({ padding: 0.18, duration: 400 });
                }
              }}
              title={t("tree.center")}
              aria-label={t("tree.center")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle cx="12" cy="12" r="3" fill="currentColor" />
                <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
                <path d="M12 1v3M12 20v3M1 12h3M20 12h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </ControlButton>
            {/* Tümünü sığdır — tüm ağacı ekrana sığdır (seçimden bağımsız). */}
            <ControlButton
              onClick={() => fitView({ padding: 0.15, duration: 400 })}
              title={t("tree.fitAll")}
              aria-label={t("tree.fitAll")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M4 9V5a1 1 0 011-1h4M20 9V5a1 1 0 00-1-1h-4M4 15v4a1 1 0 001 1h4M20 15v4a1 1 0 01-1 1h-4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </ControlButton>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex">
        <div className="relative flex-1 min-w-0">
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDragStop={onNodeDragStop}
            onMove={(_, vp) => yayinlaOlcek(vp.zoom)}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onInit={onInit}
            minZoom={0.15}
            maxZoom={1.8}
            proOptions={{ hideAttribution: true }}
            /* Madde 12 — Büyük ağaçta sanallaştırma: yalnızca görünür alandaki
               düğüm/kenarlar render edilir. Küçük ağaçlarda kapalı tutuyoruz (mount
               sonrası ölçüm ve fitView davranışı aynı kalsın, gereksiz risk yok). */
            onlyRenderVisibleElements={people.length > 150}
            nodesConnectable={false}
            /* Madde 4 — Fare tekerleği ile ZOOM: panOnScroll kaldırıldı; React Flow'un
               varsayılanı olan zoomOnScroll etkin. Panlama sürükleyerek yapılır. */
            selectionOnDrag={false}
            onPaneClick={onDeselect}
            className="bg-bg"
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="var(--border)" />
          </ReactFlow>
          {/*
            Bağ kurma kipinin kenar şeridi. Tek `absolute` katman ve
            `pointer-events-none` — bir DENETİM değil, kipin açık olduğunu
            söyleyen bir işaret; tıklamayı yutmadığı için kartların üstünü
            kapatması söz konusu değil. Tuval kutusunun İÇİNDE duruyor ki
            çerçeve tam tuvali sarsın, denetim satırını değil.
          */}
          {linkMode && (
            <div className="pointer-events-none absolute inset-0 z-[5] ring-2 ring-inset ring-primary/50" aria-hidden />
          )}
        </div>

        {/*
          Mini harita — kendi SÜTUNU. Denetim değil "genel bakış", ama
          `pannable`/`zoomable` olduğu için tıklamayı yutuyor: tuvalin
          üstünde durduğu sürece altına düşen kart açılamıyordu (#307'de
          "Bağ kur" düğmesiyle 73x13px kesişmesi de aynı kökten geliyordu).
          Sütun `lg` altında hiç çizilmiyor — dar ekranda 192px'i tuvalden
          almak, haritanın verdiğinden fazlasını götürürdü; görünürlük
          eşiği eskisiyle aynı (`!hidden lg:!block`), yani bir yetenek
          kaybı yok.

          Konumlandırmayı `Panel` yerine akış yapıyor: `position: static`
          ile React Flow'un `absolute` kuralı iptal ediliyor, kutu sütunun
          alt kenarına oturuyor. `MiniMap` yalnız store'dan besleniyor
          (`useStore`/`useStoreApi`), bu yüzden `<ReactFlow>` ağacının
          dışında ama `ReactFlowProvider` içinde çalışmaya devam ediyor.
          Ölçüler sütunla eşleşiyor: 192px − 2×12px dolgu = 168px.
        */}
        <aside
          aria-label={t("tree.overview")}
          className="hidden lg:flex shrink-0 w-48 items-end p-3 border-l border-border bg-bg"
        >
          <MiniMap
            pannable
            zoomable
            style={{ position: "static", margin: 0, width: 168, height: 126 }}
            bgColor="var(--surface)"
            maskColor="color-mix(in srgb, var(--bg) 78%, transparent)"
            maskStrokeColor="var(--border-strong)"
            nodeColor={(n) => {
              if (n.type === "union") return "transparent";
              const p = (n.data as unknown as PersonNodeData)?.person;
              return p ? genderTone(p.gender).css : "var(--neutral)";
            }}
          />
        </aside>
      </div>
    </div>
  );
}

export default function FamilyTree(props: Props) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}
