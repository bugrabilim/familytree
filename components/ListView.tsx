"use client";

import { useMemo, useState } from "react";
import type { Gender, Person } from "@/types/family";
import { EDUCATION_LEVELS } from "@/types/family";
import Avatar, { genderTone } from "./ui/Avatar";
import { calcAge, lifeSpan } from "@/lib/date";
import { fullName } from "@/lib/name";
import { buildICSMulti } from "@/lib/calendar";
import { isRainbow } from "@/lib/identity";
import { isAssociate, isMember } from "@/lib/associates";
import { usePrivacy } from "./PrivacyContext";
import { isMasked } from "@/lib/privacy";
import {
  activeFieldCount,
  emptyFieldFilters,
  matchesFields,
  matchesQuery,
  NO_EDUCATION,
  type FieldFilters,
} from "@/lib/search";
import { useT } from "@/lib/i18n";

type SortKey = "ad" | "soyad" | "dogum" | "yeni";
type Filter =
  | "hepsi"
  | "uyeler"
  | "arkadaslar"
  | "yasayan"
  | "vefat"
  | "bagsiz"
  | "lgbt"
  | "dogustan"
  | "hastalik"
  | "olum-neden";

interface Props {
  people: Person[];
  selectedId?: string;
  onSelect: (id: string) => void;
}

const advLabel = "block text-[11px] font-medium text-text-muted mb-1";
const advField =
  "w-full h-8 px-2 rounded-lg bg-surface-2 border border-border text-xs text-text placeholder:text-text-subtle focus:outline-none focus:border-primary";

export default function ListView({ people: rawPeople, selectedId, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("soyad");
  const [filter, setFilter] = useState<Filter>("hepsi");
  const [adv, setAdv] = useState<FieldFilters>(emptyFieldFilters());
  const [showAdv, setShowAdv] = useState(false);
  const advCount = activeFieldCount(adv);

  const { view, hideLiving } = usePrivacy();
  const t = useT();
  // Süzme, arama ve gösterim maskeli görünüm üzerinden yapılır — böylece
  // arama gizlenmiş alanlarla eşleşmez ve gizli bilgi listelenmez.
  const people = useMemo(() => rawPeople.map(view), [rawPeople, view]);

  const childIds = useMemo(() => {
    const s = new Set<string>();
    for (const p of people) for (const pid of p.parentIds) s.add(pid);
    return s;
  }, [people]);

  /**
   * LGBT+ süzgeci için: cinsel yönelimi kayıtlı olanlar VEYA aynı cinsten
   * (eski) eşi bulunanlar. Böylece "aile içinde LGBT+ biri var mı?" sorusu
   * tek tıkla yanıtlanır.
   */
  const lgbtIds = useMemo(() => {
    const idx = new Map(people.map((p) => [p.id, p]));
    const s = new Set<string>();
    for (const p of people) {
      if (p.orientation) s.add(p.id);
      const esler = [...p.spouseIds, ...(p.formerSpouseIds ?? [])];
      for (const sid of esler) {
        const es = idx.get(sid);
        if (es && es.gender === p.gender && p.gender !== "unknown") {
          s.add(p.id);
          s.add(sid);
        }
      }
    }
    return s;
  }, [people]);

  const rows = useMemo(() => {
    let out = people.filter((p) => {
      // Kategori çipi (tekli)
      if (filter === "uyeler" && !isMember(p)) return false;
      if (filter === "arkadaslar" && !isAssociate(p)) return false;
      if (filter === "yasayan" && p.deathDate) return false;
      if (filter === "vefat" && !p.deathDate) return false;
      if (filter === "bagsiz") {
        // Arkadaşlar (çevre) zaten aile bağı taşımaz; onları buraya değil
        // "Arkadaşlar" süzgecine bırak — "bağsız" yalnız gerçekten kopuk ÜYELER.
        if (isAssociate(p)) return false;
        const linked =
          p.parentIds.length > 0 || p.spouseIds.length > 0 || childIds.has(p.id);
        if (linked) return false;
      }
      if (filter === "lgbt" && !lgbtIds.has(p.id)) return false;
      if (filter === "dogustan" && !p.congenitalCondition) return false;
      if (filter === "hastalik" && !p.healthCondition) return false;
      if (filter === "olum-neden" && !p.deathCause) return false;
      // Gelişmiş alan süzgeçleri + serbest metin (hepsi VE)
      return matchesFields(p, adv) && matchesQuery(p, query);
    });

    const coll = new Intl.Collator("tr");
    out = [...out].sort((a, b) => {
      switch (sort) {
        case "ad":
          return coll.compare(a.firstName, b.firstName);
        case "dogum":
          return (a.birthDate ?? "9999").localeCompare(b.birthDate ?? "9999");
        case "yeni":
          return 0;
        default:
          return coll.compare(a.lastName, b.lastName) || coll.compare(a.firstName, b.firstName);
      }
    });
    if (sort === "yeni") out.reverse();
    return out;
  }, [people, query, sort, filter, adv, childIds, lgbtIds]);

  const FILTERS: Array<{ k: Filter; l: string }> = [
    { k: "hepsi", l: t("list.filter.all") },
    { k: "uyeler", l: t("list.filter.members") },
    { k: "arkadaslar", l: t("list.filter.friends") },
    { k: "yasayan", l: t("list.filter.living") },
    { k: "vefat", l: t("list.filter.deceased") },
    { k: "bagsiz", l: t("list.filter.unlinked") },
    { k: "lgbt", l: t("list.filter.lgbt") },
    { k: "dogustan", l: t("list.filter.congenital") },
    { k: "hastalik", l: t("list.filter.illness") },
    { k: "olum-neden", l: t("list.filter.deathCause") },
  ];

  // #8 — Görünen (süzülmüş) kişilerin gün/ay bilinen doğum günleri → takvim olayı.
  const birthdayEvents = useMemo(
    () =>
      rows
        .filter((p) => p.birthDate && p.birthDate.split("-").length >= 3)
        .map((p) => ({ title: t("cal.birthdayTitle", { name: fullName(p) }), date: p.birthDate!, yearly: true })),
    [rows, t]
  );
  const exportBirthdays = () => {
    if (birthdayEvents.length === 0) return;
    try {
      const blob = new Blob([buildICSMulti(birthdayEvents)], { type: "text/calendar;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "dogum-gunleri.ics";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      /* yoksay */
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Araç çubuğu */}
      <div className="shrink-0 border-b border-border bg-bg-elevated/60 px-4 sm:px-6 py-3 space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-md">
            <svg
              width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle"
            >
              <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.9" />
              <path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("list.searchPlaceholder")}
              className="w-full h-9 pl-9 pr-3 rounded-xl bg-surface border border-border text-sm text-text placeholder:text-text-subtle focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="h-9 px-2.5 rounded-xl bg-surface border border-border text-xs text-text focus:outline-none focus:border-primary cursor-pointer"
            aria-label={t("list.sortAria")}
          >
            <option value="soyad">{t("list.sortSurname")}</option>
            <option value="ad">{t("list.sortName")}</option>
            <option value="dogum">{t("list.sortBirth")}</option>
            <option value="yeni">{t("list.sortNewest")}</option>
          </select>

          <button
            onClick={() => setShowAdv((s) => !s)}
            aria-expanded={showAdv}
            className={`h-9 px-2.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors ${
              showAdv || advCount > 0
                ? "border-primary bg-primary-soft text-primary"
                : "border-border bg-surface text-text-muted hover:text-text"
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M3 5h18M6 12h12M10 19h4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
            </svg>
            <span className="hidden sm:inline">{t("list.advanced")}</span>
            {advCount > 0 && (
              <span className="ml-0.5 min-w-4 h-4 px-1 rounded-full bg-primary text-primary-text text-[10px] grid place-items-center tabular-nums">
                {advCount}
              </span>
            )}
          </button>

          {/* #8 — Görünenlerin doğum günlerini takvime aktar (.ics; herkes ya da
             süzülmüş alt küme). Gün/ay bilinmeyenler ve gizli yaşayanlar hariç. */}
          {birthdayEvents.length > 0 && (
            <button
              onClick={exportBirthdays}
              title={t("cal.exportBirthdays", { count: birthdayEvents.length })}
              className="h-9 px-2.5 rounded-xl border border-border bg-surface text-text-muted hover:text-text hover:border-border-strong text-xs font-medium flex items-center gap-1.5 transition-colors shrink-0"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                <rect x="3.5" y="5" width="17" height="15" rx="2" stroke="currentColor" strokeWidth="1.8" />
                <path d="M3.5 9h17M8 3v3M16 3v3M12 12v4M10 14h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <span className="hidden sm:inline">{t("cal.birthdays")}</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f.k}
              onClick={() => setFilter(f.k)}
              className={`h-7 px-2.5 rounded-lg text-xs font-medium transition-colors ${
                filter === f.k
                  ? "bg-primary text-primary-text"
                  : "bg-surface-2 text-text-muted hover:text-text"
              }`}
            >
              {f.l}
            </button>
          ))}
          <span className="ml-auto text-xs text-text-subtle tabular-nums">
            {t("common.peopleCount", { count: rows.length })}
          </span>
        </div>

        {/* Gelişmiş süzgeç paneli (Madde 7) — birleştirilebilir alan filtreleri */}
        {showAdv && (
          <div className="rounded-xl border border-border bg-surface p-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {/* Cinsiyet (çoklu) */}
            <div>
              <label className={advLabel}>{t("form.gender")}</label>
              <div className="flex flex-wrap gap-1">
                {(["female", "male", "other"] as Gender[]).map((g) => {
                  const on = adv.genders.includes(g);
                  return (
                    <button
                      key={g}
                      type="button"
                      onClick={() =>
                        setAdv((f) => ({
                          ...f,
                          genders: on ? f.genders.filter((x) => x !== g) : [...f.genders, g],
                        }))
                      }
                      className={`h-7 px-2 rounded-lg text-[11px] border transition-colors ${
                        on
                          ? "border-primary bg-primary-soft text-primary"
                          : "border-border bg-surface-2 text-text-muted hover:text-text"
                      }`}
                    >
                      {t(`form.gender.${g}`)}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Doğum yılı aralığı */}
            <div>
              <label className={advLabel}>{t("list.adv.birthYears")}</label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder={t("list.adv.from")}
                  value={adv.birthYearMin ?? ""}
                  onChange={(e) =>
                    setAdv((f) => ({ ...f, birthYearMin: e.target.value ? Number(e.target.value) : undefined }))
                  }
                  className={advField}
                />
                <span className="text-text-subtle">–</span>
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder={t("list.adv.to")}
                  value={adv.birthYearMax ?? ""}
                  onChange={(e) =>
                    setAdv((f) => ({ ...f, birthYearMax: e.target.value ? Number(e.target.value) : undefined }))
                  }
                  className={advField}
                />
              </div>
            </div>

            {/* Doğum yeri */}
            <div>
              <label className={advLabel}>{t("list.adv.place")}</label>
              <input
                value={adv.place}
                onChange={(e) => setAdv((f) => ({ ...f, place: e.target.value }))}
                placeholder={t("list.adv.placePlaceholder")}
                className={advField}
              />
            </div>

            {/* Meslek */}
            <div>
              <label className={advLabel}>{t("drawer.occupation")}</label>
              <input
                value={adv.occupation}
                onChange={(e) => setAdv((f) => ({ ...f, occupation: e.target.value }))}
                placeholder={t("list.adv.occupationPlaceholder")}
                className={advField}
              />
            </div>

            {/* Eğitim */}
            <div>
              <label className={advLabel}>{t("form.education")}</label>
              <select
                value={adv.education}
                onChange={(e) => setAdv((f) => ({ ...f, education: e.target.value }))}
                className={advField}
              >
                <option value="">{t("list.adv.any")}</option>
                <option value={NO_EDUCATION}>{t("list.adv.eduNone")}</option>
                {EDUCATION_LEVELS.map((k) => (
                  <option key={k} value={k}>
                    {t(`education.${k}`)}
                  </option>
                ))}
              </select>
            </div>

            {/* Temizle */}
            <div className="flex items-end">
              <button
                onClick={() => setAdv(emptyFieldFilters())}
                disabled={advCount === 0}
                className="h-8 px-3 rounded-lg border border-border text-xs text-text-muted hover:text-text disabled:opacity-40 transition-colors"
              >
                {t("list.adv.clear")}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Kartlar */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {rows.length === 0 ? (
          <div className="h-full grid place-items-center text-center">
            <div>
              <p className="text-3xl mb-2">🔍</p>
              <p className="text-sm text-text-muted">{t("list.noResults")}</p>
            </div>
          </div>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {rows.map((p) => {
              const age = calcAge(p.birthDate, p.deathDate);
              const masked = isMasked(p, hideLiving);
              return (
                <li key={p.id}>
                  <button
                    onClick={() => onSelect(p.id)}
                    className={`
                      w-full flex items-center gap-3 p-3 rounded-xl text-left
                      ${isRainbow(p) ? "card-rainbow" : genderTone(p.gender).bg} transition-all duration-150
                      ${p.id === selectedId
                        ? "ring-2 ring-primary/40 shadow-card"
                        : "hover:shadow-card"}
                    `}
                  >
                    <Avatar person={p} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text truncate leading-tight">
                        {fullName(p)}
                        {p.code && <span className="ml-1.5 text-[10px] font-mono text-text-subtle/70">#{p.code}</span>}
                      </p>
                      {masked ? (
                        <p className="text-xs text-text-subtle truncate leading-tight mt-0.5">
                          {t("common.living")}
                        </p>
                      ) : (
                        <p className="text-xs text-text-muted truncate leading-tight mt-0.5 tabular-nums">
                          {lifeSpan(p.birthDate, p.deathDate) || t("list.noDate")}
                          {age !== null && ` · ${t("list.yrs", { age })}`}
                        </p>
                      )}
                      {p.birthPlace && (
                        <p className="text-[11px] text-text-subtle truncate leading-tight mt-0.5">
                          📍 {p.birthPlace}
                        </p>
                      )}
                      {(p.congenitalCondition || p.healthCondition || p.deathCause) && (
                        <p className="text-[11px] text-text-subtle truncate leading-tight mt-0.5">
                          {p.congenitalCondition
                            ? `🧬 ${p.congenitalCondition}`
                            : p.healthCondition
                            ? `🩺 ${p.healthCondition}`
                            : `🩶 ${p.deathCause}`}
                        </p>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
