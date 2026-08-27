"use client";

import { useMemo, useState } from "react";
import type { Person } from "@/types/family";
import { fullName } from "@/lib/name";
import { buildICSMulti, type CalEvent } from "@/lib/calendar";
import { usePrivacy } from "./PrivacyContext";
import Avatar from "./ui/Avatar";
import { useT, type TFunction } from "@/lib/i18n";

interface Props {
  people: Person[];
}

/**
 * Yaşam olayı tarihini takvim tarihine çevirir. Takvim tam gün ister; kısmi
 * tarihleri makul biçimde tamamlar (#4):
 *  · YYYY-MM-DD → o gün, her yıl tekrarlı (doğum günü / yıl dönümü)
 *  · YYYY-MM    → ayın 1'i, her yıl tekrarlı
 *  · YYYY       → o yılın 1 Ocak'ı, TEK sefer (yıl dönümü günü bilinmiyor)
 * Böylece yıl-yalnız kayıtlı özel günler (evlilik, kaza, göç…) da aktarılır.
 */
function toCalDate(d?: string): { date: string; yearly: boolean } | null {
  if (!d) return null;
  const parts = d.split("-");
  const y = parts[0];
  if (!/^\d{4}$/.test(y)) return null;
  if (parts.length >= 3) return { date: `${y}-${parts[1]}-${parts[2].slice(0, 2)}`, yearly: true };
  if (parts.length === 2) return { date: `${y}-${parts[1]}-01`, yearly: true };
  return { date: `${y}-01-01`, yearly: false };
}

/** Bir olay türü etiketi — doğum/anma sabittir; yaşam olayları event.* ya da
 *  serbest metin (ör. "kaza") olabilir. */
function typeLabel(key: string, t: TFunction): string {
  if (key === "dogum") return t("cal.type.birthday");
  if (key === "olum") return t("cal.type.memorial");
  const raw = key.slice(3); // "ev:"
  const label = t(`event.${raw}`);
  // Sözlükte yoksa useT anahtarı aynen döndürür → serbest metni göster.
  return label === `event.${raw}` ? raw : label;
}

type PersonEvent = { personId: string; typeKey: string; ev: CalEvent };

/**
 * İstatistikler sayfasındaki çoktan-seçmeli takvim dışa aktarma alanı (#1).
 * Kullanıcı OLAY TÜRLERİNİ (doğum günü, anma, evlilik, kaza… gibi yaşam
 * olayları) ve KİŞİLERİ ("Hepsi" ya da tek tek seçerek) işaretler; seçime
 * uyan tüm olaylar tek bir .ics dosyasına (yıllık tekrarlı) aktarılır.
 * Gizlilik: maskeli kopya üzerinden çalışır → gizli tarihler sızmaz.
 */
export default function CalendarExport({ people }: Props) {
  const { view } = usePrivacy();
  const t = useT();

  // Maskeli kopya + isme göre (TR) sıralı liste — tüm hesaplar bunun üzerinden.
  const masked = useMemo(() => {
    const coll = new Intl.Collator("tr");
    return people
      .map(view)
      .sort((a, b) => coll.compare(a.firstName, b.firstName) || coll.compare(a.lastName, b.lastName));
  }, [people, view]);

  // Her kişinin olası takvim olayları (doğum günü, anma, yaşam olayları).
  const allEvents = useMemo(() => {
    const out: PersonEvent[] = [];
    for (const p of masked) {
      const name = fullName(p);
      const bd = toCalDate(p.birthDate);
      if (bd) out.push({ personId: p.id, typeKey: "dogum", ev: { title: t("cal.birthdayTitle", { name }), ...bd } });
      const dd = toCalDate(p.deathDate);
      if (dd) out.push({ personId: p.id, typeKey: "olum", ev: { title: t("cal.memorialTitle", { name }), ...dd } });
      for (const e of p.events ?? []) {
        const cd = toCalDate(e.date);
        if (!cd) continue;
        const key = `ev:${e.type}`;
        const label = e.title?.trim() || typeLabel(key, t);
        const title = e.type === "evlilik" ? t("cal.anniversaryTitle", { name }) : `${name} — ${label}`;
        out.push({ personId: p.id, typeKey: key, ev: { title, ...cd } });
      }
    }
    return out;
  }, [masked, t]);

  // Veride var olan olay türleri (checkbox listesi bundan üretilir).
  const availableTypes = useMemo(() => {
    const seen = new Map<string, number>();
    for (const pe of allEvents) seen.set(pe.typeKey, (seen.get(pe.typeKey) ?? 0) + 1);
    // Doğum ve anmayı öne al, kalanları etikete göre sırala.
    const order = (k: string) => (k === "dogum" ? 0 : k === "olum" ? 1 : 2);
    return [...seen.entries()]
      .map(([key, count]) => ({ key, count, label: typeLabel(key, t) }))
      .sort((a, b) => order(a.key) - order(b.key) || a.label.localeCompare(b.label, "tr"));
  }, [allEvents, t]);

  // Türü olan kişiler (isim listesi bundan üretilir; tarihsiz kişi görünmez).
  const peopleWithEvents = useMemo(() => {
    const ids = new Set(allEvents.map((e) => e.personId));
    return masked.filter((p) => ids.has(p.id));
  }, [masked, allEvents]);

  // Seçimler — varsayılan: tüm türler + tüm kişiler ("Hepsi").
  const [selTypes, setSelTypes] = useState<Set<string> | null>(null); // null = hepsi
  const [selPeople, setSelPeople] = useState<Set<string> | null>(null); // null = hepsi
  const [query, setQuery] = useState("");

  const typeChecked = (k: string) => selTypes === null || selTypes.has(k);
  const personChecked = (id: string) => selPeople === null || selPeople.has(id);

  const toggleType = (k: string) =>
    setSelTypes((prev) => {
      const base = prev ?? new Set(availableTypes.map((x) => x.key));
      const n = new Set(base);
      if (n.has(k)) n.delete(k); else n.add(k);
      return n;
    });
  const togglePerson = (id: string) =>
    setSelPeople((prev) => {
      const base = prev ?? new Set(peopleWithEvents.map((p) => p.id));
      const n = new Set(base);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  const allTypes = () => setSelTypes(null);
  const noTypes = () => setSelTypes(new Set());
  const allPeople = () => setSelPeople(null);
  const noPeople = () => setSelPeople(new Set());

  const filteredPeople = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr");
    return q ? peopleWithEvents.filter((p) => fullName(p).toLocaleLowerCase("tr").includes(q)) : peopleWithEvents;
  }, [peopleWithEvents, query]);

  // Dışa aktarılacak olaylar — seçili tür ∩ seçili kişi.
  const chosen = useMemo(
    () => allEvents.filter((e) => typeChecked(e.typeKey) && personChecked(e.personId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allEvents, selTypes, selPeople]
  );

  const exportIcs = () => {
    if (chosen.length === 0) return;
    try {
      const blob = new Blob([buildICSMulti(chosen.map((e) => e.ev))], { type: "text/calendar;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "aile-takvim.ics";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      /* yoksay */
    }
  };

  if (availableTypes.length === 0) {
    return <p className="text-sm text-text-subtle py-2">{t("cal.export.empty")}</p>;
  }

  const allTypesOn = selTypes === null;
  const allPeopleOn = selPeople === null;

  return (
    <div className="space-y-4">
      {/* Olay türleri */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-xs font-medium text-text-muted">{t("cal.export.types")}</span>
          <label className="flex items-center gap-1.5 text-[11px] text-text cursor-pointer select-none">
            <input type="checkbox" checked={allTypesOn} onChange={(e) => (e.target.checked ? allTypes() : noTypes())} className="accent-[var(--primary)]" />
            {t("cal.export.all")}
          </label>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {availableTypes.map((tt) => (
            <button
              key={tt.key}
              type="button"
              onClick={() => toggleType(tt.key)}
              aria-pressed={typeChecked(tt.key)}
              className={`h-8 px-2.5 rounded-lg text-xs font-medium border transition-colors ${
                typeChecked(tt.key)
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-border bg-surface text-text-muted hover:text-text"
              }`}
            >
              {tt.label}
              <span className="ml-1 tabular-nums opacity-70">{tt.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Kişiler */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-xs font-medium text-text-muted">{t("cal.export.people")}</span>
          <label className="flex items-center gap-1.5 text-[11px] text-text cursor-pointer select-none">
            <input type="checkbox" checked={allPeopleOn} onChange={(e) => (e.target.checked ? allPeople() : noPeople())} className="accent-[var(--primary)]" />
            {t("cal.export.everyone")}
          </label>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("cal.export.searchPlaceholder")}
          className="w-full h-9 px-3 mb-2 rounded-xl bg-surface-2 border border-border text-sm text-text placeholder:text-text-subtle focus:outline-none focus:border-primary"
        />
        <ul className="max-h-64 overflow-y-auto space-y-0.5 pr-0.5">
          {filteredPeople.map((p) => (
            <li key={p.id}>
              <label className="w-full flex items-center gap-2.5 px-2 py-1.5 -mx-1 rounded-lg hover:bg-surface-2 transition-colors cursor-pointer">
                <input
                  type="checkbox"
                  checked={personChecked(p.id)}
                  onChange={() => togglePerson(p.id)}
                  className="shrink-0 accent-[var(--primary)]"
                />
                <Avatar person={p} size="xs" />
                <span className="text-sm text-text truncate flex-1 min-w-0">{fullName(p)}</span>
                {p.birthDate && <span className="text-[11px] text-text-subtle tabular-nums shrink-0">{p.birthDate.slice(0, 4)}</span>}
              </label>
            </li>
          ))}
          {filteredPeople.length === 0 && (
            <li className="text-sm text-text-subtle py-2 text-center">{t("panel.rf.noMatch")}</li>
          )}
        </ul>
      </div>

      {/* Dışa aktar */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <p className="text-[11px] text-text-subtle">{t("cal.export.count", { count: chosen.length })}</p>
        <button
          type="button"
          onClick={exportIcs}
          disabled={chosen.length === 0}
          className="h-9 px-3.5 rounded-xl bg-primary text-primary-text text-xs font-medium flex items-center gap-1.5 transition-all hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <rect x="3.5" y="5" width="17" height="15" rx="2" stroke="currentColor" strokeWidth="1.8" />
            <path d="M3.5 9h17M8 3v3M16 3v3M12 12v4M10 14h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          {t("cal.export.download")}
        </button>
      </div>
    </div>
  );
}
