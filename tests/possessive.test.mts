import { possessive } from "../lib/relations.ts";
const cases: Array<[string,string]> = [
  ["baba","babası"], ["anne","annesi"], ["dede","dedesi"], ["nine","ninesi"],
  ["kız","kızı"], ["oğul","oğlu"], ["çocuk","çocuğu"], ["eş","eşi"],
  ["kız kardeş","kız kardeşi"], ["erkek kardeş","erkek kardeşi"],
  ["amca","amcası"], ["dayı","dayısı"], ["hala","halası"], ["teyze","teyzesi"],
  ["kuzen","kuzeni"], ["yeğen","yeğeni"], ["torun","torunu"],
  ["gelin","gelini"], ["damat","damadı"], ["yenge","yengesi"], ["enişte","eniştesi"],
  ["babaanne","babaannesi"], ["anneanne","anneannesi"],
  ["kayınvalide","kayınvalidesi"], ["kayınpeder","kayınpederi"], ["kayınbirader","kayınbiraderi"],
  ["büyük dede","büyük dedesi"], ["büyük hala","büyük halası"], ["büyük nine","büyük ninesi"],
  ["torun çocuğu","torun çocuğu"], ["ebeveyn","ebeveyni"],
  ["amca / dayı","amcası / dayısı"], ["hala / teyze","halası / teyzesi"],
  ["baldız / görümce","baldızı / görümcesi"],
];
let ok=0,fail=0;
for (const [g, b] of cases) {
  const r = possessive(g);
  if (r === b) ok++;
  else { fail++; console.log(`✗ "${g}" → bekl "${b}", geldi "${r}"`); }
}
console.log(`\n${ok}/${cases.length} geçti${fail?`, ${fail} başarısız`:" ✓"}`);
