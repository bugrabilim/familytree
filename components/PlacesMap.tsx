"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Person } from "@/types/family";
import Avatar from "./ui/Avatar";
import { fullName } from "@/lib/name";
import { usePrivacy } from "./PrivacyContext";
import { aggregatePlaces, gazetteerExact, resolvePlace, googleMapsUrl } from "@/lib/places";
import { aggregateSurnames, surnamesByPlace } from "@/lib/surnames";
import { computeGenerations } from "@/lib/book-stats";
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

/** Katman renkleri: doğum yerleri kırmızı, defin (mezar) yerleri mor. */
const BIRTH_COLOR = "#c0392b";
const BIRTH_BORDER = "#8a1f1f";
const BURIAL_COLOR = "#7c3aed";
/** Belgeye dayanan kişisel göç yolu (kullanıcının girdiği taşınmalar). */
const MIG_PERSONAL = "#2563eb";
/**
 * Ağaçtan çıkarılan kuşak kayması — belge değil, o yüzden soluk ve kesikli.
 * Mor KULLANILAMAZ: defin işaretçilerinin rengi o; aynı moru çizgide de
 * kullanmak "bu çizgi mezarlarla ilgili" izlenimi verirdi.
 */
const MIG_GENERATION = "#64748b";
const BURIAL_BORDER = "#5b21b6";

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
  const [activeKind, setActiveKind] = useState<"birth" | "burial">("birth");
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

  /*
   * Kuşak süzgeci. Kuşaklar TÜM ağaçtan hesaplanır, dönem süzgecinden geçmiş
   * listeden değil: yoksa kaydırıcı bir atayı dışarıda bırakınca torunun kuşak
   * numarası düşer ve rozetler kayıcı bir şey ölçmeye başlar.
   *
   * Ham `people` üzerinden hesaplamak gizlilik açısından sorun değil: kuşak
   * yalnız `parentIds`e bakar, `maskPerson` de onu aynen taşır — maskeli
   * kopyadan hesaplansa sonuç birebir aynı çıkardı.
   */
  const genOf = useMemo(() => computeGenerations(people), [people]);
  const maxGen = useMemo(() => Math.max(1, ...genOf.values()), [genOf]);
  /*
   * Rozet değil ARALIK: derin bir ağaçta kuşak sayısı ona, yirmiye çıkıyor
   * (demo ağacı 17) ve o kadar rozet bir sıra numara şeridine dönüşüyor.
   * İki uçlu kaydırıcı hem yer kaplamıyor hem de dönem kaydırıcısıyla aynı
   * dili konuşuyor: biri zamanı, öbürü ağaçtaki derinliği daraltıyor.
   */
  const [genRange, setGenRange] = useState<[number, number] | null>(null);
  const g0 = genRange ? genRange[0] : 1;
  const g1 = genRange ? genRange[1] : maxGen;
  const genAll = g0 <= 1 && g1 >= maxGen;

  const genFiltered = useMemo(
    () =>
      genAll
        ? eraFiltered
        : eraFiltered.filter((p) => {
            const g = genOf.get(p.id);
            return g !== undefined && g >= g0 && g <= g1;
          }),
    [eraFiltered, genOf, genAll, g0, g1]
  );

  // GİZLİLİK: kişileri görüntü katmanından BİR KEZ geçir; maskeli (gizli
  // yaşayan) kişide `birthPlace` bulunmadığından doğum yeri sızmaz. Aşağıdaki
  // her katman bu listeden türer — ham `people` bir daha okunmaz.
  const viewed = useMemo(() => genFiltered.map((p) => priv(p)), [genFiltered, priv]);

  // Soyadı yaygınlık katmanı: bir soyadı seçilince harita o soyadı taşıyanlara
  // daralır — "bu ad nerede yoğunlaşmış" sorusu ancak böyle görülür. Eşleştirme
  // `aggregateSurnames`in `personIds`i üzerinden yapılır; yazım katlama kuralı
  // (İ/ı, ğ, ş…) böylece tek yerde, `lib/surnames.ts`te kalır.
  const surnameStats = useMemo(() => aggregateSurnames(viewed), [viewed]);
  const [surnameKey, setSurnameKey] = useState<string | null>(null);
  // Seçili soyadı listeden düşerse (kayıt silindi, dönem süzgeci daraldı)
  // TÜRETME kendiliğinden "tümü"ne döner — durumu efektle temizlemeye gerek yok.
  const activeSurname = useMemo(
    () => surnameStats.surnames.find((s) => s.key === surnameKey) ?? null,
    [surnameStats, surnameKey]
  );
  const surnameIds = useMemo(
    () => (activeSurname ? new Set(activeSurname.personIds) : null),
    [activeSurname]
  );

  const scoped = useMemo(
    () => (surnameIds ? viewed.filter((p) => surnameIds.has(p.id)) : viewed),
    [viewed, surnameIds]
  );

  const baseAgg = useMemo(() => aggregatePlaces(scoped), [scoped]);

  // Elle düzeltilmiş doğum-yeri koordinatları (birthCoords) — yer adına göre.
  // Aynı adlı köy/mahalle karışıklığında kayıttaki koordinat, coğrafi kodlamaya
  // tercih edilir; böylece yanlış yere düşen bir yer düzeltilebilir. Yer METNİ
  // değişmez. Bir yerde birden çok kişi varsa ilk bulunan koordinat kullanılır.
  const placeOverride = useMemo(() => {
    const m = new Map<string, LatLng>();
    // `viewed` üzerinden: gizli bir kaydın koordinatı, o yeri paylaşan görünür
    // kişilerin konumunu belirlemesin. Gizlilik katmanı verinin TEK kapısıdır.
    for (const p of viewed) {
      const place = p.birthPlace?.trim();
      const c = p.birthCoords;
      if (place && c && !m.has(place)) m.set(place, c);
    }
    return m;
  }, [viewed]);

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
      // (0) Elle düzeltilmiş koordinat her şeyin önünde gelir.
      const ov = placeOverride.get(place);
      if (ov) return ov;
      const exact = gazetteerExact(place);
      if (exact) return exact;
      if (place in geo) return geo[place] ?? resolvePlace(place);
      return null; // kodlama bekleniyor
    };
  }, [geo, placeOverride]);

  const aggregates = useMemo(
    () => baseAgg.map((a) => ({ ...a, coords: coordsFor(a.place) })),
    [baseAgg, coordsFor]
  );

  const located = useMemo(() => aggregates.filter((a) => a.coords), [aggregates]);
  const unlocated = useMemo(() => aggregates.filter((a) => !a.coords), [aggregates]);

  // Defin (mezar) yerleri — ayrı katman. `burialPlace`e göre gruplanır;
  // koordinat önce kayıttaki `burialCoords` (elle seçilmiş), yoksa sözlük /
  // coğrafi kodlama. Doğum yerlerinden AYRI renkte gösterilir (kullanıcı #).
  const burialBase = useMemo(() => {
    const map = new Map<string, { place: string; count: number; personIds: string[]; override: LatLng | null }>();
    for (const mp of scoped) {
      const place = mp.burialPlace?.trim();
      if (!place) continue;
      let e = map.get(place);
      if (!e) { e = { place, count: 0, personIds: [], override: null }; map.set(place, e); }
      e.count++;
      e.personIds.push(mp.id);
      if (!e.override && mp.burialCoords) e.override = mp.burialCoords;
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [scoped]);

  const burialAgg = useMemo(
    () =>
      burialBase.map((a) => {
        const coords =
          a.override ??
          gazetteerExact(a.place) ??
          (a.place in geo ? (geo[a.place] ?? resolvePlace(a.place)) : null);
        return { place: a.place, count: a.count, personIds: a.personIds, coords };
      }),
    [burialBase, geo]
  );
  /**
   * Kullanıcının kendi girdiği göç/taşınma olaylarının yerleri.
   *
   * Bunlar doğum ya da defin yeri değil; kimse haritaya koymadığı sürece
   * görünmüyorlardı — oysa "ne zaman nereye taşındı" bilgisinin en doğrudan
   * kaynağı bu. `events` gizli bir alan grubudur, o yüzden `scoped` (maskeden
   * geçmiş) liste okunur: gizli bir kişinin taşınma yeri sızmaz.
   */
  const eventPlaces = useMemo(() => {
    const set = new Set<string>();
    for (const p of scoped) {
      for (const ev of p.events ?? []) {
        if (ev.type !== "goc-tasinma") continue;
        const place = ev.place?.trim();
        if (place) set.add(place);
      }
    }
    return [...set];
  }, [scoped]);

  const burialLocated = useMemo(() => burialAgg.filter((a) => a.coords), [burialAgg]);
  const maxBurial = useMemo(() => burialLocated.reduce((m, a) => Math.max(m, a.count), 1), [burialLocated]);

  // Sözlükte tam karşılığı olmayan ve henüz kodlanmamış yerleri Nominatim ile
  // (dünya geneli) sırayla kodla; Nominatim ilkesi gereği ~1 istek/sn aralıkla.
  // Sonuçlar tarayıcı önbelleğine yazılır → sonraki açılışlar anlık.
  useEffect(() => {
    const burialPending = burialBase
      .filter((a) => !a.override && !gazetteerExact(a.place))
      .map((a) => a.place);
    const pending = [
      ...baseAgg.map((a) => a.place).filter((place) => !gazetteerExact(place) && !placeOverride.has(place)),
      ...burialPending,
      ...eventPlaces.filter((place) => !gazetteerExact(place)),
    ].filter((place, i, arr) => arr.indexOf(place) === i); // benzersiz
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
  }, [baseAgg, placeOverride, burialBase, eventPlaces]);

  // Kişi → doğum yeri koordinatı (maskeli aggregate'lerden → gizlilik korunur).
  const personCoord = useMemo(() => {
    const m = new Map<string, LatLng>();
    for (const a of located) if (a.coords) for (const id of a.personIds) m.set(id, a.coords);
    return m;
  }, [located]);

  // Göç yolları — ebeveyn doğum yeri → çocuk doğum yeri (farklıysa). Yinelenen
  // aynı yol kalınlaşır. Gizli kişiler koordinatsız olduğundan otomatik dışlanır.
  /*
   * Göç yolları — İKİ AYRI ŞEY, ayrı çizilir:
   *
   * "kisisel": bir kişinin kendi ömründeki taşınmaları — doğduğu yerden
   *   başlar, kendi girdiği göç/taşınma olaylarından TARİH SIRASIYLA geçer,
   *   gömüldüğü yerde biter. Kullanıcının yazdığı bilgiye dayanır.
   *
   * "kusak": ebeveynin doğum yerinden çocuğun doğum yerine. Kimsenin
   *   yazmadığı, ağacın kendisinden çıkan bir kayma; bir ömrün yolculuğu
   *   değildir. (Eskiden katmanda yalnız bu vardı ve "göç yolu" deniyordu.)
   *
   * İkisini aynı renkte çizmek yanlış olurdu: biri belge, öbürü çıkarım.
   */
  type Leg = { from: LatLng; to: LatLng; n: number; kind: "kisisel" | "kusak" };

  const migrations = useMemo(() => {
    const map = new Map<string, Leg>();
    const add = (from: LatLng, to: LatLng, kind: Leg["kind"]) => {
      if (from.lat === to.lat && from.lng === to.lng) return;
      const key = `${kind}|${from.lat},${from.lng}>${to.lat},${to.lng}`;
      const e = map.get(key);
      if (e) e.n++;
      else map.set(key, { from, to, n: 1, kind });
    };

    for (const p of scoped) {
      // (1) Kişisel yol: doğum → göç olayları (tarihe göre) → defin.
      const stops: LatLng[] = [];
      const birth = personCoord.get(p.id);
      if (birth) stops.push(birth);
      const moves = (p.events ?? [])
        .filter((ev) => ev.type === "goc-tasinma" && ev.place?.trim())
        // Tarihsizler sona: "YYYY-MM-DD" dizeleri sözlüksel sıralanır ve bu
        // tarih sırasıyla aynıdır; tarihsiz bir taşınmayı araya sokmak sırayı
        // uydurmak olurdu.
        .sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));
      for (const ev of moves) {
        const c = coordsFor(ev.place!.trim());
        if (c) stops.push(c);
      }
      const burial = p.burialPlace?.trim();
      if (burial) {
        const c = p.burialCoords ?? coordsFor(burial);
        if (c) stops.push(c);
      }
      for (let i = 1; i < stops.length; i++) add(stops[i - 1], stops[i], "kisisel");

      // (2) Kuşak kayması: ebeveyn doğum yeri → kişinin doğum yeri.
      if (birth) {
        for (const pid of p.parentIds ?? []) {
          const pc = personCoord.get(pid);
          if (pc) add(pc, birth, "kusak");
        }
      }
    }
    return [...map.values()];
  }, [scoped, personCoord, coordsFor]);

  const maxCount = useMemo(() => located.reduce((m, a) => Math.max(m, a.count), 1), [located]);

  // id → kişi (maskeli) — yan listede göstermek için
  const byId = useMemo(() => {
    const m = new Map<string, Person>();
    for (const p of people) m.set(p.id, priv(p));
    return m;
  }, [people, priv]);

  // Bir yerdeki soyadı dağılımı — soyadı süzgecinden BAĞIMSIZ (`viewed`), çünkü
  // bu başka bir soruya cevap veriyor: "bu yerde hangi adlar var". Süzgeç
  // açıkken de yerin tam karışımını görmek işe yarar.
  const placeSurnames = useMemo(() => {
    const m = new Map<string, ReturnType<typeof surnamesByPlace>[number]>();
    for (const e of surnamesByPlace(viewed)) m.set(e.place, e);
    return m;
  }, [viewed]);

  const active = useMemo(
    () => (activeKind === "burial" ? burialLocated : located).find((a) => a.place === activePlace) ?? null,
    [located, burialLocated, activeKind, activePlace]
  );
  const pick = useCallback((place: string, kind: "birth" | "burial") => {
    setActiveKind(kind);
    setActivePlace(place);
  }, []);

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

          {/* Kuşak aralığı — "3. kuşak nerede doğmuş" sorusu. Dönem zamanı,
             bu ise ağaçtaki DERİNLİĞİ daraltır; ikisi aynı şey değil, aynı
             yıllarda doğmuş iki kişi farklı kuşaklarda olabilir. */}
          {maxGen > 1 && (
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <span className="shrink-0">{t("map.genFilter")}</span>
              <input
                type="range"
                min={1}
                max={maxGen}
                value={g0}
                onChange={(e) => setGenRange([Math.min(Number(e.target.value), g1), g1])}
                className="w-20 accent-[var(--primary)]"
                aria-label={t("map.genFrom")}
              />
              <span className="tabular-nums w-[3.5rem] text-center text-text">{g0}–{g1}</span>
              <input
                type="range"
                min={1}
                max={maxGen}
                value={g1}
                onChange={(e) => setGenRange([g0, Math.max(Number(e.target.value), g0)])}
                className="w-20 accent-[var(--primary)]"
                aria-label={t("map.genTo")}
              />
              {!genAll && (
                <button onClick={() => setGenRange(null)} className="text-[11px] text-text-subtle hover:text-text">
                  {t("map.genAll")}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Soyadı yaygınlık süzgeci — en sık sekiz soyadı. Tek soyadı bir yerde
           olabilir, o yüzden burada "yaygın" ölçütü kişi sayısıdır, yer sayısı
           değil; nerede yoğunlaştığını haritanın kendisi gösterir. */}
        {surnameStats.surnames.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-text-muted mr-1">{t("map.surnameFilter")}</span>
            <button
              onClick={() => setSurnameKey(null)}
              aria-pressed={activeSurname === null}
              className={`text-[11px] px-2 py-1 rounded-lg border transition-colors ${
                activeSurname === null
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-border text-text-subtle hover:bg-surface-2"
              }`}
            >
              {t("map.surnameAll")}
            </button>
            {surnameStats.surnames.slice(0, 8).map((sn) => {
              const on = activeSurname?.key === sn.key;
              return (
                <button
                  key={sn.key}
                  onClick={() => setSurnameKey(on ? null : sn.key)}
                  aria-pressed={on}
                  className={`text-[11px] px-2 py-1 rounded-lg border transition-colors ${
                    on
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-border text-text-subtle hover:bg-surface-2"
                  }`}
                >
                  {sn.surname} <span className="tabular-nums opacity-70">{sn.count}</span>
                </button>
              );
            })}
            {surnameStats.patronymicOnly > 0 && (
              <span className="text-[11px] text-text-subtle">
                {t("map.surnamePatronymic", { count: surnameStats.patronymicOnly })}
              </span>
            )}
          </div>
        )}

        <div className="space-y-6">
          {/* Gerçek OSM harita tuvali (Leaflet) — yazdırılamadığından no-print. */}
          <div className="no-print relative rounded-2xl border border-border bg-surface p-2 sm:p-3">
            <TileMap
              located={located}
              burialLocated={burialLocated}
              migrations={migrations}
              showMigration={showMigration}
              maxCount={maxCount}
              maxBurial={maxBurial}
              activeCoords={active?.coords ?? null}
              onPick={pick}
              ariaLabel={t("map.ariaMap")}
            />
            {/* Renk açıklaması — doğum (kırmızı) / defin (mor). */}
            <div className="mt-2 flex items-center gap-4 px-1 text-[11px] text-text-muted">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: BIRTH_COLOR }} />
                {t("map.legendBirth")}
              </span>
              {burialLocated.length > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: BURIAL_COLOR }} />
                  {t("map.legendBurial")}
                </span>
              )}
              {/* Göç açıkken iki çizgi türünü ayırt et: biri kullanıcının
                 yazdığı taşınmalar, öbürü ağaçtan çıkan kayma. */}
              {showMigration && (
                <>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-4 h-0.5 rounded" style={{ background: MIG_PERSONAL }} />
                    {t("map.legendMigPersonal")}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="w-4 h-0"
                      style={{ borderTop: `2px dashed ${MIG_GENERATION}` }}
                    />
                    {t("map.legendMigGeneration")}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Yan paneller — harita altında ızgara */}
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 items-start">
            {active ? (
              <section className="rounded-2xl border border-border bg-surface p-4">
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <h2 className="font-serif text-base font-semibold text-text truncate">{active.place}</h2>
                  <button
                    onClick={() => setActivePlace(null)}
                    className="text-[11px] text-text-subtle hover:text-text shrink-0"
                  >
                    {t("map.close")}
                  </button>
                </div>
                {/* Doğum mu defin mi — renk noktası + etiket. */}
                <div className="flex items-center gap-1.5 mb-3">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: activeKind === "burial" ? BURIAL_COLOR : BIRTH_COLOR }}
                  />
                  <span className="text-[11px] text-text-subtle">
                    {activeKind === "burial" ? t("map.burialKind") : t("map.birthKind")} · {active.count}
                  </span>
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
                {/* Yerdeki soyadı dağılımı — yalnız doğum yerinde anlamlı,
                   çünkü `surnamesByPlace` doğum yerine göre gruplar. */}
                {activeKind === "birth" && (placeSurnames.get(active.place)?.surnames.length ?? 0) > 0 && (
                  <div className="mb-3">
                    <p className="text-[11px] text-text-subtle mb-1.5">{t("map.surnamesHere")}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {placeSurnames.get(active.place)!.surnames.slice(0, 10).map((sn) => (
                        <button
                          key={sn.surname}
                          onClick={() => {
                            const hit = surnameStats.surnames.find((s) => s.surname === sn.surname);
                            if (hit) setSurnameKey((k) => (k === hit.key ? null : hit.key));
                          }}
                          className="text-[11px] px-2 py-1 rounded-lg border border-border text-text-muted hover:bg-surface-2 transition-colors"
                        >
                          {sn.surname} <span className="tabular-nums opacity-70">{sn.count}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
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
                      onClick={() => a.coords && pick(a.place, "birth")}
                      className={`w-full flex items-center gap-3 px-2 py-1.5 -mx-2 rounded-lg text-left transition-colors ${
                        a.coords ? "hover:bg-surface-2" : "cursor-default"
                      }`}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{
                          background: a.coords ? BIRTH_COLOR : "var(--text-subtle)",
                          opacity: a.coords ? 0.85 : 0.4,
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

            {/* Defin (mezar) yerleri — ayrı grup, mor renk (kullanıcı #). */}
            {burialLocated.length > 0 && (
              <section className="rounded-2xl border border-border bg-surface p-4">
                <div className="flex items-baseline justify-between gap-2 mb-3">
                  <h2 className="font-serif text-base font-semibold text-text">{t("map.burialTitle")}</h2>
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-text-subtle shrink-0">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: BURIAL_COLOR }} />
                    {burialLocated.length}
                  </span>
                </div>
                <ul className="space-y-1">
                  {burialLocated.slice(0, 8).map((a) => (
                    <li key={a.place}>
                      <button
                        onClick={() => pick(a.place, "burial")}
                        className="w-full flex items-center gap-3 px-2 py-1.5 -mx-2 rounded-lg text-left hover:bg-surface-2 transition-colors"
                      >
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: BURIAL_COLOR, opacity: 0.85 }} />
                        <span className="text-sm text-text truncate flex-1 min-w-0">{a.place}</span>
                        <span className="text-xs text-text-muted tabular-nums shrink-0">{a.count}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

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
  burialLocated,
  migrations,
  showMigration,
  maxCount,
  maxBurial,
  activeCoords,
  onPick,
  ariaLabel,
}: {
  located: ReturnType<typeof aggregatePlaces>;
  burialLocated: Array<{ place: string; count: number; personIds: string[]; coords: LatLng | null }>;
  migrations: Array<{ from: LatLng; to: LatLng; n: number; kind: "kisisel" | "kusak" }>;
  showMigration: boolean;
  maxCount: number;
  maxBurial: number;
  activeCoords: LatLng | null;
  onPick: (place: string, kind: "birth" | "burial") => void;
  ariaLabel: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const burialRef = useRef<L.LayerGroup | null>(null);
  const migRef = useRef<L.LayerGroup | null>(null);
  const fitted = useRef(false);
  /*
   * Yakınlaştırma düzeyi durum olarak tutulur: göç katmanı, iki ucu ekranda
   * çok yakın düşen bacaklara ok koymaz (ok çizgiden uzun görünürdü). Ama o
   * karar ölçeğe bağlı — kullanıcı yakınlaşınca kısa bacaklar açılır ve
   * oklarını hak eder. Katman yeniden çizilmezse o oklar hiç gelmezdi.
   */
  const [zoom, setZoom] = useState(0);
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
    burialRef.current = L.layerGroup().addTo(map);
    migRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    map.on("zoomend", () => setZoom(map.getZoom()));
    // Konteyner ilk render'da tam boyutlanmamış olabilir.
    setTimeout(() => map.invalidateSize(), 0);
    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = null;
      burialRef.current = null;
      migRef.current = null;
    };
  }, []);

  // Doğum-yeri işaretçileri (kırmızı daire) + defin-yeri işaretçileri (mor).
  useEffect(() => {
    const g = markersRef.current;
    const bg = burialRef.current;
    const map = mapRef.current;
    if (!g || !bg || !map) return;
    g.clearLayers();
    bg.clearLayers();
    const pts: L.LatLngExpression[] = [];
    for (const a of located) {
      if (!a.coords) continue;
      const r = 5 + 11 * Math.sqrt(a.count / maxCount);
      const marker = L.circleMarker([a.coords.lat, a.coords.lng], {
        radius: r,
        color: BIRTH_BORDER,
        weight: 1,
        fillColor: BIRTH_COLOR,
        fillOpacity: 0.55,
      });
      marker.bindTooltip(`${a.place} · ${a.count}`, { direction: "top" });
      marker.on("click", () => onPickRef.current(a.place, "birth"));
      marker.addTo(g);
      pts.push([a.coords.lat, a.coords.lng]);
    }
    // Defin yerleri — mor daire; hafif dış çeper doğumla karışmasın diye.
    for (const a of burialLocated) {
      if (!a.coords) continue;
      const r = 5 + 10 * Math.sqrt(a.count / maxBurial);
      const marker = L.circleMarker([a.coords.lat, a.coords.lng], {
        radius: r,
        color: BURIAL_BORDER,
        weight: 1.5,
        fillColor: BURIAL_COLOR,
        fillOpacity: 0.55,
        dashArray: "2 2",
      });
      marker.bindTooltip(`⚰ ${a.place} · ${a.count}`, { direction: "top" });
      marker.on("click", () => onPickRef.current(a.place, "burial"));
      marker.addTo(bg);
      pts.push([a.coords.lat, a.coords.lng]);
    }
    if (pts.length && !fitted.current) {
      fitted.current = true;
      map.fitBounds(pts as L.LatLngBoundsExpression, { padding: [40, 40], maxZoom: 8 });
    }
  }, [located, burialLocated, maxCount, maxBurial]);

  // Göç yolları.
  useEffect(() => {
    const g = migRef.current;
    if (!g) return;
    g.clearLayers();
    if (!showMigration) return;
    const map = mapRef.current;
    for (const m of migrations) {
      const kisisel = m.kind === "kisisel";
      L.polyline(
        [
          [m.from.lat, m.from.lng],
          [m.to.lat, m.to.lng],
        ],
        {
          // Belge (kişisel) dolu ve koyu; çıkarım (kuşak) kesikli ve soluk.
          color: kisisel ? MIG_PERSONAL : MIG_GENERATION,
          weight: Math.min(5, 1 + m.n),
          opacity: kisisel ? 0.7 : 0.35,
          dashArray: kisisel ? undefined : "4 5",
        }
      ).addTo(g);

      /*
       * Yön oku. Yönsüz bir çizgi göçün asıl bilgisini söylemez: aile
       * İstanbul'a mı gitmiş, İstanbul'dan mı gelmiş?
       *
       * Açı EKRAN düzleminde (`latLngToLayerPoint`) hesaplanır, enlem-boylam
       * farkından değil: Mercator'da kuzeye gidildikçe boylam sıkışır, ham
       * lat/lng farkından bulunan açı okla çizginin arasını açardı.
       */
      if (!map) continue;
      const a = map.latLngToLayerPoint([m.from.lat, m.from.lng]);
      const b = map.latLngToLayerPoint([m.to.lat, m.to.lng]);
      if (Math.hypot(b.x - a.x, b.y - a.y) < 24) continue; // çok kısa: ok sığmaz
      const deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      L.marker([m.to.lat, m.to.lng], {
        interactive: false,
        keyboard: false,
        icon: L.divIcon({
          className: "",
          iconSize: [12, 12],
          iconAnchor: [6, 6],
          html:
            `<div style="width:12px;height:12px;transform:rotate(${deg}deg);` +
            `color:${kisisel ? MIG_PERSONAL : MIG_GENERATION};opacity:${kisisel ? 0.9 : 0.5};` +
            `font-size:12px;line-height:12px;text-align:center">\u25B6</div>`,
        }),
      }).addTo(g);
    }
  }, [migrations, showMigration, zoom]);

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
