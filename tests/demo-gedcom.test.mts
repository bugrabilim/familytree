import { exportGedcom, importGedcom } from "../lib/gedcom.ts";
import { DEMO_PEOPLE } from "../lib/demo-data.ts";
import { describeRelation, indexPeople } from "../lib/relations.ts";

let ok=0, fail=0;
const c = (ad: string, k: boolean, d="") => k ? ok++ : (fail++, console.log(`✗ ${ad} ${d}`));

// --- Demo verisiyle GEDCOM gidiş-dönüş ---
const ged = exportGedcom(DEMO_PEOPLE);
const back = importGedcom(ged);
const f = (ad: string) => back.find(p => p.firstName === ad);

c("kişi sayısı korundu", back.length === DEMO_PEOPLE.length, `${back.length}/${DEMO_PEOPLE.length}`);

const cem = back.find(p => p.firstName === "Cem");
c("6 evlilik: 1 güncel + 5 eski", !!cem && cem.spouseIds.length === 1 && (cem.formerSpouseIds ?? []).length === 5,
  `güncel ${cem?.spouseIds.length}, eski ${(cem?.formerSpouseIds ?? []).length}`);

const ahmet = back.find(p => p.firstName === "Ahmet" && p.lastName === "Değirmencioğlu");
c("çok eşlilik: 4 güncel eş", !!ahmet && ahmet.spouseIds.length === 4, `${ahmet?.spouseIds.length} eş`);

const denizS = back.find(p => p.firstName === "Deniz" && p.birthDate === "1958-07-04");
c("interseks cinsiyet (SEX X)", denizS?.gender === "other", String(denizS?.gender));

const veli = back.find(p => p.firstName === "Veli");
c("tarihsiz kişi korundu", !!veli && !veli.birthDate && !veli.deathDate);

const mehmet = back.find(p => p.firstName === "Mehmet" && p.lastName === "Demirtaş");
c("çok satırlı biyografi", !!mehmet?.bio?.includes("\n"), JSON.stringify(mehmet?.bio?.slice(0,30)));

const orhan = back.find(p => p.firstName === "Orhan" && p.lastName === "Demirtaş" && p.birthDate === "1947-02-19");
const orhanCocuk = back.filter(p => p.parentIds.includes(orhan?.id ?? ""));
c("3 evlilikten çocuklar", orhanCocuk.length >= 6, `${orhanCocuk.length} çocuk`);

// --- Demo veride Türkçe akrabalık ---
const idx = indexPeople(DEMO_PEOPLE);
const rel = (a: string, b: string) => describeRelation(a, b, DEMO_PEOPLE, idx);
const cases: Array<[string,string,string]> = [
  ["k9-deniz", "k8-orhan", "Baba"],
  ["k9-deniz", "k7-kemal", "Dede"],
  ["k9-deniz", "k6-naz", "Büyük nine"],
  ["k9-deniz", "k9-cem", "Erkek kardeş"],
  ["k9-deniz", "k9-pinar", "Kız kardeş"],
  ["k10-poyraz", "k8-orhan", "Dede"],
  ["k10-poyraz", "k9-cem", "Amca"],
  ["k10-poyraz", "k9-selin", "Hala"],
  ["k8-orhan", "k10-poyraz", "Torun"],
  ["k9-deniz", "k8-orhan-es2", "Baba eşi"],
  ["k6-mehmet", "k6-naz", "Eş"],
  ["k9-cem", "k9-cem-es1", "Eski eş"],
  ["k11-lina", "k7-kemal", "Büyük büyük dede"],
];
for (const [a,b,bekl] of cases) {
  const got = rel(a,b);
  got === bekl ? ok++ : (fail++, console.log(`✗ ${a}→${b}: bekl "${bekl}", geldi "${got}"`));
}

console.log(`\n${ok}/${ok+fail} geçti${fail?`, ${fail} başarısız`:" ✓"}`);
