import { describeRelation, indexPeople, computeStats, bloodDegrees } from "../lib/relations.ts";
import type { Gender, Person } from "../types/family.ts";

const P = (
  id: string,
  firstName: string,
  gender: Gender,
  parentIds: string[] = [],
  spouseIds: string[] = []
): Person => ({ id, firstName, lastName: "T", gender, parentIds, spouseIds });

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
const people: Person[] = [
  P("dedeM","Dede","male"), P("nineF","Babaanne","female",[],["dedeM"]),
  P("dedeX","DedeX","male"), P("nineY","Anneanne","female",[],["dedeX"]),
  P("babaM","Baba","male",["dedeM","nineF"],["anneF"]),
  P("halaF","Hala","female",["dedeM","nineF"]),
  P("amcaM","Amca","male",["dedeM","nineF"]),
  P("anneF","Anne","female",["dedeX","nineY"],["babaM"]),
  P("dayiM","Dayi","male",["dedeX","nineY"]),
  P("ben","Ben","male",["babaM","anneF"]),
  P("ablaF","Abla","female",["babaM","anneF"],["enisteM"]),
  P("kardesM","Kardes","male",["babaM","anneF"],["yengeF"]),
  P("oglumM","Oglum","male",["ben"]),
  P("kuzenF","Kuzen","female",["amcaM"]),
  P("yegenF","Yegen","female",["ablaF"]),
  P("esimF","Esim","female",["kayinP"],["ben"]),
  P("buyukhalaF","BuyukHala","female",["dedeM","nineF"]), // aslında hala; büyük hala testi ayrı
  // Sıhrî (evlilik yoluyla) akrabalık testleri için ek kişiler
  P("enisteM","Eniste","male",[],["ablaF"]),   // ablaF'in eşi → enişte / damat
  P("yengeF","Yenge","female",[],["kardesM"]), // kardesM'in eşi → yenge / elti
  P("kayinP","KayinP","male",[]),              // esimF'in babası → kayınpeder / dünür
  P("baldizF","Baldiz","female",["kayinP"],["bacanakM"]), // esimF'in kız kardeşi → baldız
  P("bacanakM","Bacanak","male",[],["baldizF"]),          // baldizF'in eşi → bacanak
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
  ["babaM","esimF","Gelin"],
  ["ben","ben","Kendisi"],
  // --- Sıhrî akrabalık: bakış açısına göre ayrışan terimler ---
  ["esimF","ablaF","Görümce"],        // kadının, eşinin kız kardeşi
  ["ben","baldizF","Baldız"],         // erkeğin, eşinin kız kardeşi
  ["esimF","kardesM","Kayınbirader"], // eşin erkek kardeşi
  ["ben","yengeF","Yenge"],           // erkek kardeşin eşi
  ["ben","enisteM","Enişte"],         // kız kardeşin eşi
  ["babaM","enisteM","Damat"],        // kızın eşi
  ["esimF","yengeF","Elti"],          // kocaları kardeş olan iki kadın
  ["ben","bacanakM","Bacanak"],       // eşleri kız kardeş olan iki erkek
  ["babaM","kayinP","Dünür"],         // çocuğunun eşinin ebeveyni
];

let ok = 0, fail = 0;
for (const [a,b,beklenen] of cases) {
  const got = describeRelation(a,b,people,idx);
  if (got === beklenen) { ok++; }
  else { fail++; console.log(`✗ ${a} → ${b}: bekl "${beklenen}", geldi "${got}"`); }
}
console.log(`\n${ok}/${cases.length} geçti${fail?`, ${fail} başarısız`:" ✓"}`);

// --- Kan hısımlığı dereceleri (medeni hukuk) ---
const deg = bloodDegrees("ben", people, idx);
const dcases: Array<[string, number]> = [
  ["ben", 0],       // kendisi
  ["babaM", 1],     // baba
  ["anneF", 1],     // anne
  ["oglumM", 1],    // oğul
  ["ablaF", 2],     // kardeş
  ["dedeM", 2],     // dede
  ["amcaM", 3],     // amca
  ["dayiM", 3],     // dayı
  ["kuzenF", 4],    // birinci kuzen
  ["yegenF", 3],    // kardeşin çocuğu
];
for (const [id, bekl] of dcases) {
  const got = deg.get(id);
  if (got === bekl) { ok++; }
  else { fail++; console.log(`✗ derece ben→${id}: bekl ${bekl}, geldi ${got}`); }
}
// Eş kan hısmı değildir → derecesi yok
if (deg.get("esimF") === undefined) ok++;
else { fail++; console.log(`✗ eş kan hısmı sayılmamalı, derece ${deg.get("esimF")}`); }
console.log(`derece testleri: ${dcases.length + 1} kontrol`);

const st = computeStats(people);
console.log(`istatistik: ${st.total} kişi, ${st.generations} kuşak, ${st.male}E/${st.female}K`);
