"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  GAZETTEER,
  projectEquirectangular,
  resolvePlace,
  unprojectEquirectangular,
  type LatLng,
} from "@/lib/places";
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

  const geocode = () => {
    const hit = addressForGeocode ? resolvePlace(addressForGeocode) : null;
    if (hit) {
      onChange({ lat: hit.lat, lng: hit.lng });
      const w = VW / 12;
      const h = w * (VH / VW);
      const { x, y } = projectEquirectangular(hit.lat, hit.lng, VW, VH);
      setBox(clampBox({ x: x - w / 2, y: y - h / 2, w, h }));
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={geocode}
          disabled={!addressForGeocode?.trim()}
          className="h-8 px-2.5 rounded-lg border border-border bg-surface hover:bg-surface-2 text-[11px] font-medium text-text-muted disabled:opacity-50 transition-colors"
        >
          {t("burial.geocode")}
        </button>
        {coords && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="h-8 px-2.5 rounded-lg border border-border bg-surface hover:bg-surface-2 text-[11px] font-medium text-danger transition-colors"
          >
            {t("burial.clear")}
          </button>
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
