import type { Person } from "../types/family.ts";
import {
  buildNewsletter,
  shouldSend,
  upcomingItems,
  type Newsletter,
  newsletterToLines,
} from "../lib/newsletter.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

const P = (over: Partial<Person> & { id: string }): Person =>
  ({ firstName: "Ad", lastName: "Soyad", gender: "unknown", parentIds: [], spouseIds: [], ...over }) as Person;

/* ── Boş ağaçta bülten üretilmiyor ────────────────────────────────────────── */

check(buildNewsletter([], { from: "2026-09-01", to: "2026-09-30" }) === null, "boş ağaçta null döner");

{
  // Ağaçta yalnız çevre + gizli kişi var → yine görünür kimse yok → null.
  const people = [
    P({ id: "cevre1", kind: "cevre", birthDate: "2026-09-10" }),
    P({ id: "gizli1", confidential: true, birthDate: "2026-09-10" }),
  ];
  check(buildNewsletter(people, { from: "2026-09-01", to: "2026-09-30" }) === null, "yalnız çevre/gizli kişili ağaçta null döner");
}

/* ── Dönem sınırları ───────────────────────────────────────────────────────── */

{
  const people = [
    P({ id: "1", firstName: "İçeride", birthDate: "2026-09-15" }),
    P({ id: "2", firstName: "Dışarıda", birthDate: "2026-10-02" }),
    P({ id: "3", firstName: "TarihiBelirsiz", birthDate: "2026" }), // yıl-hassasiyetli → bültende asla girmez
  ];
  const n = buildNewsletter(people, { from: "2026-09-01", to: "2026-09-30" }) as Newsletter;
  check(n.events.some((e) => e.kind === "dogum" && e.id === "1"), "aralık içindeki doğum events'te var");
  check(!n.events.some((e) => e.id === "2"), "aralık dışındaki doğum events'te yok");
  check(!n.events.some((e) => e.id === "3"), "yalnız yıl bilinen tarih events'te hiç görünmüyor");
}

{
  // Yılı aşan pencere: Aralık sonu → Ocak başı.
  const people = [P({ id: "1", firstName: "YilbasiBebegi", birthDate: "2026-01-03" })];
  const n = buildNewsletter(people, { from: "2025-12-25", to: "2026-01-05" }) as Newsletter;
  check(n.events.length === 1 && n.events[0].id === "1", "yıl sınırını aşan dönem doğru çalışıyor");
}

/* ── confidential hiçbir bölümde görünmüyor ──────────────────────────────── */

{
  const gizli = P({ id: "g", firstName: "Gizli", confidential: true, birthDate: "2026-09-10" });
  const acik = P({ id: "a", firstName: "Açık", birthDate: "2026-09-10" });
  const before: Person[] = []; // hem gizli hem açık kişi bu dönemde "eklenmiş" sayılacak
  const now = [gizli, acik];
  const n = buildNewsletter(now, { from: "2026-09-01", to: "2026-09-30", before }) as Newsletter;

  check(!!n, "gizli + açık kişili ağaçta bülten üretiliyor");
  check(n.growth.totalPeople === 1, `gizli kişi toplam sayıya girmiyor (${n.growth.totalPeople})`);
  check(n.additions!.count === 1 && n.additions!.people.every((p) => p.id !== "g"), "gizli kişi eklenenler listesinde yok");
  check(!n.events.some((e) => e.id === "g"), "gizli kişinin doğumu events'te yok");
  check(!n.anniversaries.some((a) => a.id === "g"), "gizli kişi yıl dönümlerinde yok");

  // upcomingItems tek başına gizlilik-farkında DEĞİL (düşük seviyeli, ham
  // liste alan bir yardımcı) — gizlilik süzgeci `buildNewsletter`in işi.
  // Onu doğrudan çağıran biri kendi süzmeli; kanıt aşağıda `n.upcoming`'de.
  check(!n.upcoming.some((u) => u.id === "g"), "gizli kişi buildNewsletter çıktısındaki yaklaşan doğum günlerinde yok");

  const nStr = JSON.stringify(n);
  check(!nStr.includes("Gizli") && !nStr.includes("\"g\""), "gizli kişinin adı/kimliği bültenin HİÇBİR yerinde geçmiyor");
}

/* ── "Olan" ile "kayda geçen" ayrımı korunuyor ───────────────────────────── */

{
  // 1890 doğumlu bir dede bu dönemde ağaca eklendi — bu bir DOĞUM değil, bir KAYIT.
  const dede = P({ id: "dede", firstName: "Mehmed", birthDate: "1890-03-01", deathDate: "1961-05-01" });
  const before: Person[] = [];
  const now = [dede];
  const n = buildNewsletter(now, { from: "2026-09-01", to: "2026-09-30", before }) as Newsletter;

  check(n.additions!.count === 1 && n.additions!.people[0].id === "dede", "1890 doğumlu dede 'eklenenler'de görünüyor");
  check(!n.events.some((e) => e.id === "dede"), "aynı dede 'events' (ailede olan doğum) listesinde YOK");
  check(!n.anniversaries.some((a) => a.id === "dede"), "1890/1961 tarihleri bu dönemin bir gününe denk gelmiyor → yıl dönümünde de yok");
}

{
  // before verilmezse additions hiç üretilmez (uydurma sayı yok).
  const people = [P({ id: "1", birthDate: "2026-09-10" })];
  const n = buildNewsletter(people, { from: "2026-09-01", to: "2026-09-30" }) as Newsletter;
  check(n.additions === null, "before verilmezse additions null");
}

/* ── Yuvarlak yıl dönümü: yalnız 10'un katları / 25 / 75 ─────────────────── */

{
  const kisi30 = P({ id: "k30", birthDate: "1996-09-20" }); // 2026'da 30. yaş
  const kisi33 = P({ id: "k33", birthDate: "1993-09-20" }); // 2026'da 33. yaş — yuvarlak değil
  const n = buildNewsletter([kisi30, kisi33], { from: "2026-09-01", to: "2026-09-30" }) as Newsletter;
  check(n.anniversaries.some((a) => a.id === "k30" && a.years === 30), "30. yıl dönümü görünüyor");
  check(!n.anniversaries.some((a) => a.id === "k33"), "33. yıl (yuvarlak değil) görünmüyor");
}

/* ── Ağacın büyüme özeti ──────────────────────────────────────────────────── */

{
  const dede = P({ id: "dede", birthDate: "1950-01-01" });
  const cocuk = P({ id: "cocuk", birthDate: "1980-01-01", parentIds: ["dede"] });
  const torun = P({ id: "torun", birthDate: "2010-01-01", parentIds: ["cocuk"] });
  const n = buildNewsletter([dede, cocuk, torun], { from: "2026-01-01", to: "2026-01-31" }) as Newsletter;
  check(n.growth.totalPeople === 3, "toplam kişi doğru");
  check(n.growth.generations === 3, `kuşak sayısı doğru (${n.growth.generations})`);
}

/* ── Yaklaşan doğum günleri / yıl dönümleri (upcoming) ───────────────────── */

{
  const yasayan = P({ id: "y", firstName: "Yaşayan", birthDate: "1990-10-05" });
  const vefat = P({ id: "v", firstName: "Vefat", birthDate: "1930-10-05", deathDate: "2000-10-05" });
  const items = upcomingItems([yasayan, vefat], "2026-10-01", "2026-10-31");
  check(items.some((i) => i.kind === "birthday" && i.id === "y" && i.years === 36), "yaşayanın doğum günü + yaş");
  check(!items.some((i) => i.kind === "birthday" && i.id === "v"), "vefat edenin doğum günü yok (yalnız anma)");
  check(items.some((i) => i.kind === "memorial" && i.id === "v" && i.years === 26), "vefat edenin anma yılı");
  check(items.every((i) => i.id !== "y" || i.kind !== "memorial"), "yaşayanın anması yok");
}

{
  // Evlilik yıl dönümü tek üretiliyor (iki eşten değil), round-limit YOK.
  const koca = P({ id: "koca", spouseIds: ["kari"], events: [{ id: "ev1", type: "evlilik", date: "2020-11-11" }] });
  const kari = P({ id: "kari", firstName: "Eş", spouseIds: ["koca"], events: [{ id: "ev1", type: "evlilik", date: "2020-11-11" }] });
  const items = upcomingItems([koca, kari], "2026-11-01", "2026-11-30");
  const annivs = items.filter((i) => i.kind === "anniversary");
  check(annivs.length === 1, `evlilik yıl dönümü tek üretiliyor (${annivs.length})`);
  check(annivs[0].years === 6, "6. yıl (yuvarlak olmasa da) upcoming'de görünüyor");
  check(!!annivs[0].spouseName, "eş adı doluyor");
}

{
  // buildNewsletter içindeki varsayılan pencere: dönemin hemen ardından, aynı uzunlukta.
  const kisi = P({ id: "k", birthDate: "1999-10-05" });
  const n = buildNewsletter([kisi], { from: "2026-09-01", to: "2026-09-30" }) as Newsletter;
  check(n.upcoming.some((u) => u.id === "k" && u.date === "2026-10-05"), "varsayılan yaklaşan pencere dönemin hemen ardından başlıyor");
}

/* ── hideLiving: yaşayanların doğum tarihi de maskelenir ─────────────────── */

{
  const kisi = P({ id: "k", firstName: "Yaşayan", birthDate: "2026-09-15" });
  const before: Person[] = [];
  const n = buildNewsletter([kisi], { from: "2026-09-01", to: "2026-09-30", before, hideLiving: true }) as Newsletter;
  check(n.additions!.count === 1, "hideLiving'de bile kişi 'eklenenler'de görünüyor (varlığı gizli değil)");
  check(n.events.length === 0, "hideLiving'de doğum tarihi maskelendiği için events boş");
  check(n.upcoming.length === 0, "hideLiving'de yaklaşan doğum günü de yok");
}

/* ── shouldSend: boş bültenle üretilmiş bülten ayrımı ─────────────────────── */

{
  const kisi = P({ id: "k", birthDate: "1950-01-01" }); // dönemle hiç ilgisi olmayan bir kişi
  const n = buildNewsletter([kisi], { from: "2026-09-01", to: "2026-09-30" });
  check(n !== null, "kişi olan ama olaysız dönemde de bülten üretiliyor (null değil)");
  check(n!.empty === true, "olaysız dönemde empty=true");
  check(shouldSend(n) === false, "olaysız bültende shouldSend false");

  const dolu = P({ id: "d", birthDate: "2026-09-15" });
  const n2 = buildNewsletter([kisi, dolu], { from: "2026-09-01", to: "2026-09-30" });
  check(shouldSend(n2) === true, "olaylı bültende shouldSend true");
  check(shouldSend(null) === false, "null için shouldSend false");
}

/* --- METNE ÇEVİRME ------------------------------------------------------ */
/*
 * Biçimlendirme rotada değil burada olmalı: üç e-posta üreticisi
 * (`reminders`, `memorial-notify`, `newsletter`) aynı kalıbı izliyor. Rotada
 * kalsaydı dil üç ayrı yerde tutulur ve testsiz kalırdı.
 */
{
  const P = (o: Partial<Person> & { id: string }): Person =>
    ({ firstName: "A", lastName: "B", gender: "unknown", parentIds: [], spouseIds: [], ...o }) as Person;
  const n = buildNewsletter(
    [P({ id: "a", firstName: "Ali", lastName: "Yılmaz", birthDate: "2026-09-10" })],
    { from: "2026-09-01", to: "2026-09-30" }
  )!;
  const tr = newsletterToLines(n, "tr");
  const en = newsletterToLines(n, "en");

  check("TR satırları üretiliyor", tr.length > 0);
  check("EN satırları üretiliyor", en.length > 0);
  check("iki dil de aynı sayıda satır", tr.length === en.length);
  /*
   * Büyüme satırı HER ZAMAN var: bülten "bu ay sakin geçti" dese bile ağacın
   * o anki büyüklüğü taşıdığı en küçük anlamlı bilgi.
   */
  check("TR büyüme satırı var", tr.some((l) => l.includes("kişi") && l.includes("kuşak")));
  check("EN büyüme satırı var", en.some((l) => l.includes("people") && l.includes("generations")));
  check("TR ile EN gerçekten farklı", tr.join("|") !== en.join("|"));
  // Doğum tarihi dönem içinde → olay satırı çıkmalı.
  check("dönem içi doğum satıra giriyor", tr.some((l) => l.includes("Ali") && l.includes("doğdu")));
}
{
  // Gizli kişi metne de sızmamalı — JSON denetiminin metin karşılığı.
  const P = (o: Partial<Person> & { id: string }): Person =>
    ({ firstName: "A", lastName: "B", gender: "unknown", parentIds: [], spouseIds: [], ...o }) as Person;
  const n = buildNewsletter(
    [
      P({ id: "a", firstName: "Acik", birthDate: "2026-09-10" }),
      P({ id: "g", firstName: "GizliKisi", birthDate: "2026-09-11", confidential: true }),
    ],
    { from: "2026-09-01", to: "2026-09-30" }
  )!;
  const hepsi = newsletterToLines(n, "tr").join("\n") + newsletterToLines(n, "en").join("\n");
  check("gizli kişi metinde yok", !hepsi.includes("GizliKisi"));
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
