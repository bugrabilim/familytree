"use client";

import { useMemo, useState } from "react";
import type { Person } from "@/types/family";
import Avatar from "./ui/Avatar";
import Button from "./ui/Button";
import { calcAge, lifeSpan } from "@/lib/date";
import { fullName } from "@/lib/name";
import { usePrivacy } from "./PrivacyContext";
import { useReadOnly } from "./ReadOnlyContext";
import { isMasked } from "@/lib/privacy";

type SortKey = "ad" | "soyad" | "dogum" | "yeni";
type Filter =
  | "hepsi"
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
  onAdd: () => void;
}

export default function ListView({ people: rawPeople, selectedId, onSelect, onAdd }: Props) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("soyad");
  const [filter, setFilter] = useState<Filter>("hepsi");

  const { view, hideLiving } = usePrivacy();
  const { readOnly } = useReadOnly();
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
    const q = query.toLocaleLowerCase("tr").trim();

    let out = people.filter((p) => {
      if (filter === "yasayan" && p.deathDate) return false;
      if (filter === "vefat" && !p.deathDate) return false;
      if (filter === "bagsiz") {
        const linked =
          p.parentIds.length > 0 || p.spouseIds.length > 0 || childIds.has(p.id);
        if (linked) return false;
      }
      if (filter === "lgbt" && !lgbtIds.has(p.id)) return false;
      if (filter === "dogustan" && !p.congenitalCondition) return false;
      if (filter === "hastalik" && !p.healthCondition) return false;
      if (filter === "olum-neden" && !p.deathCause) return false;
      if (!q) return true;
      return (
        fullName(p).toLocaleLowerCase("tr").includes(q) ||
        (p.code ?? "").includes(q) ||
        (p.birthPlace ?? "").toLocaleLowerCase("tr").includes(q) ||
        (p.bio ?? "").toLocaleLowerCase("tr").includes(q) ||
        (p.orientation ?? "").toLocaleLowerCase("tr").includes(q) ||
        (p.congenitalCondition ?? "").toLocaleLowerCase("tr").includes(q) ||
        (p.healthCondition ?? "").toLocaleLowerCase("tr").includes(q) ||
        (p.deathCause ?? "").toLocaleLowerCase("tr").includes(q) ||
        (p.birthDate ?? "").includes(q)
      );
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
  }, [people, query, sort, filter, childIds, lgbtIds]);

  const FILTERS: Array<{ k: Filter; l: string }> = [
    { k: "hepsi", l: "Hepsi" },
    { k: "yasayan", l: "Yaşayan" },
    { k: "vefat", l: "Vefat" },
    { k: "bagsiz", l: "Bağsız" },
    { k: "lgbt", l: "LGBT+" },
    { k: "dogustan", l: "Doğuştan durum" },
    { k: "hastalik", l: "Sonradan rahatsızlık" },
    { k: "olum-neden", l: "Ölüm nedeni" },
  ];

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
              placeholder="İsim, yer, hikâye…"
              className="w-full h-9 pl-9 pr-3 rounded-xl bg-surface border border-border text-sm text-text placeholder:text-text-subtle focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="h-9 px-2.5 rounded-xl bg-surface border border-border text-xs text-text focus:outline-none focus:border-primary cursor-pointer"
            aria-label="Sırala"
          >
            <option value="soyad">Soyada göre</option>
            <option value="ad">Ada göre</option>
            <option value="dogum">Doğum tarihine göre</option>
            <option value="yeni">Son eklenen</option>
          </select>

          {!readOnly && (
            <Button size="sm" onClick={onAdd} className="shrink-0">
              <svg width="13" height="13" viewBox="0 0 12 12" fill="none" aria-hidden>
                <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span className="hidden sm:inline">Kişi ekle</span>
            </Button>
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
            {rows.length} kişi
          </span>
        </div>
      </div>

      {/* Kartlar */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {rows.length === 0 ? (
          <div className="h-full grid place-items-center text-center">
            <div>
              <p className="text-3xl mb-2">🔍</p>
              <p className="text-sm text-text-muted">Sonuç bulunamadı</p>
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
                      bg-surface border transition-all duration-150
                      ${p.id === selectedId
                        ? "border-primary shadow-card"
                        : "border-border hover:border-border-strong hover:shadow-card"}
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
                          🔒 Yaşayan
                        </p>
                      ) : (
                        <p className="text-xs text-text-muted truncate leading-tight mt-0.5 tabular-nums">
                          {lifeSpan(p.birthDate, p.deathDate) || "Tarih yok"}
                          {age !== null && ` · ${age} yaş`}
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
                    {p.deathDate && (
                      <span className="text-[10px] text-text-subtle shrink-0" title="Vefat etti">✝</span>
                    )}
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
