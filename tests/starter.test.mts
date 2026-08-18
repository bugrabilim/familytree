import { buildStarterTree, STARTER_ROLES } from "../lib/starter.ts";

let ok = 0, fail = 0;
const check = (n: string, c: boolean) => { if (c) ok++; else { fail++; console.log(`✗ ${n}`); } };

const p = buildStarterTree();
const by = (role: string) => p.find((x) => x.placeholder === role)!;

check("7 kişi", p.length === 7);
check("tüm roller var", STARTER_ROLES.every((r) => !!by(r)));
check("adlar boş", p.every((x) => x.firstName === "" && x.lastName === ""));
check("benzersiz id", new Set(p.map((x) => x.id)).size === 7);

// Cinsiyetler
check("baba erkek, anne kadın", by("father").gender === "male" && by("mother").gender === "female");
check("dedeler erkek", by("fatherFather").gender === "male" && by("motherFather").gender === "male");
check("nineler kadın", by("fatherMother").gender === "female" && by("motherMother").gender === "female");
check("kendisi bilinmiyor", by("self").gender === "unknown");

// İlişkiler
const self = by("self");
check("kendisinin ebeveyni anne+baba",
  self.parentIds.length === 2 &&
  self.parentIds.includes(by("father").id) &&
  self.parentIds.includes(by("mother").id));
check("babanın ebeveyni baba tarafı büyükler",
  by("father").parentIds.includes(by("fatherFather").id) &&
  by("father").parentIds.includes(by("fatherMother").id));
check("annenin ebeveyni anne tarafı büyükler",
  by("mother").parentIds.includes(by("motherFather").id) &&
  by("mother").parentIds.includes(by("motherMother").id));
check("anne-baba eş", by("father").spouseIds.includes(by("mother").id) && by("mother").spouseIds.includes(by("father").id));
check("büyükler eş",
  by("fatherFather").spouseIds.includes(by("fatherMother").id) &&
  by("motherMother").spouseIds.includes(by("motherFather").id));
check("büyüklerin ebeveyni yok", by("fatherFather").parentIds.length === 0 && by("motherMother").parentIds.length === 0);
check("her çağrı yeni id üretir", buildStarterTree()[0].id !== p[0].id);

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail) process.exit(1);
