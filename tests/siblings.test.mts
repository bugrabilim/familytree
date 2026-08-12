import { compareSiblings, sameParentSet, siblingGroup, moveInList } from "../lib/siblings.ts";
import type { Person } from "../types/family.ts";

let ok = 0, fail = 0;
const check = (ad: string, kosul: boolean, detay = "") =>
  kosul ? ok++ : (fail++, console.log(`✗ ${ad} ${detay}`));

const P = (over: Partial<Person>): Person => ({
  id: "x", firstName: "A", lastName: "B", gender: "male", parentIds: [], spouseIds: [], ...over,
});

// compareSiblings: açık sıra > doğum > ad
const a = P({ id: "a", firstName: "Ali", birthDate: "1950", siblingOrder: 2 });
const b = P({ id: "b", firstName: "Beste", birthDate: "1940", siblingOrder: 1 });
check("açık sıra önce gelir", compareSiblings(a, b) > 0);
const c = P({ id: "c", birthDate: "1930" });
const d = P({ id: "d", birthDate: "1935" });
check("sırasız → doğuma göre", compareSiblings(c, d) < 0);
const e = P({ id: "e", firstName: "Ahmet" });
const f = P({ id: "f", firstName: "Zeynep" });
check("tarihsiz → ada göre", compareSiblings(e, f) < 0);
check("açıklı sırasızdan önce", compareSiblings(P({ siblingOrder: 5 }), P({})) < 0);

// sameParentSet
const s1 = P({ id: "s1", parentIds: ["m", "n"] });
const s2 = P({ id: "s2", parentIds: ["n", "m"] });   // sıra farklı, aynı küme
const s3 = P({ id: "s3", parentIds: ["m"] });         // farklı küme
const root = P({ id: "r", parentIds: [] });
check("aynı ebeveyn kümesi (sırasız)", sameParentSet(s1, s2));
check("farklı ebeveyn kümesi", !sameParentSet(s1, s3));
check("köksüz kardeş değil", !sameParentSet(root, P({ parentIds: [] })));

// siblingGroup
const people: Person[] = [
  P({ id: "k1", parentIds: ["m", "n"], birthDate: "1970", siblingOrder: 1 }),
  P({ id: "k2", parentIds: ["m", "n"], birthDate: "1968" }),
  P({ id: "k3", parentIds: ["m", "n"], birthDate: "1972", siblingOrder: 0 }),
  P({ id: "x9", parentIds: ["p", "q"], birthDate: "1970" }),
];
const grp = siblingGroup(people[0], people);
check("kardeş grubu yalnız aynı ebeveynler", grp.length === 3);
check("grup görüntü sırasına göre", grp.map((p) => p.id).join(",") === "k3,k1,k2", grp.map((p) => p.id).join(","));

// moveInList
check("yukarı taşı", moveInList(["a", "b", "c"], "b", -1).join(",") === "b,a,c");
check("aşağı taşı", moveInList(["a", "b", "c"], "b", 1).join(",") === "a,c,b");
check("üst sınırda değişmez", moveInList(["a", "b"], "a", -1).join(",") === "a,b");
check("alt sınırda değişmez", moveInList(["a", "b"], "b", 1).join(",") === "a,b");

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
