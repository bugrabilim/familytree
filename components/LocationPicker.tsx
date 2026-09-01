"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  GAZETTEER,
  googleMapsUrl,
  projectEquirectangular,
  resolvePlace,
  unprojectEquirectangular,
  type LatLng,
} from "@/lib/places";
import { geocodeNominatim } from "@/lib/geocode";
import { COUNTRIES, WORLD_VIEWBOX } from "@/lib/world-map";
import { useT } from "@/lib/i18n";

const VW = WORLD_VIEWBOX.w; // 1000
const VH = WORLD_VIEWBOX.h; // 403
const MIN_W = VW / 40; // en fazla ~40× yakınlaşma (sokak ölçeği)
const MAX_W = VW;

interface Box { x: number; y: number; w: number; h: number }

/**
 * Konum seçici — gömülü dünya haritası (Natural Earth sınırları, dış istek yok).
 * Tıklayarak iğne bırakılır; tekerlek/düğmeyle yakınlaştırılır, sürükleyerek
 * gezilir. Adresten (GAZETTEER) konum bulma da var. Defin yeri seçmek için.
 */
export default function LocationPicker({
  coords,
  onChange,
  addressForGeocode,
}: {
  coords: LatLng | null;
  onChange: (c: LatLng | null) => void;
  /** Adresten "konumu bul" için serbest metin (ör. defin yeri adresi). */
  addressForGeocode?: string;
}) {
  const t = useT();
  const svgRef = useRef<SVGSVGElement | null>(null);

  const initialBox = useMemo<Box>(() => {
    // İğne varsa oraya, yoksa Türkiye çevresine odaklan (kullanıcı kitlesi).
    const center = coords ?? GAZETTEER["Kayseri"] ?? { lat: 39, lng: 35 };
    const w = coords ? VW / 12 : VW / 3.2;
    const h = w * (VH / VW);
    const { x, y } = projectEquirectangular(center.lat, center.lng, VW, VH);
    return clampBox({ x: x - w / 2, y: y - h / 2, w, h });
  }, [coords]);

  const [box, setBox] = useState<Box>(initialBox);
  const boxRef = useRef<Box>(initialBox);
  useEffect(() => { boxRef.current = box; }, [box]);

  const k = VW / box.w;
  const s = useCallback((px: number) => px / k, [k]);

  const pin = coords ? projectEquirectangular(coords.lat, coords.lng, VW, VH) : null;

  const zoomAt = useCallback((factor: number, px: number, py: number) => {
    const b = boxRef.current;
    const w = Math.min(MAX_W, Math.max(MIN_W, b.w / factor));
    const h = w * (VH / VW);
    const wx = b.x + px * b.w;
    const wy = b.y + py * b.h;
    setBox(clampBox({ x: wx - px * w, y: wy - py * h, w, h }));
  }, []);

  // Tekerlek ile yakınlaştır (sayfayı kaydırmadan).
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      zoomAt(Math.exp(-e.deltaY * 0.0015), Math.min(1, Math.max(0, px)), Math.min(1, Math.max(0, py)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const drag = useRef<{ id: number; sx: number; sy: number; moved: boolean } | null>(null);
  const didPan = useRef(false);

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false };
    didPan.current = false;
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const el = svgRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) > 3) {
      d.moved = true;
      didPan.current = true;
      el.setPointerCapture(e.pointerId);
    }
    if (!d.moved) return;
    d.sx = e.clientX;
    d.sy = e.clientY;
    const b = boxRef.current;
    setBox(clampBox({ ...b, x: b.x - (dx / rect.width) * b.w, y: b.y - (dy / rect.height) * b.h }));
  };
  const endPan = (e: React.PointerEvent<SVGSVGElement>) => {
    if (drag.current?.id === e.pointerId) {
      svgRef.current?.releasePointerCapture?.(e.pointerId);
      drag.current = null;
    }
  };

  const placePin = (e: React.MouseEvent<SVGSVGElement>) => {
    if (didPan.current) return; // sürükleme tıklama sayılmaz
    const el = svgRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    const vx = box.x + px * box.w;
    const vy = box.y + py * box.h;
    const ll = unprojectEquirectangular(vx, vy, VW, VH);
    onChange({ lat: Math.round(ll.lat * 1e5) / 1e5, lng: Math.round(ll.lng * 1e5) / 1e5 });
  };

  const focusOn = (hit: LatLng) => {
    onChange({ lat: Math.round(hit.lat * 1e5) / 1e5, lng: Math.round(hit.lng * 1e5) / 1e5 });
    const w = VW / 12;
    const h = w * (VH / VW);
    const { x, y } = projectEquirectangular(hit.lat, hit.lng, VW, VH);
    setBox(clampBox({ x: x - w / 2, y: y - h / 2, w, h }));
  };

  // "Adresten konumu bul": önce yerel sözlük (anlık), yoksa canlı Nominatim.
  const [geoBusy, setGeoBusy] = useState(false);
  const geocode = async () => {
    const q = addressForGeocode?.trim();
    if (!q) return;
    const local = resolvePlace(q);
    if (local) { focusOn(local); return; }
    setGeoBusy(true);
    try {
      const hit = await geocodeNominatim(q);
      if (hit) focusOn(hit);
    } finally {
      setGeoBusy(false);
    }
  };

  // Serbest arama (canlı Nominatim) — ör. "Evlek, Gürgentepe, Ordu".
  const [query, setQuery] = useState("");
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchMiss, setSearchMiss] = useState(false);
  const search = async () => {
    const q = query.trim();
    if (!q) return;
    setSearchBusy(true);
    setSearchMiss(false);
    try {
      const hit = resolvePlace(q) ?? (await geocodeNominatim(q));
      if (hit) focusOn(hit);
      else setSearchMiss(true);
    } finally {
      setSearchBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      {/* Serbest arama — köy/mahalle/ilçe adını (şehir bilgisiyle) yaz, canlı
          coğrafi kodlamayla bul; iğneyi oraya taşır. Yer adı METNİ değişmez. */}
      <div className="flex items-center gap-2">
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSearchMiss(false); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); search(); } }}
          placeholder={t("loc.searchPlaceholder")}
          className="flex-1 h-8 px-2.5 rounded-lg bg-surface-2 border border-border text-xs text-text placeholder:text-text-subtle focus:outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={search}
          disabled={!query.trim() || searchBusy}
          className="h-8 px-2.5 rounded-lg border border-primary/30 bg-primary-soft text-[11px] font-medium text-primary disabled:opacity-50 transition-colors"
        >
          {searchBusy ? t("loc.searching") : t("loc.search")}
        </button>
      </div>
      {searchMiss && <p className="text-[11px] text-danger">{t("loc.searchMiss")}</p>}

      <div className="flex items-center gap-2">
        {addressForGeocode?.trim() && (
          <button
            type="button"
            onClick={geocode}
            disabled={geoBusy}
            className="h-8 px-2.5 rounded-lg border border-border bg-surface hover:bg-surface-2 text-[11px] font-medium text-text-muted disabled:opacity-50 transition-colors"
          >
            {geoBusy ? t("loc.searching") : t("burial.geocode")}
          </button>
        )}
        {coords && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="h-8 px-2.5 rounded-lg border border-border bg-surface hover:bg-surface-2 text-[11px] font-medium text-danger transition-colors"
          >
            {t("burial.clear")}
          </button>
        )}
        {coords && (
          <a
            href={googleMapsUrl(`${coords.lat},${coords.lng}`)}
            target="_blank"
            rel="noopener noreferrer"
            className="h-8 inline-flex items-center gap-1.5 px-2.5 rounded-lg border border-border bg-surface hover:bg-surface-2 text-[11px] font-medium text-primary transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M12 21s6-5.6 6-10.4A6 6 0 006 10.6C6 15.4 12 21 12 21z M12 8.4a2.1 2.1 0 100 4.2 2.1 2.1 0 000-4.2z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
            </svg>
            {t("burial.gmaps")}
          </a>
        )}
        <span className="ml-auto text-[11px] tabular-nums text-text-subtle">
          {coords ? `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}` : t("burial.noPin")}
        </span>
      </div>

      <div className="relative rounded-xl overflow-hidden border border-border bg-surface-2">
        <svg
          ref={svgRef}
          viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
          className="w-full block select-none cursor-crosshair"
          style={{ height: 200, touchAction: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPan}
          onPointerCancel={endPan}
          onClick={placePin}
          role="img"
          aria-label={t("burial.mapAria")}
        >
          <rect x={0} y={0} width={VW} height={VH} fill="var(--surface-2)" />
          <g fill="var(--surface-3)" stroke="var(--border-strong)" strokeWidth={s(0.6)} strokeLinejoin="round">
            {COUNTRIES.map((c, i) => <path key={i} d={c.d} />)}
          </g>
          {pin && (
            <g style={{ pointerEvents: "none" }}>
              <circle cx={pin.x} cy={pin.y} r={s(9)} fill="var(--primary)" fillOpacity={0.25} />
              <path
                d={`M${pin.x} ${pin.y - s(16)} c ${s(6)} 0 ${s(10)} ${s(5)} ${s(10)} ${s(11)} c 0 ${s(8)} -${s(10)} ${s(16)} -${s(10)} ${s(16)} c 0 0 -${s(10)} -${s(8)} -${s(10)} -${s(16)} c 0 -${s(6)} ${s(4)} -${s(11)} ${s(10)} -${s(11)} z`}
                fill="var(--primary)"
                stroke="var(--primary-text)"
                strokeWidth={s(1)}
              />
              <circle cx={pin.x} cy={pin.y - s(5)} r={s(3.2)} fill="var(--primary-text)" />
            </g>
          )}
        </svg>

        <div className="absolute top-1.5 right-1.5 flex flex-col gap-1">
          <button type="button" onClick={() => zoomAt(1.6, 0.5, 0.5)} aria-label={t("map.zoomIn")}
            className="w-7 h-7 grid place-items-center rounded-lg bg-surface/90 border border-border text-text hover:bg-surface-2 text-base leading-none shadow-sm">+</button>
          <button type="button" onClick={() => zoomAt(1 / 1.6, 0.5, 0.5)} aria-label={t("map.zoomOut")}
            className="w-7 h-7 grid place-items-center rounded-lg bg-surface/90 border border-border text-text hover:bg-surface-2 text-base leading-none shadow-sm">−</button>
        </div>
        <p className="absolute bottom-1.5 left-2 text-[10px] text-text-subtle bg-surface/70 rounded px-1.5 py-0.5 pointer-events-none">
          {t("burial.hint")}
        </p>
      </div>
    </div>
  );
}

function clampBox(b: Box): Box {
  const w = Math.min(MAX_W, Math.max(MIN_W, b.w));
  const h = w * (VH / VW);
  const x = Math.min(Math.max(0, b.x), VW - w);
  const y = Math.min(Math.max(0, b.y), VH - h);
  return { x, y, w, h };
}
