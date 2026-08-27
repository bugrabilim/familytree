"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Person } from "@/types/family";
import Avatar from "./ui/Avatar";
import { fullName } from "@/lib/name";
import { usePrivacy } from "./PrivacyContext";
import { aggregatePlaces, gazetteerExact, resolvePlace, googleMapsUrl } from "@/lib/places";
import { geocodeNominatim } from "@/lib/geocode";
import { useT } from "@/lib/i18n";

/** Coğrafi kodlama sonuçlarının tarayıcı önbelleği (yer adı → koordinat/null). */
const GEO_LS_KEY = "soyagaci:geo:v1";
function loadGeoCache(): Record<string, LatLng | null> {
  try {
    const raw = window.localStorage.getItem(GEO_LS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, LatLng | null>) : {};
  } catch {
    return {};
  }
}
function saveGeoCache(cache: Record<string, LatLng | null>) {
  try {
    window.localStorage.setItem(GEO_LS_KEY, JSON.stringify(cache));
  } catch {
    /* kota/gizli mod → yoksay */
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Props {
  people: Person[];
  onSelect: (id: string) => void;
}

type LatLng = { lat: number; lng: number };

/**
 * Doğum yerleri haritası (Madde 12) — gerçek OpenStreetMap döşemeleri (Leaflet,
 * anahtarsız/ücretsiz). Her doğum yeri sayıya göre büyüyen bir daire; tıklayınca
 * o yerde doğanlar yan panelde listelenir. İsteğe bağlı göç yolları (ebeveyn →
 * çocuk doğum yeri) çizgi olarak. Gizlilik: kişiler `view()`'den geçirilir; gizli
 * yaşayanların doğum yeri koordinatı bulunmadığından haritaya düşmez.
 *
 * NOT: Bu bileşen `Workspace`'te yalnız istemcide (`ssr:false`) yüklenir; bu yüzden
 * `leaflet` üst düzey import'u güvenlidir (modül sunucuda değerlendirilmez).
 */
export default function PlacesMap({ people, onSelect }: Props) {
  const { view: priv } = usePrivacy();
  const t = useT();
  const [activePlace, setActivePlace] = useState<string | null>(null);
  const [showMigration, setShowMigration] = useState(false);

  // Doğum yılı sınırları + dönem (era) süzgeci — haritayı zamanda daralt.
  const yearBounds = useMemo(() => {
    let mn = Infinity;
    let mx = -Infinity;
    for (const p of people) {
      const y = p.birthDate ? parseInt(p.birthDate.slice(0, 4), 10) : NaN;
      if (Number.isFinite(y)) { mn = Math.min(mn, y); mx = Math.max(mx, y); }
    }
    return mn === Infinity || mn === mx ? null : { min: mn, max: mx };
  }, [people]);

  const [era, setEra] = useState<[number, number] | null>(null);
  const a0 = era ? era[0] : yearBounds?.min ?? null;
  const a1 = era ? era[1] : yearBounds?.max ?? null;

  // Dönem süzgeci uygulanmış kişiler (tarihsizler daima dâhil).
  const eraFiltered = useMemo(() => {
    if (a0 === null || a1 === null || !yearBounds || (a0 <= yearBounds.min && a1 >= yearBounds.max))
      return people;
    return people.filter((p) => {
      const y = p.birthDate ? parseInt(p.birthDate.slice(0, 4), 10) : NaN;
      return !Number.isFinite(y) || (y >= a0 && y <= a1);
    });
  }, [people, a0, a1, yearBounds]);

  // GİZLİLİK: kişileri görüntü katmanından geçir; maskeli (gizli yaşayan)
  // kişide `birthPlace` bulunmadığından doğum yeri sızmaz.
  const baseAgg = useMemo(
    () => aggregatePlaces(eraFiltered.map((p) => priv(p))),
    [eraFiltered, priv]
  );

  // Canlı coğrafi kodlama önbelleği (yer adı → koordinat/null). Sözlükte tam
  // karşılığı olmayan yerler (köy/mahalle/ilçe, yurt dışı) buradan gelir.
  // Bileşen yalnız istemcide (ssr:false) yüklendiğinden başlangıçta LS okunabilir.
  const [geo, setGeo] = useState<Record<string, LatLng | null>>(() => loadGeoCache());

  /**
   * Bir yerin koordinatı: (1) sözlükte TAM karşılığı varsa onu (anlık); yoksa
   * (2) coğrafi kodlama sonucunu (kayıt neresiyse ORASI); kodlama denendi ama
   * bulunamadıysa (3) son çare hiyerarşik sözlük (ör. köy bulunamazsa ili);
   * henüz denenmediyse `null` (kodlanınca dolar). "Köy görünce şehri işaretle"
   * yapmayız — önce gerçek yeri kodlarız.
   */
  const coordsFor = useMemo(() => {
    return (place: string): LatLng | null => {
      const exact = gazetteerExact(place);
      if (exact) return exact;
      if (place in geo) return geo[place] ?? resolvePlace(place);
      return null; // kodlama bekleniyor
    };
  }, [geo]);

  const aggregates = useMemo(
    () => baseAgg.map((a) => ({ ...a, coords: coordsFor(a.place) })),
    [baseAgg, coordsFor]
  );

  const located = useMemo(() => aggregates.filter((a) => a.coords), [aggregates]);
  const unlocated = useMemo(() => aggregates.filter((a) => !a.coords), [aggregates]);

  // Sözlükte tam karşılığı olmayan ve henüz kodlanmamış yerleri Nominatim ile
  // (dünya geneli) sırayla kodla; Nominatim ilkesi gereği ~1 istek/sn aralıkla.
  // Sonuçlar tarayıcı önbelleğine yazılır → sonraki açılışlar anlık.
  useEffect(() => {
    const pending = baseAgg
      .map((a) => a.place)
      .filter((place) => !gazetteerExact(place));
    if (pending.length === 0) return;

    let cancelled = false;
    const ctrl = new AbortController();
    (async () => {
      // Atlama kararının kaynağı LS önbelleği (durum zamanlamasından bağımsız).
      const cache = loadGeoCache();
      for (const place of pending) {
        if (cancelled) return;
        if (place in cache) continue; // daha önce denendi (bulundu ya da null)
        const coord = await geocodeNominatim(place, ctrl.signal);
        if (cancelled) return;
        cache[place] = coord;
        saveGeoCache(cache);
        setGeo((g) => ({ ...g, [place]: coord }));
        await sleep(1100); // Nominatim: saniyede en fazla bir istek
      }
    })();
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [baseAgg]);

  // Kişi → doğum yeri koordinatı (maskeli aggregate'lerden → gizlilik korunur).
  const personCoord = useMemo(() => {
    const m = new Map<string, LatLng>();
    for (const a of located) if (a.coords) for (const id of a.personIds) m.set(id, a.coords);
    return m;
  }, [located]);

  // Göç yolları — ebeveyn doğum yeri → çocuk doğum yeri (farklıysa). Yinelenen
  // aynı yol kalınlaşır. Gizli kişiler koordinatsız olduğundan otomatik dışlanır.
  const migrations = useMemo(() => {
    const map = new Map<string, { from: LatLng; to: LatLng; n: number }>();
    for (const p of eraFiltered) {
      const c = personCoord.get(p.id);
      if (!c) continue;
      for (const pid of p.parentIds ?? []) {
        const pc = personCoord.get(pid);
        if (!pc || (pc.lat === c.lat && pc.lng === c.lng)) continue;
        const key = `${pc.lat},${pc.lng}>${c.lat},${c.lng}`;
        const e = map.get(key);
        if (e) e.n++;
        else map.set(key, { from: pc, to: c, n: 1 });
      }
    }
    return [...map.values()];
  }, [eraFiltered, personCoord]);

  const maxCount = useMemo(() => located.reduce((m, a) => Math.max(m, a.count), 1), [located]);

  // id → kişi (maskeli) — yan listede göstermek için
  const byId = useMemo(() => {
    const m = new Map<string, Person>();
    for (const p of people) m.set(p.id, priv(p));
    return m;
  }, [people, priv]);

  const active = useMemo(
    () => located.find((a) => a.place === activePlace) ?? null,
    [located, activePlace]
  );

  if (people.length === 0 || aggregates.length === 0) {
    return (
      <div className="h-full grid place-items-center p-6">
        <div className="text-center max-w-sm">
          <p className="text-4xl mb-3">🗺️</p>
          <h2 className="font-serif text-xl font-semibold text-text mb-1.5">{t("map.emptyTitle")}</h2>
          <p className="text-sm text-text-muted">{t("map.emptyBody")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h1 className="font-serif text-xl font-semibold text-text">{t("map.title")}</h1>
            <p className="text-sm text-text-muted">
              {t("map.subtitle", { located: located.length, total: aggregates.length })}
            </p>
          </div>
          <p className="text-[11px] text-text-subtle shrink-0 hidden sm:block">{t("map.navHint")}</p>
        </div>

        {/* Denetimler — göç yolları + dönem süzgeci */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            onClick={() => setShowMigration((v) => !v)}
            aria-pressed={showMigration}
            className={`flex items-center gap-2 h-9 px-3 rounded-lg border text-xs font-medium transition-colors ${
              showMigration
                ? "border-accent bg-accent-soft text-accent"
                : "border-border bg-surface hover:bg-surface-2 text-text-muted"
            }`}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M5 19c6-1 8-13 14-14M13 5h6v6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {t("map.migration")}
            {/* #6 — Sayaç sabit genişlikte: dönem kaydırılınca sayı değişse (ya da
               0'a düşse) bile düğme genişlemez/daralmaz, sonraki denetimler kaymaz. */}
            {showMigration && (
              <span className="tabular-nums inline-block w-9 text-left">
                {migrations.length > 0 ? `· ${migrations.length}` : ""}
              </span>
            )}
          </button>

          {yearBounds && a0 !== null && a1 !== null && (
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <span className="shrink-0">{t("map.era")}</span>
              <input
                type="range"
                min={yearBounds.min}
                max={yearBounds.max}
                value={a0}
                onChange={(e) => setEra([Math.min(Number(e.target.value), a1), a1])}
                className="w-20 accent-[var(--primary)]"
                aria-label={t("map.eraFrom")}
              />
              <span className="tabular-nums w-[5.5rem] text-center text-text">{a0}–{a1}</span>
              <input
                type="range"
                min={yearBounds.min}
                max={yearBounds.max}
                value={a1}
                onChange={(e) => setEra([a0, Math.max(Number(e.target.value), a0)])}
                className="w-20 accent-[var(--primary)]"
                aria-label={t("map.eraTo")}
              />
              {(a0 > yearBounds.min || a1 < yearBounds.max) && (
                <button onClick={() => setEra(null)} className="text-[11px] text-text-subtle hover:text-text">
                  {t("map.eraAll")}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="space-y-6">
          {/* Gerçek OSM harita tuvali (Leaflet) — yazdırılamadığından no-print. */}
          <div className="no-print relative rounded-2xl border border-border bg-surface p-2 sm:p-3">
            <TileMap
              located={located}
              migrations={migrations}
              showMigration={showMigration}
              maxCount={maxCount}
              activeCoords={active?.coords ?? null}
              onPick={setActivePlace}
              ariaLabel={t("map.ariaMap")}
            />
          </div>

          {/* Yan paneller — harita altında ızgara */}
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 items-start">
            {active ? (
              <section className="rounded-2xl border border-border bg-surface p-4">
                <div className="flex items-baseline justify-between gap-2 mb-3">
                  <h2 className="font-serif text-base font-semibold text-text truncate">{active.place}</h2>
                  <button
                    onClick={() => setActivePlace(null)}
                    className="text-[11px] text-text-subtle hover:text-text shrink-0"
                  >
                    {t("map.close")}
                  </button>
                </div>
                <a
                  href={googleMapsUrl(active.coords ? `${active.coords.lat},${active.coords.lng}` : active.place)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mb-3 inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-border bg-surface hover:bg-surface-2 text-[11px] font-medium text-primary transition-colors"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M12 21s6-5.6 6-10.4A6 6 0 006 10.6C6 15.4 12 21 12 21z M12 8.4a2.1 2.1 0 100 4.2 2.1 2.1 0 000-4.2z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
                  </svg>
                  {t("map.openGmaps")}
                </a>
                <PersonList ids={active.personIds} byId={byId} onSelect={onSelect} />
              </section>
            ) : (
              <section className="rounded-2xl border border-border bg-surface-2/60 p-4">
                <p className="text-sm text-text-muted">{t("map.clickHint")}</p>
              </section>
            )}

            {/* En sık doğum yerleri */}
            <section className="rounded-2xl border border-border bg-surface p-4">
              <h2 className="font-serif text-base font-semibold text-text mb-3">{t("map.topPlaces")}</h2>
              <ul className="space-y-1">
                {aggregates.slice(0, 8).map((a) => (
                  <li key={a.place}>
                    <button
                      onClick={() => a.coords && setActivePlace(a.place)}
                      className={`w-full flex items-center gap-3 px-2 py-1.5 -mx-2 rounded-lg text-left transition-colors ${
                        a.coords ? "hover:bg-surface-2" : "cursor-default"
                      }`}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{
                          background: a.coords ? "var(--primary)" : "var(--text-subtle)",
                          opacity: a.coords ? 0.7 : 0.4,
                        }}
                      />
                      <span className="text-sm text-text truncate flex-1 min-w-0">
                        {a.place}
                        {!a.coords && <span className="text-text-subtle">{t("map.noLocation")}</span>}
                      </span>
                      <span className="text-xs text-text-muted tabular-nums shrink-0">{a.count}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            {/* Konumu bilinmeyen yerler */}
            {unlocated.length > 0 && (
              <section className="rounded-2xl border border-border bg-surface p-4">
                <div className="flex items-baseline justify-between gap-2 mb-3">
                  <h2 className="font-serif text-base font-semibold text-text">{t("map.unlocatedTitle")}</h2>
                  <span className="text-[11px] text-text-subtle shrink-0">{unlocated.length}</span>
                </div>
                <p className="text-[11px] text-text-subtle mb-3">{t("map.unlocatedBody")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {unlocated.map((a) => (
                    <span
                      key={a.place}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-2 text-xs text-text"
                    >
                      {a.place}
                      <span className="text-text-subtle tabular-nums">{a.count}</span>
                    </span>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */

/** Leaflet + OSM döşeme haritası. Kişi verisi React tarafında; burada yalnız
 *  görselleştirme (imperatif Leaflet API'si effect'lerle senkronlanır). */
function TileMap({
  located,
  migrations,
  showMigration,
  maxCount,
  activeCoords,
  onPick,
  ariaLabel,
}: {
  located: ReturnType<typeof aggregatePlaces>;
  migrations: Array<{ from: LatLng; to: LatLng; n: number }>;
  showMigration: boolean;
  maxCount: number;
  activeCoords: LatLng | null;
  onPick: (place: string) => void;
  ariaLabel: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const migRef = useRef<L.LayerGroup | null>(null);
  const fitted = useRef(false);
  const onPickRef = useRef(onPick);
  useEffect(() => { onPickRef.current = onPick; });

  // Haritayı bir kez kur.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { worldCopyJump: true, minZoom: 2 }).setView([39, 35], 4);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap katkıda bulunanlar",
    }).addTo(map);
    markersRef.current = L.layerGroup().addTo(map);
    migRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    // Konteyner ilk render'da tam boyutlanmamış olabilir.
    setTimeout(() => map.invalidateSize(), 0);
    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = null;
      migRef.current = null;
    };
  }, []);

  // Doğum-yeri işaretçileri.
  useEffect(() => {
    const g = markersRef.current;
    const map = mapRef.current;
    if (!g || !map) return;
    g.clearLayers();
    const pts: L.LatLngExpression[] = [];
    for (const a of located) {
      if (!a.coords) continue;
      const r = 5 + 11 * Math.sqrt(a.count / maxCount);
      const marker = L.circleMarker([a.coords.lat, a.coords.lng], {
        radius: r,
        color: "#8a1f1f",
        weight: 1,
        fillColor: "#c0392b",
        fillOpacity: 0.55,
      });
      marker.bindTooltip(`${a.place} · ${a.count}`, { direction: "top" });
      marker.on("click", () => onPickRef.current(a.place));
      marker.addTo(g);
      pts.push([a.coords.lat, a.coords.lng]);
    }
    if (pts.length && !fitted.current) {
      fitted.current = true;
      map.fitBounds(pts as L.LatLngBoundsExpression, { padding: [40, 40], maxZoom: 8 });
    }
  }, [located, maxCount]);

  // Göç yolları.
  useEffect(() => {
    const g = migRef.current;
    if (!g) return;
    g.clearLayers();
    if (!showMigration) return;
    for (const m of migrations) {
      L.polyline(
        [
          [m.from.lat, m.from.lng],
          [m.to.lat, m.to.lng],
        ],
        { color: "#2563eb", weight: Math.min(5, 1 + m.n), opacity: 0.45 }
      ).addTo(g);
    }
  }, [migrations, showMigration]);

  // Seçili yere uç (yan panelden ya da işaretçiden seçilince).
  useEffect(() => {
    const map = mapRef.current;
    if (map && activeCoords) {
      map.flyTo([activeCoords.lat, activeCoords.lng], Math.max(map.getZoom(), 9), { duration: 0.6 });
    }
  }, [activeCoords]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={ariaLabel}
      className="w-full h-[58vh] sm:h-[70vh] rounded-xl overflow-hidden z-0"
    />
  );
}

function PersonList({
  ids,
  byId,
  onSelect,
}: {
  ids: string[];
  byId: Map<string, Person>;
  onSelect: (id: string) => void;
}) {
  const coll = new Intl.Collator("tr");
  const people = ids
    .map((id) => byId.get(id))
    .filter((p): p is Person => !!p)
    .sort((a, b) => coll.compare(fullName(a), fullName(b)));

  return (
    <ul className="max-h-80 overflow-y-auto space-y-0.5 pr-0.5">
      {people.map((p) => (
        <li key={p.id}>
          <button
            onClick={() => onSelect(p.id)}
            className="w-full flex items-center gap-2.5 px-2 py-1.5 -mx-1 rounded-lg hover:bg-surface-2 transition-colors text-left"
          >
            <Avatar person={p} size="xs" />
            <span className="text-sm text-text truncate flex-1 min-w-0">{fullName(p)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
