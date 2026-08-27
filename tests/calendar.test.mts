import { compactDate, nextDayCompact, buildICS, googleCalendarUrl, yahooCalendarUrl, outlookCalendarUrl } from "../lib/calendar.ts";

let ok = 0, fail = 0;
const check = (n: string, c: boolean, d = "") => { if (c) ok++; else { fail++; console.log(`✗ ${n} ${d}`); } };

check("compactDate", compactDate("1990-05-17") === "19900517");
check("compactDate geçersiz → boş", compactDate("1990") === "");
check("nextDayCompact", nextDayCompact("1990-05-17") === "19900518");
check("nextDayCompact ay sonu", nextDayCompact("1990-01-31") === "19900201");
check("nextDayCompact yıl sonu", nextDayCompact("1990-12-31") === "19910101");

const ev = { title: "Ayşe'nin doğum günü", date: "1990-05-17", yearly: true, description: "Soy ağacı" };
const ics = buildICS(ev);
check("ics VCALENDAR", ics.startsWith("BEGIN:VCALENDAR") && ics.includes("END:VCALENDAR"));
check("ics tüm-gün başlangıç", ics.includes("DTSTART;VALUE=DATE:19900517"));
check("ics tüm-gün bitiş", ics.includes("DTEND;VALUE=DATE:19900518"));
check("ics yıllık tekrar", ics.includes("RRULE:FREQ=YEARLY"));
check("ics CRLF satır sonu", ics.includes("\r\n"));

const noRec = buildICS({ title: "Tek", date: "2000-01-01" });
check("yıllık değilse RRULE yok", !noRec.includes("RRULE"));

check("google url", (() => { const u = googleCalendarUrl(ev); return u.includes("dates=19900517/19900518") && u.includes("recur=") && u.includes("action=TEMPLATE"); })());
check("yahoo url", (() => { const u = yahooCalendarUrl(ev); return u.startsWith("https://calendar.yahoo.com/?") && u.includes("st=19900517") && u.includes("dur=allday"); })());
check("outlook url", (() => { const u = outlookCalendarUrl(ev); return u.includes("outlook.live.com") && u.includes("allday=true") && u.includes("startdt=1990-05-17"); })());

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
