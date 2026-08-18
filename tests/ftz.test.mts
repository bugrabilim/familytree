import { parseFttText } from "../lib/ftz.ts";

let ok = 0,
  fail = 0;
const check = (name: string, cond: boolean) => {
  if (cond) ok++;
  else {
    fail++;
    console.log(`✗ ${name}`);
  }
};

// Gerçek node.ftt yapısını taklit eden küçük örnek (TAB ayraçlı).
// Kişi = 29 sütun, evlilik = 12 sütun. Alan indeksleri lib/ftz.ts ile aynı.
const P = (id: string, pu: string, order: string, surname: string, name: string,
  by: string, bm: string, bd: string, dy: string, dm: string, dd: string, gender: string,
  nick = "", note = "") =>
  [id, "0", pu, order, "0", "0", "0", "0", "0", "0", "0", "0", surname, name, "", "",
   "128", by, bm, bd, "128", dy, dm, dd, gender, nick, "", "", note].join("\t");
const U = (id: string, divorced: string, husband: string, wife: string) =>
  [id, divorced, husband, "0", wife, "0", "0", "0", "0", "0", "0", "0"].join("\t");

const text = "﻿" + [
  "5\t2\t100",
  // Erdal (baba) & Kadriye (anne) -> evlilik 900
  P("100", "0", "0", "Bilim", "Erdal", "1952", "7", "4", "0", "0", "0", "1"),
  P("101", "0", "0", "Yilmaz", "Kadriye", "1962", "8", "13", "0", "0", "0", "2"),
  // Bugra & Cagatay: 900'ün çocukları
  P("102", "900", "0", "Bilim", "Bugra", "1984", "4", "6", "0", "0", "0", "1", "Cakir"),
  P("103", "900", "1", "Bilim", "Cagatay", "1988", "0", "0", "0", "0", "0", "1"),
  // Vefat etmiş, yıl-only doğum, boşanmış eş bağı için
  P("104", "0", "0", "Molo", "Orhan", "1950", "0", "0", "2023", "0", "0", "1", "", "Dogum: manastir"),
  U("900", "0", "100", "101"), // Erdal-Kadriye evli
  U("901", "1", "104", "101"), // Orhan-Kadriye boşanmış (eski eş)
].join("\n");

const people = parseFttText(text);
const by = (n: string) => people.find((p) => p.firstName === n)!;

check("5 kişi", people.length === 5);
check("ad+soyad", by("Erdal").lastName === "Bilim" && by("Kadriye").lastName === "Yilmaz");
check("cinsiyet", by("Erdal").gender === "male" && by("Kadriye").gender === "female");
check("tam tarih", by("Bugra").birthDate === "1984-04-06");
check("yıl-only tarih", by("Cagatay").birthDate === "1988");
check("ölüm tarihi", by("Orhan").deathDate === "2023");
check("yaşayan (ölüm yok)", by("Erdal").deathDate === undefined);
check("lakap", by("Bugra").nickname === "Cakir");
check("not/bio", by("Orhan").bio === "Dogum: manastir");

// İlişkiler
const bugra = by("Bugra");
const parentNames = bugra.parentIds.map((id) => people.find((p) => p.id === id)!.firstName).sort();
check("Bugra ebeveynleri Erdal+Kadriye", parentNames.join(",") === "Erdal,Kadriye");
check("Cagatay da aynı ebeveynler", by("Cagatay").parentIds.length === 2);
check("Erdal-Kadriye eş", by("Erdal").spouseIds.includes(by("Kadriye").id));
check("boşanan eski eş (Kadriye↔Orhan)",
  (by("Kadriye").formerSpouseIds ?? []).includes(by("Orhan").id) &&
  (by("Orhan").formerSpouseIds ?? []).includes(by("Kadriye").id));
check("boşanan güncel eş değil", !by("Orhan").spouseIds.includes(by("Kadriye").id));
check("kök kişi ebeveynsiz", by("Erdal").parentIds.length === 0);

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail) process.exit(1);
