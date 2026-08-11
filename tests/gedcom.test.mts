import { exportGedcom, importGedcom } from "../lib/gedcom.ts";
import { isValidDateInput, displayToStored, storedToDisplay, calcAge } from "../lib/date.ts";
import type { Person } from "../types/family.ts";

const people: Person[] = [
  { id:"a", firstName:"Mehmet", lastName:"Yılmaz", gender:"male", birthDate:"1920-03-12", deathDate:"1994-11-02", deathCause:"Kalp yetmezliği", birthPlace:"Trabzon", bio:"Balıkçıydı.\nİki satır.", parentIds:[], spouseIds:["b"] },
  { id:"b", firstName:"Fatma", lastName:"Yılmaz", gender:"female", birthDate:"1925", parentIds:[], spouseIds:["a"] },
  { id:"c", firstName:"Ali", lastName:"Yılmaz", gender:"male", birthDate:"1948-01-25", parentIds:["a","b"], spouseIds:["d"] },
  { id:"d", firstName:"Ayşe", lastName:"Yılmaz", gender:"female", birthDate:"1952-09", parentIds:[], spouseIds:["c"] },
  { id:"e", firstName:"Emre", lastName:"Yılmaz", gender:"male", parentIds:["c","d"], spouseIds:[] },
];

const ged = exportGedcom(people);
const back = importGedcom(ged);

let ok=0, fail=0;
const check = (ad, kosul, detay="") => kosul ? ok++ : (fail++, console.log(`✗ ${ad} ${detay}`));

check("kişi sayısı", back.length === 5, `(${back.length})`);
const byName = (f) => back.find(p => p.firstName === f);
const m = byName("Mehmet"), f = byName("Fatma"), a = byName("Ali"), y = byName("Ayşe"), e = byName("Emre");

check("ad/soyad", m?.lastName === "Yılmaz");
check("cinsiyet", m?.gender==="male" && f?.gender==="female");
check("tam tarih", m?.birthDate === "1920-03-12", `(${m?.birthDate})`);
check("ölüm tarihi", m?.deathDate === "1994-11-02", `(${m?.deathDate})`);
check("ölüm nedeni (CAUS)", m?.deathCause === "Kalp yetmezliği", `(${m?.deathCause})`);
check("sadece yıl", f?.birthDate === "1925", `(${f?.birthDate})`);
check("yıl-ay", y?.birthDate === "1952-09", `(${y?.birthDate})`);
check("doğum yeri", m?.birthPlace === "Trabzon", `(${m?.birthPlace})`);
check("çok satırlı bio", m?.bio === "Balıkçıydı.\nİki satır.", JSON.stringify(m?.bio));
check("evlilik", m && f && m.spouseIds.includes(f.id) && f.spouseIds.includes(m.id));
check("ebeveyn bağı", a && m && f && a.parentIds.includes(m.id) && a.parentIds.includes(f.id), JSON.stringify(a?.parentIds.length));
check("torun bağı", e && a && y && e.parentIds.includes(a.id) && e.parentIds.includes(y.id));
check("tarihsiz kişi", e?.birthDate === undefined);

// Tarih doğrulama
check("gecerli GG.AA.YYYY", isValidDateInput("29.02.2024"));
check("gecersiz 30 subat", !isValidDateInput("30.02.2024"));
check("gecersiz 11111111", !isValidDateInput("11111111111"));
check("gecersiz 13. ay", !isValidDateInput("01.13.2020"));
check("sadece yil gecerli", isValidDateInput("1985"));
check("bos gecerli", isValidDateInput(""));
check("donusum", displayToStored("23.04.1985") === "1985-04-23");
check("geri donusum", storedToDisplay("1985-04-23") === "23.04.1985");
check("yas", calcAge("1920-03-12","1994-11-02") === 74, String(calcAge("1920-03-12","1994-11-02")));

console.log(`\n${ok}/${ok+fail} geçti${fail?`, ${fail} başarısız`:" ✓"}`);
