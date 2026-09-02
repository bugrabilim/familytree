"use client";

import { useMemo, useState } from "react";
import type { Person } from "@/types/family";
import Avatar from "./ui/Avatar";
import CalendarAdd from "./CalendarAdd";
import { formatLong } from "@/lib/date";
import {
  hijriAnniversariesInGregorianYear,
  hijriYearsBetween,
} from "@/lib/hijri";
import {
  DEFAULT_OBSERVANCES,
  memorialCalendar,
  observanceKey,
  type ObservanceKind,
} from "@/lib/memorials";
import { fullName } from "@/lib/name";
import { isMasked } from "@/lib/privacy";
import { usePrivacy } from "./PrivacyContext";
import { useT } from "@/lib/i18n";

/** Kullanıcının hangi anmaları tuttuğu cihazda saklanır (hane tercihi). */
const KINDS_KEY = "soyagaci_memorial_kinds";

const ALL_KINDS: readonly ObservanceKind[] = [
  "gece3",
  "gece7",
  "gece40",
  "gece52",
  "seneiDevriye",
  "seneiDevriyeHicri",
];

const pad = (n: number) => String(n).padStart(2, "0");

export default function MemorialCalendar({
  people,
  onSelect,
}: {
  people: Person[];
  onSelect: (id: string) => void;
}) {
  const { view, hideLiving } = usePrivacy();
  const t = useT();

  // Görüntülenen ay, bugüne göre kaydırma. 0 = içinde bulunduğumuz ay.
  const [offset, setOffset] = useState(0);

  // Hangi anmalar tutulur — yöreye ve haneye göre değişir, bu yüzden
  // `lib/memorials.ts` buyurgan değil betimleyicidir. Seçim cihazda kalır.
  const [kinds, setKinds] = useState<Set<ObservanceKind>>(() => {
    if (typeof window === "undefined") return new Set(DEFAULT_OBSERVANCES);
    try {
      const raw = localStorage.getItem(KINDS_KEY);
      if (!raw) return new Set(DEFAULT_OBSERVANCES);
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return new Set(DEFAULT_OBSERVANCES);
      // Bilinmeyen anahtarlar elenir: eski bir sürümden kalan ya da elle
      // bozulmuş bir değer görünümü kırmasın.
      return new Set(parsed.filter((k): k is ObservanceKind =>
        (ALL_KINDS as readonly string[]).includes(k as string)
      ));
    } catch {
      return new Set(DEFAULT_OBSERVANCES);
    }
  });

  const toggle = (kind: ObservanceKind) => {
    setKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      try {
        localStorage.setItem(KINDS_KEY, JSON.stringify([...next]));
      } catch {
        /* yoksay */
      }
      return next;
    });
  };

  // Görüntülenen ayın ilk ve son günü. `Date` yalnız ay aritmetiği için;
  // gün 0 bir sonraki ayın "sıfırıncı" günü, yani bu ayın son günüdür.
  const { from, to, monthLabel, isThisMonth } = useMemo(() => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const y = first.getFullYear();
    const m = first.getMonth() + 1;
    const last = new Date(y, m, 0).getDate();
    return {
      from: `${y}-${pad(m)}-01`,
      to: `${y}-${pad(m)}-${pad(last)}`,
      monthLabel: formatLong(`${y}-${pad(m)}`),
      isThisMonth: offset === 0,
    };
  }, [offset]);

  const todayIso = useMemo(() => {
    const n = new Date();
    return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
  }, []);

  // Gizli (confidential) kayıtlar hiç girmez. Maskeli kopya ölüm tarihini
  // KORUDUĞU için yalnız `view()`den geçirmek yetmezdi — gizli birinin anma
  // günü takvimde belirirdi. Aynı süzgeç "Yaklaşan olaylar"da da var.
  const byId = useMemo(() => {
    const m = new Map<string, Person>();
    for (const p of people) if (!isMasked(p, hideLiving)) m.set(p.id, view(p));
    return m;
  }, [people, view, hideLiving]);

  const days = useMemo(() => {
    const list = memorialCalendar([...byId.values()], { from, to }, {
      enabled: [...kinds],
      hijriAnniversaries: hijriAnniversariesInGregorianYear,
      hijriYearsBetween,
    });
    // Güne göre öbekle — takvim gün gün okunur.
    const groups: Array<{ date: string; items: typeof list }> = [];
    for (const o of list) {
      const head = groups[groups.length - 1];
      if (head && head.date === o.date) head.items.push(o);
      else groups.push({ date: o.date, items: [o] });
    }
    return groups;
  }, [byId, from, to, kinds]);

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <h2 className="font-serif text-base font-semibold text-text">{t("memorialCal.title")}</h2>
        <span className="text-[11px] text-text-subtle shrink-0">{t("memorialCal.hint")}</span>
      </div>

      {/* Ay gezinmesi */}
      <div className="flex items-center gap-2 my-3 no-print">
        <button
          onClick={() => setOffset((o) => o - 1)}
          aria-label={t("memorialCal.prev")}
          className="w-8 h-8 rounded-lg border border-border text-text-subtle hover:bg-accent-soft transition-colors"
        >
          ‹
        </button>
        <span className="flex-1 text-center text-sm font-medium text-text">{monthLabel}</span>
        <button
          onClick={() => setOffset((o) => o + 1)}
          aria-label={t("memorialCal.next")}
          className="w-8 h-8 rounded-lg border border-border text-text-subtle hover:bg-accent-soft transition-colors"
        >
          ›
        </button>
        {!isThisMonth && (
          <button
            onClick={() => setOffset(0)}
            className="text-[11px] px-2 py-1 rounded-lg bg-accent-soft text-accent hover:bg-accent-soft/70 transition-colors"
          >
            {t("memorialCal.today")}
          </button>
        )}
      </div>

      {/* Hangi anmalar tutulur — hane seçer */}
      <div className="flex flex-wrap gap-1.5 mb-3 no-print">
        {ALL_KINDS.map((k) => {
          const on = kinds.has(k);
          return (
            <button
              key={k}
              onClick={() => toggle(k)}
              aria-pressed={on}
              className={`text-[11px] px-2 py-1 rounded-lg border transition-colors ${
                on
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-border text-text-subtle hover:bg-accent-soft/40"
              }`}
            >
              {t(observanceKey(k))}
            </button>
          );
        })}
      </div>

      {days.length === 0 ? (
        <p className="text-sm text-text-subtle py-2">{t("memorialCal.empty")}</p>
      ) : (
        <ul className="space-y-3">
          {days.map((g) => (
            <li key={g.date}>
              <p
                className={`text-[11px] font-semibold uppercase tracking-wide mb-1 ${
                  g.date === todayIso ? "text-accent" : "text-text-subtle"
                }`}
              >
                {formatLong(g.date)}
                {g.date === todayIso ? ` · ${t("panel.today")}` : ""}
              </p>
              <ul className="space-y-1">
                {g.items.map((o) => {
                  const person = byId.get(o.personId);
                  if (!person) return null;
                  const name = fullName(person);
                  const label = t(observanceKey(o.kind));
                  return (
                    <li
                      key={`${o.personId}-${o.kind}-${o.date}`}
                      className="flex items-center gap-1 rounded-xl bg-accent-soft/40 hover:bg-accent-soft transition-colors"
                    >
                      <button
                        onClick={() => onSelect(o.personId)}
                        className="flex-1 min-w-0 flex items-center gap-3 px-2 py-2 text-left"
                      >
                        <Avatar person={person} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-text truncate leading-tight">{name}</p>
                          <p className="text-[11px] text-text-subtle leading-tight">
                            🕯️ {label}
                            {o.year ? ` · ${t("memorial.yearOrdinal", { year: o.year })}` : ""}
                          </p>
                        </div>
                      </button>
                      <CalendarAdd
                        event={{
                          title: `${name} — ${label}`,
                          date: o.date,
                          // Yalnız Miladi sene-i devriye her yıl aynı güne
                          // düşer. Geceler tek seferlik; Hicri devriye Miladi
                          // takvimde her yıl kayar, "yearly" onu bozardı.
                          yearly: o.kind === "seneiDevriye",
                        }}
                        className="mr-1"
                      />
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
