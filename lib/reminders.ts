import type { Person } from "@/types/family";

/**
 * E-posta hatırlatmaları için SAF çekirdek: verilen bir güne denk gelen
 * doğum günü / ölüm yıl dönümü / evlilik yıl dönümü olaylarını üretir ve
 * bunları düz metin bir özete çevirir. Çerçeveden bağımsız → test edilebilir.
 * (Gerçek e-posta gönderimi lib/email.ts + cron tarafından yapılır.)
 */

export type ReminderKind = "birthday" | "memorial" | "anniversary";

export interface ReminderItem {
  kind: ReminderKind;
  personId: string;
  name: string;
  /** Kaçıncı yıl (doğum günü → yaş, anma/yıldönümü → yıl). Yıl bilinmiyorsa null. */
  years: number | null;
  /** Eş adı (yalnız evlilik yıl dönümünde, biliniyorsa). */
  spouseName?: string;
}

const isFullDate = (d?: string): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);
const mmdd = (d: string) => d.slice(5, 10); // "MM-DD"
const year = (d: string) => parseInt(d.slice(0, 4), 10);
const nameOf = (p: Person) => `${p.firstName} ${p.lastName}`.trim() || p.firstName || "—";

/**
 * `today` gününe denk gelen hatırlatmalar. Doğum günü yalnız yaşayanlar için;
 * anma yalnız vefat edenler için; evlilik yıl dönümü kişilerin `events`'inden.
 */
export function todaysReminders(people: Person[], today: Date): ReminderItem[] {
  const key = `${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const y = today.getFullYear();
  const byId = new Map(people.map((p) => [p.id, p]));
  const out: ReminderItem[] = [];
  const seenAnniv = new Set<string>();

  for (const p of people) {
    // 🎂 Doğum günü — yaşayanlar
    if (!p.deathDate && isFullDate(p.birthDate) && mmdd(p.birthDate) === key) {
      out.push({ kind: "birthday", personId: p.id, name: nameOf(p), years: y - year(p.birthDate) });
    }
    // 🕯️ Anma — vefat edenler
    if (isFullDate(p.deathDate) && mmdd(p.deathDate) === key) {
      out.push({ kind: "memorial", personId: p.id, name: nameOf(p), years: y - year(p.deathDate) });
    }
    // 💍 Evlilik yıl dönümü
    for (const ev of p.events ?? []) {
      if (ev.type !== "evlilik" || !isFullDate(ev.date) || mmdd(ev.date) !== key) continue;
      // Aynı evliliği iki eşten iki kez üretme: çift-anahtarla tekilleştir.
      const spouseId = (p.spouseIds ?? [])[0];
      const pairKey = [p.id, spouseId ?? ev.id].sort().join("|") + "|" + ev.date;
      if (seenAnniv.has(pairKey)) continue;
      seenAnniv.add(pairKey);
      const spouse = spouseId ? byId.get(spouseId) : undefined;
      out.push({
        kind: "anniversary",
        personId: p.id,
        name: nameOf(p),
        years: y - year(ev.date),
        spouseName: spouse ? nameOf(spouse) : undefined,
      });
    }
  }
  return out;
}

/** Hatırlatma listesini e-posta gövdesi (düz metin) için satırlara çevirir. */
export function remindersToText(items: ReminderItem[], lang: "tr" | "en" = "tr"): string {
  const line = (it: ReminderItem): string => {
    const yrs = it.years !== null && it.years >= 0 ? it.years : null;
    if (lang === "en") {
      if (it.kind === "birthday") return `🎂 ${it.name}${yrs !== null ? ` turns ${yrs}` : "'s birthday"}`;
      if (it.kind === "memorial") return `🕯️ ${it.name}${yrs !== null ? ` — ${yrs} year(s) since passing` : " — in memory"}`;
      return `💍 ${it.name}${it.spouseName ? ` & ${it.spouseName}` : ""}${yrs !== null ? ` — ${yrs}th wedding anniversary` : " — wedding anniversary"}`;
    }
    if (it.kind === "birthday") return `🎂 ${it.name}${yrs !== null ? ` ${yrs} yaşında` : " doğum günü"}`;
    if (it.kind === "memorial") return `🕯️ ${it.name}${yrs !== null ? ` — vefatının ${yrs}. yılı` : " — anma"}`;
    return `💍 ${it.name}${it.spouseName ? ` & ${it.spouseName}` : ""}${yrs !== null ? ` — ${yrs}. evlilik yıl dönümü` : " — evlilik yıl dönümü"}`;
  };
  return items.map(line).join("\n");
}
