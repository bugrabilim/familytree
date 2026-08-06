import type { Person } from "@/types/family";
import { nanoid } from "nanoid";

const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

function dateToGedcom(date?: string): string {
  if (!date) return "";
  const parts = date.split("-");
  if (parts.length === 1) return parts[0];
  const [y, m, d] = parts;
  const month = MONTHS[parseInt(m, 10) - 1];
  if (!month) return y;
  const day = parseInt(d, 10);
  return day ? `${day} ${month} ${y}` : `${month} ${y}`;
}

function gedcomToDate(gedDate: string): string | undefined {
  if (!gedDate) return undefined;
  const s = gedDate.trim().toUpperCase().replace(/^(ABT|BEF|AFT|EST|CAL|INT|FROM|TO)\s+/, "");
  if (/^\d{4}$/.test(s)) return s;
  const dm = s.match(/^(\d{1,2})\s+([A-Z]{3})\s+(\d{4})$/);
  if (dm) {
    const mi = MONTHS.indexOf(dm[2]);
    if (mi >= 0) return `${dm[3]}-${String(mi + 1).padStart(2, "0")}-${String(parseInt(dm[1])).padStart(2, "0")}`;
  }
  const mm = s.match(/^([A-Z]{3})\s+(\d{4})$/);
  if (mm) {
    const mi = MONTHS.indexOf(mm[1]);
    if (mi >= 0) return `${mm[2]}-${String(mi + 1).padStart(2, "0")}`;
  }
  return undefined;
}

export function exportGedcom(people: Person[]): string {
  const lines: string[] = [];

  lines.push("0 HEAD");
  lines.push("1 SOUR FAMILY-TREE-APP");
  lines.push("2 VERS 1.0");
  lines.push("2 NAME Soy Ağacı");
  lines.push("1 GEDC");
  lines.push("2 VERS 5.5.1");
  lines.push("2 FORM LINEAGE-LINKED");
  lines.push("1 CHAR UTF-8");

  const idToGed = new Map<string, string>();
  people.forEach((p, i) => idToGed.set(p.id, `@I${String(i + 1).padStart(4, "0")}@`));

  for (const p of people) {
    lines.push(`0 ${idToGed.get(p.id)} INDI`);
    lines.push(`1 NAME ${p.firstName} /${p.lastName}/`);
    if (p.gender === "male") lines.push("1 SEX M");
    else if (p.gender === "female") lines.push("1 SEX F");

    const bd = dateToGedcom(p.birthDate);
    if (bd || p.birthPlace) {
      lines.push("1 BIRT");
      if (bd) lines.push(`2 DATE ${bd}`);
      if (p.birthPlace) lines.push(`2 PLAC ${p.birthPlace}`);
    }

    const dd = dateToGedcom(p.deathDate);
    if (dd) {
      lines.push("1 DEAT Y");
      lines.push(`2 DATE ${dd}`);
    }

    if (p.bio) {
      const bioLines = p.bio.split("\n");
      lines.push(`1 NOTE ${bioLines[0]}`);
      for (let i = 1; i < bioLines.length; i++) {
        lines.push(`2 CONT ${bioLines[i]}`);
      }
    }
  }

  type FamRec = { husb?: string; wife?: string; children: string[] };
  const fams: FamRec[] = [];
  const famLookup = new Map<string, number>();

  function getOrCreateFam(husb: string | undefined, wife: string | undefined): number {
    const key = `${husb ?? ""}|${wife ?? ""}`;
    if (famLookup.has(key)) return famLookup.get(key)!;
    const idx = fams.length;
    fams.push({ husb, wife, children: [] });
    famLookup.set(key, idx);
    return idx;
  }

  // Pass 1: FAM records from spouse pairs
  const spouseSeen = new Set<string>();
  for (const p of people) {
    for (const spouseId of p.spouseIds) {
      const pairKey = [p.id, spouseId].sort().join("|");
      if (spouseSeen.has(pairKey)) continue;
      spouseSeen.add(pairKey);
      const sp = people.find((x) => x.id === spouseId);
      let husb: string, wife: string;
      if (p.gender === "female") { wife = p.id; husb = spouseId; }
      else if (sp?.gender === "female") { husb = p.id; wife = spouseId; }
      else { husb = p.id; wife = spouseId; }
      getOrCreateFam(husb, wife);
    }
  }

  // Pass 2: Assign children to FAMs
  for (const p of people) {
    if (p.parentIds.length === 0) continue;
    const [p1id, p2id] = p.parentIds;
    const p1 = people.find((x) => x.id === p1id);
    const p2 = p2id ? people.find((x) => x.id === p2id) : undefined;

    let husb: string | undefined, wife: string | undefined;
    if (p2) {
      if (p1?.gender === "female") { wife = p1id; husb = p2id; }
      else if (p2?.gender === "female") { husb = p1id; wife = p2id; }
      else { husb = p1id; wife = p2id; }
    } else {
      if (p1?.gender === "female") wife = p1id;
      else husb = p1id;
    }

    let fi = famLookup.get(`${husb ?? ""}|${wife ?? ""}`);
    if (fi === undefined && p2) fi = famLookup.get(`${wife ?? ""}|${husb ?? ""}`);
    if (fi === undefined) fi = getOrCreateFam(husb, wife);

    fams[fi].children.push(p.id);
  }

  fams.forEach((fam, i) => {
    lines.push(`0 @F${String(i + 1).padStart(4, "0")}@ FAM`);
    if (fam.husb && idToGed.has(fam.husb)) lines.push(`1 HUSB ${idToGed.get(fam.husb)}`);
    if (fam.wife && idToGed.has(fam.wife)) lines.push(`1 WIFE ${idToGed.get(fam.wife)}`);
    for (const cid of fam.children) {
      if (idToGed.has(cid)) lines.push(`1 CHIL ${idToGed.get(cid)}`);
    }
  });

  lines.push("0 TRLR");
  return lines.join("\r\n");
}

export function importGedcom(content: string): Person[] {
  interface GedIndi {
    gedId: string;
    ourId: string;
    firstName: string;
    lastName: string;
    gender: "male" | "female" | "unknown";
    birthDate?: string;
    deathDate?: string;
    birthPlace?: string;
    bio: string;
  }
  interface GedFam {
    husb?: string;
    wife?: string;
    children: string[];
  }

  const individuals = new Map<string, GedIndi>();
  const families: GedFam[] = [];

  let curIndi: GedIndi | null = null;
  let curFam: GedFam | null = null;
  let ctx: "BIRT" | "DEAT" | "NOTE" | null = null;

  const flush = () => {
    if (curIndi) { individuals.set(curIndi.gedId, curIndi); curIndi = null; }
    if (curFam) { families.push(curFam); curFam = null; }
    ctx = null;
  };

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const m = line.match(/^(\d+)\s+(?:(@[^@]+@)\s+)?(\S+)(?:\s+(.*))?$/);
    if (!m) continue;

    const level = parseInt(m[1]);
    const xref = m[2];
    const tag = m[3];
    const value = (m[4] ?? "").trim();

    if (level === 0) {
      flush();
      if (tag === "INDI" && xref) {
        curIndi = { gedId: xref, ourId: nanoid(), firstName: "", lastName: "", gender: "unknown", bio: "" };
      } else if (tag === "FAM") {
        curFam = { children: [] };
      }
      continue;
    }

    if (curIndi) {
      if (level === 1) {
        ctx = null;
        if (tag === "NAME") {
          const nm = value.match(/^(.*?)\s*\/([^/]*)\//);
          if (nm) { curIndi.firstName = nm[1].trim(); curIndi.lastName = nm[2].trim(); }
          else {
            const parts = value.trim().split(/\s+/);
            curIndi.lastName = parts.length > 1 ? (parts.pop() ?? "") : "";
            curIndi.firstName = parts.join(" ");
          }
        } else if (tag === "SEX") {
          curIndi.gender = value === "M" ? "male" : value === "F" ? "female" : "unknown";
        } else if (tag === "BIRT") { ctx = "BIRT"; }
        else if (tag === "DEAT") { ctx = "DEAT"; }
        else if (tag === "NOTE") { ctx = "NOTE"; curIndi.bio = value; }
      } else if (level === 2) {
        if (ctx === "BIRT") {
          if (tag === "DATE") curIndi.birthDate = gedcomToDate(value);
          else if (tag === "PLAC") curIndi.birthPlace = value;
        } else if (ctx === "DEAT" && tag === "DATE") {
          curIndi.deathDate = gedcomToDate(value);
        } else if (ctx === "NOTE" && (tag === "CONT" || tag === "CONC")) {
          curIndi.bio += (tag === "CONT" ? "\n" : "") + value;
        }
      }
    }

    if (curFam && level === 1) {
      if (tag === "HUSB") curFam.husb = value;
      else if (tag === "WIFE") curFam.wife = value;
      else if (tag === "CHIL") curFam.children.push(value);
    }
  }
  flush();

  const people: Person[] = [];
  for (const [, gi] of individuals) {
    people.push({
      id: gi.ourId,
      firstName: gi.firstName || "?",
      lastName: gi.lastName || "?",
      gender: gi.gender,
      birthDate: gi.birthDate,
      deathDate: gi.deathDate,
      birthPlace: gi.birthPlace,
      bio: gi.bio || undefined,
      parentIds: [],
      spouseIds: [],
    });
  }

  for (const fam of families) {
    const hi = fam.husb ? individuals.get(fam.husb) : undefined;
    const wi = fam.wife ? individuals.get(fam.wife) : undefined;
    const hp = hi ? people.find((p) => p.id === hi.ourId) : undefined;
    const wp = wi ? people.find((p) => p.id === wi.ourId) : undefined;

    if (hp && wp) {
      if (!hp.spouseIds.includes(wp.id)) hp.spouseIds.push(wp.id);
      if (!wp.spouseIds.includes(hp.id)) wp.spouseIds.push(hp.id);
    }

    for (const childGedId of fam.children) {
      const ci = individuals.get(childGedId);
      const cp = ci ? people.find((p) => p.id === ci.ourId) : undefined;
      if (!cp) continue;
      if (hp && !cp.parentIds.includes(hp.id)) cp.parentIds.push(hp.id);
      if (wp && !cp.parentIds.includes(wp.id)) cp.parentIds.push(wp.id);
      if (cp.parentIds.length > 2) cp.parentIds = cp.parentIds.slice(0, 2);
    }
  }

  return people;
}
