import { graftFromPeer, ancestorClosure, mergeTree } from "../lib/graft.ts";
import type { Person } from "../types/family.ts";

let ok = 0,
  fail = 0;
const check = (name: string, cond: boolean) => {
  if (cond) ok++;
  else {
    fail++;
    console.log(`✗ ${name}`);
  }
};

const P = (o: Partial<Person> & { id: string }): Person => ({
  firstName: "X",
  lastName: "Y",
  gender: "unknown",
  parentIds: [],
  spouseIds: [],
  ...o,
});

// Peer: torun(gc) → baba(f) → dede(gf)
const peer = [
  P({ id: "gc", firstName: "Torun", birthDate: "2000", parentIds: ["f"] }),
  P({ id: "f", firstName: "Baba", birthDate: "1970", parentIds: ["gf"] }),
  P({ id: "gf", firstName: "Dede", birthDate: "1940" }),
];

// Kapanış
check("ata kapanışı", [...ancestorClosure(peer, "gc")].sort().join() === "f,gc,gf");

// Benim ağacımda "Torun" (aynı ad+yıl) var, ataları yok → aşıla
const mine = [P({ id: "mine1", firstName: "Torun", birthDate: "2000" })];
const g = graftFromPeer(mine, peer, "gc");
check("2 ata eklendi", g.added === 2); // Baba + Dede
check("eşleşen torun yeniden kullanıldı", g.linked === 1);
const torun = g.people.find((p) => p.id === "mine1")!;
check("toruna baba bağlandı", torun.parentIds.length === 1);
const babaId = torun.parentIds[0];
const baba = g.people.find((p) => p.id === babaId)!;
check("baba eklendi (yeni id)", baba && baba.firstName === "Baba" && baba.id !== "f");
check("babanın dedesi eklendi", baba.parentIds.length === 1 && g.people.find((p) => p.id === baba.parentIds[0])?.firstName === "Dede");

// Kaynak değişmedi
check("mine orijinali değişmedi", mine.length === 1);

// Hiç eşleşme yoksa: kök + atalar tümü klonlanır
const empty: Person[] = [];
const g2 = graftFromPeer(empty, peer, "gc");
check("boş ağaca 3 kişi", g2.added === 3 && g2.people.length === 3);

// mergeTree: tüm peer ağacı; kesişimde dedup
const mineFull = [P({ id: "m1", firstName: "Dede", birthDate: "1940" })]; // Dede zaten bende
const mt = mergeTree(mineFull, peer);
check("mergeTree: Dede yeniden kullanıldı", mt.linked >= 1);
check("mergeTree: Torun + Baba eklendi (Dede hariç)", mt.added === 2);
check("mergeTree: toplam 3 kişi", mt.people.length === 3);
const babaM = mt.people.find((p) => p.firstName === "Baba")!;
check("mergeTree: babanın dedesi mevcut m1'e bağlandı", babaM.parentIds.includes("m1"));

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail) process.exit(1);
