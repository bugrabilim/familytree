import { todaysReminders, remindersToText } from "../lib/reminders.ts";
import type { Person } from "../types/family.ts";

let ok = 0, fail = 0;
const check = (n: string, c: boolean, d = "") => { if (c) ok++; else { fail++; console.log(`✗ ${n} ${d}`); } };

const P = (over: Partial<Person>): Person => ({
  id: "x", firstName: "A", lastName: "B", gender: "male", parentIds: [], spouseIds: [], ...over,
});

// Bugün 17 Mayıs 2026 (ay 0-tabanlı: 4)
const today = new Date(2026, 4, 17);
const people: Person[] = [
  P({ id: "a", firstName: "Ayşe", birthDate: "1990-05-17" }),               // yaşayan → doğum günü, 36
  P({ id: "b", firstName: "Ölmüş", birthDate: "1940-05-17", deathDate: "2000-05-17" }), // anma 26 yıl (doğum günü DEĞİL, vefat etmiş)
  P({ id: "c", firstName: "Başka", birthDate: "1990-06-01" }),              // farklı gün → yok
  P({ id: "d", firstName: "Koca", spouseIds: ["e"], events: [{ id: "ev1", type: "evlilik", date: "2010-05-17" }] }),
  P({ id: "e", firstName: "Karı", spouseIds: ["d"], events: [{ id: "ev1", type: "evlilik", date: "2010-05-17" }] }),
];

const items = todaysReminders(people, today);
const kinds = items.map((i) => i.kind).sort().join(",");
check("bugünkü olay sayısı: doğum + anma + 1 yıldönümü", items.length === 3, `(${items.length}) ${kinds}`);
check("doğum günü yaşı", items.some((i) => i.kind === "birthday" && i.name.includes("Ayşe") && i.years === 36));
check("anma yılı", items.some((i) => i.kind === "memorial" && i.years === 26));
check("evlilik yıldönümü tek üretildi (çift eş → 1)", items.filter((i) => i.kind === "anniversary").length === 1);
check("yıldönümünde eş adı", items.some((i) => i.kind === "anniversary" && !!i.spouseName && (i.spouseName.includes("Karı") || i.spouseName.includes("Koca"))));

// Vefat edenin doğum günü sayılmaz (yalnız yaşayan)
check("vefat edenin doğum günü yok", !items.some((i) => i.kind === "birthday" && i.name.includes("Ölmüş")));

// Metin çıktısı
const txt = remindersToText(items, "tr");
check("metin doğum günü satırı", txt.includes("🎂") && txt.includes("36 yaşında"));
check("metin anma satırı", txt.includes("🕯️"));
check("metin yıldönümü satırı", txt.includes("💍"));

// Farklı günde boş
check("başka günde olay yok", todaysReminders(people, new Date(2026, 0, 1)).length === 0);

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
