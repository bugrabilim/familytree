/**
 * Takvime ekleme (tek tuş) için saf yardımcılar — .ics içeriği ve Google/Yahoo/
 * Outlook web bağlantıları. iOS/Apple, Outlook masaüstü vb. .ics'i açar; Google/
 * Yahoo/Outlook.com için doğrudan bağlantı üretilir. Doğum günü gibi olaylar
 * her yıl tekrar eder (RRULE:FREQ=YEARLY). Çerçeveden bağımsız → test edilebilir.
 */

export interface CalEvent {
  /** Başlık, ör. "Ayşe'nin doğum günü". */
  title: string;
  /** Başlangıç günü — tüm-gün, "YYYY-MM-DD". */
  date: string;
  /** Her yıl tekrar etsin mi (doğum günü / yıldönümü / anma). */
  yearly?: boolean;
  /** İsteğe bağlı açıklama. */
  description?: string;
}

/** "YYYY-MM-DD" → "YYYYMMDD" (takvim biçimi). Geçersizse boş döner. */
export function compactDate(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((date ?? "").trim());
  return m ? `${m[1]}${m[2]}${m[3]}` : "";
}

/** Bir günü bir sonraki güne çevirir (tüm-gün olayın bitişi; DTEND dışlayıcı). */
export function nextDayCompact(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((date ?? "").trim());
  if (!m) return "";
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  d.setUTCDate(d.getUTCDate() + 1);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${mo}${da}`;
}

/** .ics kaçışı — virgül/noktalı virgül/ters bölü/yeni satır. */
function icsEscape(s: string): string {
  return (s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Tek bir VEVENT bloğu (VCALENDAR sarmalayıcısı olmadan). */
function veventLines(ev: CalEvent): string[] {
  const start = compactDate(ev.date);
  const end = nextDayCompact(ev.date);
  if (!start || !end) return [];
  const uid = `${start}-${Math.random().toString(36).slice(2, 10)}@soyagaci`;
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${end}`,
    ...(ev.yearly ? ["RRULE:FREQ=YEARLY"] : []),
    `SUMMARY:${icsEscape(ev.title)}`,
    ...(ev.description ? [`DESCRIPTION:${icsEscape(ev.description)}`] : []),
    "END:VEVENT",
  ];
}

/** Tüm-gün (isteğe bağlı yıllık) bir olay için .ics dosya içeriği. */
export function buildICS(ev: CalEvent): string {
  return buildICSMulti([ev]);
}

/** Birden çok olay için tek .ics — herkesin/seçilenlerin doğum günlerini dışa
 *  aktarmak için (iOS/Apple/Outlook tek dosyayla içe alır). */
export function buildICSMulti(events: CalEvent[]): string {
  const body = events.flatMap((ev) => veventLines(ev));
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SoyAgaci//TR//",
    "CALSCALE:GREGORIAN",
    ...body,
    "END:VCALENDAR",
  ].join("\r\n");
}

const enc = encodeURIComponent;

/** Google Takvim "şablon" bağlantısı (tüm-gün, isteğe bağlı yıllık). */
export function googleCalendarUrl(ev: CalEvent): string {
  const start = compactDate(ev.date);
  const end = nextDayCompact(ev.date);
  const params = [
    "action=TEMPLATE",
    `text=${enc(ev.title)}`,
    `dates=${start}/${end}`,
    ...(ev.yearly ? [`recur=${enc("RRULE:FREQ=YEARLY")}`] : []),
    ...(ev.description ? [`details=${enc(ev.description)}`] : []),
  ];
  return `https://calendar.google.com/calendar/render?${params.join("&")}`;
}

/** Yahoo Takvim bağlantısı (tüm-gün). Yahoo yıllık tekrarı sınırlı destekler. */
export function yahooCalendarUrl(ev: CalEvent): string {
  const start = compactDate(ev.date);
  const params = [
    "v=60",
    `title=${enc(ev.title)}`,
    `st=${start}`,
    "dur=allday",
    ...(ev.description ? [`desc=${enc(ev.description)}`] : []),
  ];
  return `https://calendar.yahoo.com/?${params.join("&")}`;
}

/** Outlook.com "compose" derin bağlantısı (tüm-gün). */
export function outlookCalendarUrl(ev: CalEvent): string {
  const params = [
    "path=/calendar/action/compose",
    "rru=addevent",
    `subject=${enc(ev.title)}`,
    `startdt=${enc(ev.date)}`,
    "allday=true",
    ...(ev.description ? [`body=${enc(ev.description)}`] : []),
  ];
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.join("&")}`;
}
