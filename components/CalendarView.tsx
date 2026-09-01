"use client";

import { useMemo } from "react";
import type { Person } from "@/types/family";
import Avatar from "./ui/Avatar";
import CalendarAdd from "./CalendarAdd";
import CalendarExport from "./CalendarExport";
import { calcAge, humanizeDays, signedDaysToAnniversary } from "@/lib/date";
import { fullName } from "@/lib/name";
import { isMasked } from "@/lib/privacy";
import { usePrivacy } from "./PrivacyContext";
import { useT } from "@/lib/i18n";

interface Props {
  people: Person[];
  onSelect: (id: string) => void;
}

/**
 * Takvim sayfası (görünüm) — İstatistikler'den taşınan "Yaklaşan olaylar"
 * (doğum günü 🎂 · evlilik yıldönümü 💍 · anma 🕯️) ve çoktan-seçmeli
 * "Takvime aktar" (.ics) alanını bir arada gösterir. Eskiden üst bardaki
 * "Takvime aktar" düğmesinin açtığı pencereydi; artık normal bir sayfa.
 */
export default function CalendarView({ people, onSelect }: Props) {
  const { view, hideLiving } = usePrivacy();
  const t = useT();

  // 🎂 Doğum günleri · 💍 evlilik yıldönümleri · 🕯️ anma günleri — tek liste.
  // Yıldönümleri, gizlilik için maskeli kopyadan türetilir: gizli yaşayan bir
  // kişinin evlilik tarihi (maskeli kopyada `events` yok) sızmaz.
  const upcoming = useMemo(() => {
    const PAST_DAYS = 10;
    const FUTURE_DAYS = 10;
    type Ev = {
      key: string;
      kind: "birthday" | "anniversary" | "memorial";
      rawPerson: Person;
      days: number;
      icon: string;
      label: string;
    };
    const out: Ev[] = [];
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const occYearOf = (days: number) => {
      const occ = new Date(startOfToday);
      occ.setDate(occ.getDate() + days);
      return occ.getFullYear();
    };

    for (const p of people) {
      // 🎂 Doğum günü — yalnızca yaşayanlar; gün/ay bilgisi gerekir.
      if (!p.deathDate && p.birthDate && p.birthDate.split("-").length >= 3) {
        const days = signedDaysToAnniversary(p.birthDate, PAST_DAYS, FUTURE_DAYS);
        if (days !== null) {
          out.push({ key: `b-${p.id}`, kind: "birthday", rawPerson: p, days, icon: "🎂", label: "" });
        }
      }

      // 🕯️ Anma günü — vefat edenler. Gizli (confidential) kayıtlar hariç.
      if (p.deathDate && !isMasked(p, hideLiving)) {
        const days = signedDaysToAnniversary(p.deathDate, PAST_DAYS, FUTURE_DAYS);
        if (days !== null) {
          const years = occYearOf(days) - Number(p.deathDate.slice(0, 4));
          out.push({
            key: `m-${p.id}`,
            kind: "memorial",
            rawPerson: p,
            days,
            icon: "🕯️",
            label: years >= 1 ? t("panel.memorial.year", { years }) : t("panel.memorial.generic"),
          });
        }
      }

      // 💍 Evlilik yıldönümü — maskeli kopyadan okunur (gizli tarih sızmaz).
      const events = view(p).events;
      if (events) {
        for (const ev of events) {
          if (ev.type !== "evlilik" || !ev.date) continue;
          const days = signedDaysToAnniversary(ev.date, PAST_DAYS, FUTURE_DAYS);
          if (days === null) continue;
          const years = occYearOf(days) - Number(ev.date.slice(0, 4));
          out.push({
            key: `a-${p.id}-${ev.id}`,
            kind: "anniversary",
            rawPerson: p,
            days,
            icon: "💍",
            label: years >= 1 ? t("panel.anniversary.year", { years }) : t("panel.anniversary.generic"),
          });
        }
      }
    }

    // Yaklaşanlar (gelecek, +) üstte; "Bugün" ayıracı; geçmiş (−) altta.
    return out.sort((a, b) => b.days - a.days).slice(0, 12);
  }, [people, view, hideLiving, t]);

  const future = upcoming.filter((ev) => ev.days > 0);
  const todayEv = upcoming.filter((ev) => ev.days === 0);
  const past = upcoming.filter((ev) => ev.days < 0);

  const renderRow = (ev: (typeof upcoming)[number], band: "future" | "today" | "past") => {
    const person = view(ev.rawPerson);
    const masked = isMasked(ev.rawPerson, hideLiving);
    let subtext: React.ReactNode = null;
    if (ev.kind === "birthday") {
      const age = calcAge(ev.rawPerson.birthDate);
      subtext = masked ? (
        <p className="text-[11px] text-text-subtle leading-tight">{t("common.living")}</p>
      ) : age !== null ? (
        <p className="text-[11px] text-text-subtle leading-tight">
          {t("panel.birthday.turning", { age: age + (ev.days > 0 ? 1 : 0) })}
        </p>
      ) : (
        <p className="text-[11px] text-text-subtle leading-tight">{t("panel.birthday.generic")}</p>
      );
    } else {
      subtext = (
        <p className="text-[11px] text-text-subtle leading-tight">
          {ev.icon} {ev.label}
        </p>
      );
    }
    const rowBg =
      band === "future"
        ? "bg-emerald-500/10 hover:bg-emerald-500/20"
        : band === "past"
        ? "bg-rose-500/10 hover:bg-rose-500/20"
        : "bg-accent-soft hover:bg-accent-soft/70";
    const badgeCls =
      band === "future"
        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
        : band === "past"
        ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
        : "bg-accent-soft text-accent";
    const occ = new Date();
    occ.setDate(occ.getDate() + ev.days);
    const pad = (n: number) => String(n).padStart(2, "0");
    const occDate = `${occ.getFullYear()}-${pad(occ.getMonth() + 1)}-${pad(occ.getDate())}`;
    const calTitle =
      ev.kind === "birthday"
        ? t("cal.birthdayTitle", { name: fullName(person) })
        : ev.kind === "anniversary"
        ? t("cal.anniversaryTitle", { name: fullName(person) })
        : t("cal.memorialTitle", { name: fullName(person) });
    return (
      <li key={ev.key} className={`flex items-center gap-1 rounded-xl transition-colors ${rowBg}`}>
        <button
          onClick={() => onSelect(person.id)}
          className="flex-1 min-w-0 flex items-center gap-3 px-2 py-2 text-left"
        >
          <Avatar person={person} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-text truncate leading-tight">{fullName(person)}</p>
            {subtext}
          </div>
          <span className={`text-[11px] font-medium px-2 py-1 rounded-lg shrink-0 ${badgeCls}`}>
            {humanizeDays(ev.days)}
          </span>
        </button>
        <CalendarAdd event={{ title: calTitle, date: occDate, yearly: true }} className="mr-1" />
      </li>
    );
  };

  const renderDivider = (key: string) => (
    <li aria-hidden className="flex items-center gap-2 py-1.5" key={key}>
      <span className="h-px flex-1 bg-accent/40" />
      <span className="text-[10px] font-semibold uppercase tracking-wide text-accent">
        {t("panel.today")}
      </span>
      <span className="h-px flex-1 bg-accent/40" />
    </li>
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto p-4 sm:p-6 grid gap-6">
        {/* Yaklaşan olaylar — İstatistikler'den taşındı. */}
        <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <h2 className="font-serif text-base font-semibold text-text">{t("panel.card.upcoming")}</h2>
            <span className="text-[11px] text-text-subtle shrink-0">{t("panel.card.upcomingHint")}</span>
          </div>
          {upcoming.length === 0 ? (
            <p className="text-sm text-text-subtle py-2">{t("panel.card.upcomingEmpty")}</p>
          ) : (
            <ul className="space-y-1">
              {future.map((ev) => renderRow(ev, "future"))}
              {todayEv.length > 0 ? (
                <>
                  {renderDivider("today-divider-top")}
                  {todayEv.map((ev) => renderRow(ev, "today"))}
                  {renderDivider("today-divider-bottom")}
                </>
              ) : (
                renderDivider("today-divider")
              )}
              {past.map((ev) => renderRow(ev, "past"))}
            </ul>
          )}
        </section>

        {/* Takvime aktar (.ics) — çoktan seçmeli. */}
        <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5 no-print">
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <h2 className="font-serif text-base font-semibold text-text">{t("cal.export.title")}</h2>
            <span className="text-[11px] text-text-subtle shrink-0">{t("cal.export.hint")}</span>
          </div>
          <CalendarExport people={people} />
        </section>
      </div>
    </div>
  );
}
