import { familyMembers, isAssociate, isMember, onlyAssociates, resolveAssociations, sanitizeAssociations } from "../lib/associates.ts";
import type { Person } from "../types/family.ts";

let ok = 0, fail = 0;
const check = (n: string, c: boolean) => { if (c) ok++; else { fail++; console.log(`✗ ${n}`); } };

const P = (id: string, extra: Partial<Person> = {}): Person => ({
  id, firstName: id, lastName: "T", gender: "male", parentIds: [], spouseIds: [], ...extra,
});

const uye = P("uye1");
const uye2 = P("uye2", { associations: [{ id: "a1", personId: "friend1", type: "arkadas", note: "askerlik" }] });
const friend1 = P("friend1", { kind: "cevre" });
const friend2 = P("friend2", { kind: "cevre", associations: [{ id: "a2", personId: "uye1", type: "komsu" }] });
const people = [uye, uye2, friend1, friend2];

check("isAssociate", isAssociate(friend1) && !isAssociate(uye));
check("isMember (belirtilmemiş = üye)", isMember(uye) && !isMember(friend1));
check("familyMembers 2 üye", familyMembers(people).length === 2);
check("onlyAssociates 2 çevre", onlyAssociates(people).length === 2);

// uye2 → friend1 (giden). resolveAssociations(uye2)
const r2 = resolveAssociations(uye2, people);
check("uye2 giden bağ friend1", r2.length === 1 && r2[0].person.id === "friend1" && !r2[0].incoming);
check("uye2 bağ tipi/not", r2[0].type === "arkadas" && r2[0].note === "askerlik");

// uye1 → friend2 (gelen, friend2'nin listesinden)
const r1 = resolveAssociations(uye, people);
check("uye1 gelen bağ friend2", r1.length === 1 && r1[0].person.id === "friend2" && r1[0].incoming);
check("uye1 gelen bağ tipi komsu", r1[0].type === "komsu");

// friend1 → gelen bağ uye2
const rf = resolveAssociations(friend1, people);
check("friend1 gelen bağ uye2", rf.length === 1 && rf[0].person.id === "uye2" && rf[0].incoming);

// sanitize: var olmayan kişiye işaret eden bağ atılır
const san = sanitizeAssociations([{ id: "x", personId: "yok", type: "arkadas" }, { id: "y", personId: "friend1", type: "komsu" }], new Set(people.map((p) => p.id)));
check("sanitize geçersizi atar", san.length === 1 && san[0].personId === "friend1");

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail) process.exit(1);
