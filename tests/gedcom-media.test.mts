import { exportGedcom, importGedcom } from "../lib/gedcom.ts";
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

const person = (over: Partial<Person>): Person => ({
  id: over.id ?? "x",
  firstName: over.firstName ?? "Ali",
  lastName: over.lastName ?? "Veli",
  gender: over.gender ?? "male",
  parentIds: [],
  spouseIds: [],
  ...over,
});

// Dışa → içe: kapak + galeri URL'leri korunur
const p = person({
  photo: "https://res.cloudinary.com/x/a.jpg",
  photos: ["https://res.cloudinary.com/x/a.jpg", "https://res.cloudinary.com/x/b.png"],
});
const ged = exportGedcom([p]);
check("export OBJE/FILE içerir", ged.includes("1 OBJE") && ged.includes("2 FILE https://res.cloudinary.com/x/a.jpg"));
check("export FORM png", ged.includes("2 FORM png"));

const back = importGedcom(ged);
check("import: kapak korunur", back[0].photo === "https://res.cloudinary.com/x/a.jpg");
check("import: galeri 2 foto", (back[0].photos ?? []).length === 2);
check("import: yinelenen atlanır", new Set(back[0].photos).size === (back[0].photos ?? []).length);

// İşaretçi (pointer) stili OBJE — MyHeritage benzeri
const pointerGed = [
  "0 HEAD",
  "0 @I1@ INDI",
  "1 NAME Ayşe /Kaya/",
  "1 SEX F",
  "1 OBJE @M1@",
  "0 @M1@ OBJE",
  "1 FILE https://example.com/ayse.jpg",
  "2 FORM jpg",
  "0 TRLR",
].join("\n");
const people = importGedcom(pointerGed);
check("pointer OBJE çözülür", people[0]?.photo === "https://example.com/ayse.jpg");

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail) process.exit(1);
