import { describeRelation, indexPeople, computeStats } from "../lib/relations.ts";

const P = (id, firstName, gender, parentIds = [], spouseIds = []) =>
  ({ id, firstName, lastName: "T", gender, parentIds, spouseIds });

//        dedeM ── nineF                    dedeX ── nineY
//           │                                  │
//     ┌─────┴─────┬────────┐              ┌────┴────┐
//   babaM      halaF     amcaM          anneF    dayiM
//     └──── evli ── anneF ────┘
//              │
//        ┌─────┴─────┐
//       ben        ablaF
//        │
//     oglumM
const people = [
  P("dedeM","Dede","male"), P("nineF","Babaanne","female",[],["dedeM"]),
  P("dedeX","DedeX","male"), P("nineY","Anneanne","female",[],["dedeX"]),
  P("babaM","Baba","male",["dedeM","nineF"],["anneF"]),
  P("halaF","Hala","female",["dedeM","nineF"]),
  P("amcaM","Amca","male",["dedeM","nineF"]),
  P("anneF","Anne","female",["dedeX","nineY"],["babaM"]),
  P("dayiM","Dayi","male",["dedeX","nineY"]),
  P("ben","Ben","male",["babaM","anneF"]),
  P("ablaF","Abla","female",["babaM","anneF"]),
  P("oglumM","Oglum","male",["ben"]),
  P("kuzenF","Kuzen","female",["amcaM"]),
  P("yegenF","Yegen","female",["ablaF"]),
  P("esimF","Esim","female",[],["ben"]),
  P("buyukhalaF","BuyukHala","female",["dedeM","nineF"]), // aslında hala; büyük hala testi ayrı
];
// oglum'un gözünden hala → büyük hala olmalı
const idx = indexPeople(people);

const cases: Array<[string,string,string]> = [
  ["ben","babaM","Baba"], ["ben","anneF","Anne"],
  ["ben","ablaF","Kız kardeş"], ["ben","oglumM","Oğul"],
  ["ben","dedeM","Dede"], ["ben","nineF","Babaanne"], ["ben","nineY","Anneanne"],
  ["ben","amcaM","Amca"], ["ben","halaF","Hala"], ["ben","dayiM","Dayı"],
  ["ben","kuzenF","Kuzen"], ["ben","yegenF","Yeğen"], ["ben","esimF","Eş"],
  ["oglumM","ben","Baba"], ["oglumM","babaM","Dede"], ["oglumM","nineF","Büyük nine"],
  ["oglumM","halaF","Büyük hala"], ["oglumM","amcaM","Büyük amca"],
  ["oglumM","dayiM","Büyük dayı"],
  ["dedeM","oglumM","Torun çocuğu"], ["dedeM","ben","Torun"],
  ["esimF","babaM","Kayınpeder"], ["esimF","anneF","Kayınvalide"],
  ["esimF","ablaF","Baldız / Görümce"],
  ["babaM","esimF","Gelin"],
  ["ben","ben","Kendisi"],
];

let ok = 0, fail = 0;
for (const [a,b,beklenen] of cases) {
  const got = describeRelation(a,b,people,idx);
  if (got === beklenen) { ok++; }
  else { fail++; console.log(`✗ ${a} → ${b}: bekl "${beklenen}", geldi "${got}"`); }
}
console.log(`\n${ok}/${cases.length} geçti${fail?`, ${fail} başarısız`:" ✓"}`);

const st = computeStats(people);
console.log(`istatistik: ${st.total} kişi, ${st.generations} kuşak, ${st.male}E/${st.female}K`);
