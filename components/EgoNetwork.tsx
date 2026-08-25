"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Person } from "@/types/family";
import Avatar from "./ui/Avatar";
import { fullName } from "@/lib/name";
import { lifeSpan } from "@/lib/date";
import {
  indexPeople,
  getParents,
  getChildren,
  getSpouses,
  getFormerSpouses,
  getSiblings,
} from "@/lib/relations";
import { resolveAssociations } from "@/lib/associates";
import { ASSOCIATION_TYPES } from "@/types/family";
import { layoutEgo, type EgoAlter, type EgoCategory } from "@/lib/ego-layout";
import { usePrivacy } from "./PrivacyContext";
import { isMasked } from "@/lib/privacy";
import useEscapeKey from "@/lib/useEscapeKey";
import { useT } from "@/lib/i18n";

interface Props {
  /** Başlangıçta merkezlenecek kişi. */
  personId: string;
  people: Person[];
  /** Modal olarak kullanıldığında kapatma. Sekme (embedded) modunda gerekmez. */
  onClose?: () => void;
  /** Bir kişinin profilini aç (drawer). */
  onOpenProfile: (id: string) => void;
  /** true: üst-bar sekmesi içinde gömülü (tam-ekran örtü yerine alanı doldurur). */
  embedded?: boolean;
}

/** Kategori → kenar rengi (CSS değişkeni) ve etiket anahtarı. */
const CATEGORY_STYLE: Record<EgoCategory, { color: string; dashed?: boolean; labelKey: string }> = {
  parent: { color: "var(--male, #3b82f6)", labelKey: "drawer.parents" },
  partner: { color: "var(--female, #ec4899)", labelKey: "drawer.spouse" },
  child: { color: "var(--primary, #16a34a)", labelKey: "drawer.children" },
  sibling: { color: "var(--neutral, #64748b)", labelKey: "drawer.siblings" },
  associate: { color: "var(--accent, #a855f7)", dashed: true, labelKey: "drawer.associations" },
};

/**
 * Çevre grafiği — seçili kişiyi merkeze alan, doğrudan bağlarını (anne-baba,
 * eş, çocuk, kardeş ve aile-dışı yakınlar) yelpazelerle gösteren kişi-merkezli
 * ağ görünümü. Bir alter'a tıklamak grafiği ona taşır (keşif); merkeze tıklamak
 * profili açar. Gizlilik: herkes `view()` ile maskelenir; maskeli kişinin
 * yakın çevresi (arkadaş/komşu…) sızmasın diye gösterilmez.
 */
export default function EgoNetwork({ personId, people, onClose, onOpenProfile, embedded }: Props) {
  const t = useT();
  const { view, hideLiving } = usePrivacy();
  const [centerId, setCenterId] = useState(personId);
  useEscapeKey(onClose ?? (() => {}));

  const idx = useMemo(() => indexPeople(people), [people]);
  const rawCenter = idx.get(centerId);

  const stageRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setBox({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const model = useMemo(() => {
    if (!rawCenter) return null;
    const masked = isMasked(rawCenter, hideLiving);
    const center = view(rawCenter);

    // Kategori üyeleri — ham veriden hesapla, gösterimden önce maskele.
    const cats: Array<{ cat: EgoCategory; people: Person[] }> = [
      { cat: "parent", people: getParents(rawCenter, idx) },
      { cat: "partner", people: [...getSpouses(rawCenter, idx), ...getFormerSpouses(rawCenter, idx)] },
      { cat: "child", people: getChildren(rawCenter, people) },
      { cat: "sibling", people: getSiblings(rawCenter, people) },
    ];

    // Aile-dışı yakınlar — maskeli merkezde gösterme (çevresi sızmasın).
    const circle = masked ? [] : resolveAssociations(rawCenter, people);

    // id → görüntülenen kişi ve tip/rozet bilgisi.
    const seen = new Set<string>([center.id]);
    const alters: EgoAlter[] = [];
    const meta = new Map<string, { person: Person; category: EgoCategory; badge?: string }>();

    for (const { cat, people: list } of cats) {
      for (const p of list) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        alters.push({ id: p.id, category: cat });
        meta.set(p.id, { person: view(p), category: cat });
      }
    }
    for (const { person: other, type } of circle) {
      if (seen.has(other.id)) continue;
      seen.add(other.id);
      alters.push({ id: other.id, category: "associate" });
      meta.set(other.id, {
        person: view(other),
        category: "associate",
        badge: ASSOCIATION_TYPES[type]?.label ?? type,
      });
    }

    const layout = layoutEgo(alters);
    // Hangi kategoriler mevcut (açıklama/legend için).
    const present = new Set<EgoCategory>(alters.map((a) => a.category));
    return { center, masked, layout, meta, present };
  }, [rawCenter, idx, people, view, hideLiving]);

  // Sahneye sığdır: doğal boyutu ölçeklendir (çok büyükse küçült, küçükse hafif
  // büyüt). scrollWidth/Height transform'dan etkilenmez.
  const scale = useMemo(() => {
    if (!model || box.w === 0 || box.h === 0) return 1;
    const s = Math.min(box.w / model.layout.width, box.h / model.layout.height);
    return Math.max(0.35, Math.min(s, 1.15));
  }, [model, box]);

  if (!rawCenter || !model) return null;
  const { center, masked, layout, meta, present } = model;

  return (
    <div
      className={`${embedded ? "absolute inset-0" : "fixed inset-0 z-[60]"} flex flex-col bg-bg animate-fade-in`}
      role={embedded ? undefined : "dialog"}
      aria-modal={embedded ? undefined : true}
      aria-label={t("ego.title")}
    >
      {/* Başlık çubuğu */}
      <header className="shrink-0 flex items-center gap-3 px-4 h-14 border-b border-border bg-bg-elevated/85 backdrop-blur-xl">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg" aria-hidden>🕸️</span>
          <div className="min-w-0">
            <p className="font-serif font-semibold text-[15px] leading-tight text-text truncate">
              {t("ego.title")}
            </p>
            <p className="text-[11px] leading-tight text-text-subtle truncate">
              {t("ego.centeredOn", { name: fullName(center) })}
            </p>
          </div>
        </div>

        {/* Açıklama (legend) — mevcut kategoriler */}
        <div className="hidden sm:flex items-center gap-3 ml-auto mr-2 flex-wrap">
          {(Object.keys(CATEGORY_STYLE) as EgoCategory[])
            .filter((c) => present.has(c))
            .map((c) => (
              <span key={c} className="inline-flex items-center gap-1.5 text-[11px] text-text-muted">
                <span
                  className="inline-block w-4 h-0.5 rounded"
                  style={{
                    background: CATEGORY_STYLE[c].color,
                    ...(CATEGORY_STYLE[c].dashed
                      ? { backgroundImage: "none", borderTop: `2px dashed ${CATEGORY_STYLE[c].color}`, height: 0 }
                      : {}),
                  }}
                  aria-hidden
                />
                {t(CATEGORY_STYLE[c].labelKey)}
              </span>
            ))}
        </div>

        {!embedded && onClose && (
          <button
            onClick={onClose}
            aria-label={t("drawer.close")}
            className="ml-auto sm:ml-0 w-9 h-9 grid place-items-center rounded-lg text-text-subtle hover:text-text hover:bg-surface-2 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </header>

      {/* Sahne */}
      <div ref={stageRef} className="relative flex-1 overflow-hidden grid place-items-center">
        {layout.points.length === 0 ? (
          <div className="text-center px-6">
            <p className="text-3xl mb-2" aria-hidden>🌱</p>
            <p className="text-sm text-text-muted">{t("ego.empty")}</p>
          </div>
        ) : (
          <div
            style={{
              width: layout.width,
              height: layout.height,
              transform: `scale(${scale})`,
              transformOrigin: "center center",
            }}
            className="relative shrink-0"
          >
            {/* Kenarlar */}
            <svg
              width={layout.width}
              height={layout.height}
              viewBox={`0 0 ${layout.width} ${layout.height}`}
              className="absolute inset-0 pointer-events-none"
              aria-hidden
            >
              {layout.points.map((pt) => {
                const st = CATEGORY_STYLE[pt.category];
                return (
                  <line
                    key={pt.id}
                    x1={layout.cx}
                    y1={layout.cy}
                    x2={pt.x}
                    y2={pt.y}
                    stroke={st.color}
                    strokeWidth={2}
                    strokeOpacity={0.55}
                    strokeLinecap="round"
                    strokeDasharray={st.dashed ? "3 6" : undefined}
                  />
                );
              })}
            </svg>

            {/* Merkez düğüm */}
            <EgoCard
              person={center}
              x={layout.cx}
              y={layout.cy}
              center
              subtitle={masked ? t("drawer.livingMasked") : lifeSpan(center.birthDate, center.deathDate) || undefined}
              onClick={() => onOpenProfile(center.id)}
              openLabel={t("ego.openProfile")}
            />

            {/* Alterlar */}
            {layout.points.map((pt) => {
              const m = meta.get(pt.id);
              if (!m) return null;
              return (
                <EgoCard
                  key={pt.id}
                  person={m.person}
                  x={pt.x}
                  y={pt.y}
                  badge={m.badge}
                  badgeColor={CATEGORY_STYLE[pt.category].color}
                  associate={pt.category === "associate"}
                  subtitle={lifeSpan(m.person.birthDate, m.person.deathDate) || undefined}
                  onClick={() => setCenterId(pt.id)}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Alt ipucu */}
      <footer className="shrink-0 px-4 py-2 border-t border-border bg-bg-elevated/70 text-center">
        <p className="text-[11px] text-text-subtle">{t("ego.hint")}</p>
      </footer>
    </div>
  );
}

function EgoCard({
  person,
  x,
  y,
  center,
  badge,
  badgeColor,
  associate,
  subtitle,
  onClick,
  openLabel,
}: {
  person: Person;
  x: number;
  y: number;
  center?: boolean;
  badge?: string;
  badgeColor?: string;
  /** Aile-dışı yakın — cinsiyetten BAĞIMSIZ mor (accent) görünüm. */
  associate?: boolean;
  subtitle?: string;
  onClick: () => void;
  openLabel?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={openLabel}
      style={{ left: x, top: y }}
      className={`absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1 w-[120px] group ${
        center ? "z-10" : ""
      }`}
    >
      <span className={center ? "scale-110" : "transition-transform group-hover:scale-105"}>
        {/* Arkadaş avatarı cinsiyet halkası yerine mor (accent) halka alır. */}
        {associate ? (
          <Avatar person={person} size={center ? "lg" : "md"} className="ring-2 ring-accent/60" />
        ) : (
          <Avatar person={person} size={center ? "lg" : "md"} ring />
        )}
      </span>
      <span
        className={`px-2 py-1 rounded-lg border shadow-soft text-center max-w-full ${
          center
            ? "bg-primary text-primary-text border-primary"
            : associate
            ? "bg-accent-soft text-accent border-accent/40"
            : "bg-bg-elevated border-border group-hover:border-border-strong"
        }`}
      >
        {/* İsim: kısaltma (…) yok — sığmayınca alt satıra sarar. */}
        <span className={`block text-xs font-medium leading-tight break-words line-clamp-3 ${center || associate ? "" : "text-text"}`}>
          {fullName(person)}
        </span>
        {subtitle && (
          <span className={`block text-[10px] leading-tight tabular-nums truncate ${center ? "opacity-80" : associate ? "text-accent/80" : "text-text-subtle"}`}>
            {subtitle}
          </span>
        )}
      </span>
      {badge && (
        <span
          className="px-1.5 py-px rounded text-[10px] font-medium text-white leading-tight"
          style={{ background: badgeColor }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}
