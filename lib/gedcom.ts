import type { LifeEvent, Person } from "@/types/family";
import { nanoid } from "nanoid";

const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

/**
 * GEDCOM 7'de `FORM` bir uzantı değil IANA medya TÜRÜ ister ("image/jpeg"),
 * 5.5.1'de ise uzantı ("jpg"). Aynı URL iki biçimde farklı yazılır.
 */
const MEDIA_TYPES: Readonly<Record<string, string>> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  tif: "image/tiff",
  tiff: "image/tiff",
  bmp: "image/bmp",
  pdf: "application/pdf",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  ogg: "audio/ogg",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};

/** Uzantıdan IANA medya türü; bilinmiyorsa genel ikili tür. */
function mediaType(url: string): string {
  return MEDIA_TYPES[mediaForm(url).toLowerCase()] ?? "application/octet-stream";
}

/** URL'den GEDCOM medya biçimi (uzantı); belirsizse "jpg". */
function mediaForm(url: string): string {
  const m = url.match(/\.(jpe?g|png|gif|webp|bmp|tiff?)(?:$|[?#])/i);
  return m ? m[1].toLowerCase().replace("jpeg", "jpg") : "jpg";
}

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

export type GedcomVersion = "5.5.1" | "7.0";

/**
 * GEDCOM dışa aktarımı. VARSAYILAN 5.5.1'dir ve öyle kalır: alandaki
 * programların çoğu hâlâ onu okuyor, 7.0'ı okumayan bir programa 7.0 vermek
 * kullanıcıyı boşta bırakır.
 *
 * 7.0'ın 5.5.1'den ayrıldığı, burada karşılığı olan yerler:
 * · Başlık: `CHAR` kaldırıldı (7.0 her zaman UTF-8), `GEDC.FORM` artık
 *   gerekmiyor (yalnız geriye dönük uyumluluk için hoş görülüyor).
 * · Medya: 5.5.1'de INDI altında satır içi `OBJE/FILE` yazılır; 7.0'da OBJE
 *   üst düzey bir KAYITTIR ve INDI ona işaretçiyle bağlanır.
 * · `FORM`: 5.5.1'de uzantı ("jpg"), 7.0'da IANA medya türü ("image/jpeg").
 * · `PEDI`: 7.0'da BÜYÜK harf ve küme ADOPTED/BIRTH/FOSTER/SEALING/OTHER.
 */
export function exportGedcom(
  people: Person[],
  opts: { version?: GedcomVersion } = {}
): string {
  const v7 = opts.version === "7.0";
  const lines: string[] = [];

  lines.push("0 HEAD");
  lines.push("1 SOUR FAMILY-TREE-APP");
  lines.push("2 VERS 1.0");
  lines.push("2 NAME Soy Ağacı");
  lines.push("1 GEDC");
  lines.push(`2 VERS ${v7 ? "7.0" : "5.5.1"}`);
  if (!v7) {
    lines.push("2 FORM LINEAGE-LINKED");
    lines.push("1 CHAR UTF-8");
  }

  const idToGed = new Map<string, string>();
  people.forEach((p, i) => idToGed.set(p.id, `@I${String(i + 1).padStart(4, "0")}@`));

  type FamRec = { husb?: string; wife?: string; children: string[]; divorced?: boolean };
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

  function markDivorced(husb: string | undefined, wife: string | undefined) {
    const i = famLookup.get(`${husb ?? ""}|${wife ?? ""}`);
    if (i !== undefined) fams[i].divorced = true;
  }

  // Pass 1: FAM records from spouse pairs (current + divorced)
  const spouseSeen = new Set<string>();
  for (const p of people) {
    const esler: Array<[string, boolean]> = [
      ...p.spouseIds.map((id) => [id, false] as [string, boolean]),
      ...(p.formerSpouseIds ?? []).map((id) => [id, true] as [string, boolean]),
    ];
    for (const [spouseId, bosanmis] of esler) {
      const pairKey = [p.id, spouseId].sort().join("|");
      if (spouseSeen.has(pairKey)) continue;
      spouseSeen.add(pairKey);
      const sp = people.find((x) => x.id === spouseId);
      let husb: string, wife: string;
      if (p.gender === "female") { wife = p.id; husb = spouseId; }
      else if (sp?.gender === "female") { husb = p.id; wife = spouseId; }
      else { husb = p.id; wife = spouseId; }
      getOrCreateFam(husb, wife);
      if (bosanmis) markDivorced(husb, wife);
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

  const famXref = (i: number) => `@F${String(i + 1).padStart(4, "0")}@`;

  /* Kişi → ait olduğu aileler */
  const cocukAile = new Map<string, number>();   // çocuk olarak
  const esAile = new Map<string, number[]>();    // eş olarak
  fams.forEach((fam, i) => {
    for (const cid of fam.children) cocukAile.set(cid, i);
    for (const sid of [fam.husb, fam.wife]) {
      if (!sid) continue;
      const arr = esAile.get(sid);
      if (arr) arr.push(i);
      else esAile.set(sid, [i]);
    }
  });

  /** 7.0 için: medya URL'si → üst düzey OBJE kaydının xref'i. */
  const objeXref = new Map<string, string>();

  /* ---- INDI kayıtları ---- */
  for (const p of people) {
    lines.push(`0 ${idToGed.get(p.id)} INDI`);
    lines.push(`1 NAME ${p.firstName} /${p.lastName}/`);
    if (p.gender === "male") lines.push("1 SEX M");
    else if (p.gender === "female") lines.push("1 SEX F");
    else if (p.gender === "other") lines.push("1 SEX X");

    const bd = dateToGedcom(p.birthDate);
    if (bd || p.birthPlace) {
      lines.push("1 BIRT");
      if (bd) lines.push(`2 DATE ${bd}`);
      if (p.birthPlace) lines.push(`2 PLAC ${p.birthPlace}`);
    }

    const dd = dateToGedcom(p.deathDate);
    if (p.deathDate || p.deathCause) {
      lines.push("1 DEAT Y");
      if (dd) lines.push(`2 DATE ${dd}`);
      if (p.deathCause) lines.push(`2 CAUS ${p.deathCause}`);
    }

    if (p.occupation) lines.push(`1 OCCU ${p.occupation}`);
    if (p.education) lines.push(`1 EDUC ${p.education}`);

    // Fotoğraflar — kapak + galeri, URL olarak taşınır (GEDCOM medyayı gömmez;
    // MyHeritage vb. `OBJE/FILE` URL'lerini okur). Yinelenenler atlanır.
    const media: string[] = [];
    for (const url of [p.photo, ...(p.photos ?? [])]) {
      if (url && !media.includes(url)) media.push(url);
    }
    for (const url of media) {
      if (v7) {
        // 7.0: OBJE üst düzey bir kayıt; INDI yalnız işaretçi tutar. Aynı URL
        // birden çok kişide geçebilir, tek kayıt paylaşılır.
        let x = objeXref.get(url);
        if (!x) {
          x = `@O${String(objeXref.size + 1).padStart(4, "0")}@`;
          objeXref.set(url, x);
        }
        lines.push(`1 OBJE ${x}`);
      } else {
        lines.push("1 OBJE");
        lines.push(`2 FILE ${url}`);
        lines.push(`2 FORM ${mediaForm(url)}`);
      }
    }

    if (p.bio) {
      const bioLines = p.bio.split("\n");
      lines.push(`1 NOTE ${bioLines[0]}`);
      for (let i = 1; i < bioLines.length; i++) {
        lines.push(`2 CONT ${bioLines[i]}`);
      }
    }

    // Yaşam olayları — genel EVEN blokları. Başlık NOTE'un ilk satırında,
    // varsa serbest not sonraki CONT satırlarında.
    for (const ev of p.events ?? []) {
      lines.push("1 EVEN");
      lines.push(`2 TYPE ${ev.type}`);
      const ed = dateToGedcom(ev.date);
      if (ed) lines.push(`2 DATE ${ed}`);
      if (ev.place) lines.push(`2 PLAC ${ev.place}`);
      if (ev.title || ev.note) {
        lines.push(`2 NOTE ${ev.title ?? ""}`);
        if (ev.note) {
          for (const nl of ev.note.split("\n")) lines.push(`3 CONT ${nl}`);
        }
      }
    }
    // Ait olduğu aileler — evlat edinme burada PEDI ile belirtilir
    const ci = cocukAile.get(p.id);
    if (ci !== undefined) {
      lines.push(`1 FAMC ${famXref(ci)}`);
      const kinds = p.parentIds
        .map((pid) => p.parentLinks?.[pid]?.kind)
        .filter((k): k is NonNullable<typeof k> => !!k && k !== "biological");
      if (kinds.length > 0) {
        const kind = kinds[0];
        if (v7) {
          // 7.0 kümesi: ADOPTED / BIRTH / FOSTER / SEALING / OTHER (BÜYÜK harf).
          // "Üvey" standart bir değer değil; OTHER + PHRASE ile taşınır.
          if (kind === "adoptive") lines.push("2 PEDI ADOPTED");
          else if (kind === "foster") lines.push("2 PEDI FOSTER");
          else {
            lines.push("2 PEDI OTHER");
            lines.push("3 PHRASE step");
          }
        } else if (kind === "adoptive") {
          lines.push("2 PEDI adopted");
        } else if (kind === "foster") {
          lines.push("2 PEDI foster");
        } else {
          /*
           * 5.5.1'in PEDI kümesi de adopted/birth/foster/sealing'dir; "step"
           * ONDA DA yok. Buraya yıllardır `2 PEDI step` yazılıyordu, yani
           * ürettiğimiz dosya geçersizdi. Standart dışı değeri standart bir
           * etikete yazmak yerine satıcı uzantısına (alt çizgi) taşındı;
           * bilgi kaybolmuyor, dosya da geçerli kalıyor.
           */
          lines.push("2 _PEDI step");
        }
      }
    }
    for (const fi of esAile.get(p.id) ?? []) lines.push(`1 FAMS ${famXref(fi)}`);
  }

  /* ---- FAM kayıtları ---- */
  fams.forEach((fam, i) => {
    lines.push(`0 ${famXref(i)} FAM`);
    if (fam.husb && idToGed.has(fam.husb)) lines.push(`1 HUSB ${idToGed.get(fam.husb)}`);
    if (fam.wife && idToGed.has(fam.wife)) lines.push(`1 WIFE ${idToGed.get(fam.wife)}`);
    for (const cid of fam.children) {
      if (idToGed.has(cid)) lines.push(`1 CHIL ${idToGed.get(cid)}`);
    }
    if (fam.divorced) lines.push("1 DIV Y");
  });

  // 7.0: medya kayıtları en sonda, TRLR'den önce.
  for (const [url, xref] of objeXref) {
    lines.push(`0 ${xref} OBJE`);
    lines.push("1 FILE " + url);
    lines.push(`2 FORM ${mediaType(url)}`);
  }

  lines.push("0 TRLR");
  return lines.join("\r\n");
}

export function importGedcom(content: string): Person[] {
  interface GedIndi {
    gedId: string;
    ourId: string;
    firstName: string;
    lastName: string;
    gender: Person["gender"];
    birthDate?: string;
    deathDate?: string;
    deathCause?: string;
    birthPlace?: string;
    occupation?: string;
    education?: string;
    bio: string;
    events: Array<{ type: string; date?: string; title: string; place?: string; note: string }>;
    photos: string[];
    mediaRefs: string[];
  }
  interface GedFam {
    husb?: string;
    wife?: string;
    children: string[];
    divorced?: boolean;
  }
  /** `PEDI OTHER` görülüp PHRASE'i beklenen kişiler. */
  const pediOther = new Set<string>();
  /** gedId → ebeveyn bağı türü (FAMC/PEDI'den) */
  const pedigree = new Map<string, "adoptive" | "foster" | "step">();

  const individuals = new Map<string, GedIndi>();
  const families: GedFam[] = [];
  /** Üst-düzey `0 @M@ OBJE` kayıtları: gedId → dosya URL'i (işaretçi çözümü). */
  const mediaRecords = new Map<string, string>();

  let curIndi: GedIndi | null = null;
  let curFam: GedFam | null = null;
  let curObje: { gedId: string; file: string } | null = null;
  let ctx: "BIRT" | "DEAT" | "NOTE" | "FAMC" | "EVEN" | "OBJE" | null = null;
  // EVEN bloğunda işlenen olay ve NOTE alt-bağlamı (level 3 CONT için)
  let curEvent: GedIndi["events"][number] | null = null;
  let inEvenNote = false;

  const flush = () => {
    if (curIndi) { individuals.set(curIndi.gedId, curIndi); curIndi = null; }
    if (curFam) { families.push(curFam); curFam = null; }
    if (curObje) { if (curObje.file) mediaRecords.set(curObje.gedId, curObje.file); curObje = null; }
    ctx = null;
    curEvent = null;
    inEvenNote = false;
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
        curIndi = { gedId: xref, ourId: nanoid(), firstName: "", lastName: "", gender: "unknown", bio: "", events: [], photos: [], mediaRefs: [] };
      } else if (tag === "FAM") {
        curFam = { children: [] };
      } else if (tag === "OBJE" && xref) {
        curObje = { gedId: xref, file: "" };
      }
      continue;
    }

    if (curIndi) {
      if (level === 1) {
        ctx = null;
        curEvent = null;
        inEvenNote = false;
        if (tag === "EVEN") {
          ctx = "EVEN";
          curEvent = { type: "diger", title: "", note: "" };
          curIndi.events.push(curEvent);
        } else if (tag === "NAME") {
          const nm = value.match(/^(.*?)\s*\/([^/]*)\//);
          if (nm) { curIndi.firstName = nm[1].trim(); curIndi.lastName = nm[2].trim(); }
          else {
            const parts = value.trim().split(/\s+/);
            curIndi.lastName = parts.length > 1 ? (parts.pop() ?? "") : "";
            curIndi.firstName = parts.join(" ");
          }
        } else if (tag === "SEX") {
          curIndi.gender =
            value === "M" ? "male" : value === "F" ? "female" : value === "X" ? "other" : "unknown";
        } else if (tag === "FAMC") { ctx = "FAMC"; }
        else if (tag === "BIRT") { ctx = "BIRT"; }
        else if (tag === "DEAT") { ctx = "DEAT"; }
        else if (tag === "OCCU") { ctx = null; curIndi.occupation = value || undefined; }
        else if (tag === "EDUC") { ctx = null; curIndi.education = value || undefined; }
        else if (tag === "NOTE") { ctx = "NOTE"; curIndi.bio = value; }
        else if (tag === "OBJE") {
          // İşaretçi (`@M@`) → sonra çöz; satır-içi ise `2 FILE` beklenir.
          if (/^@[^@]+@$/.test(value)) { ctx = null; curIndi.mediaRefs.push(value); }
          else ctx = "OBJE";
        }
      } else if (level === 2) {
        inEvenNote = false;
        if (ctx === "OBJE" && tag === "FILE") {
          if (value) curIndi.photos.push(value);
        } else if (ctx === "BIRT") {
          if (tag === "DATE") curIndi.birthDate = gedcomToDate(value);
          else if (tag === "PLAC") curIndi.birthPlace = value;
        } else if (ctx === "DEAT" && tag === "DATE") {
          curIndi.deathDate = gedcomToDate(value);
        } else if (ctx === "DEAT" && tag === "CAUS") {
          curIndi.deathCause = value || undefined;
        } else if (ctx === "FAMC" && (tag === "PEDI" || tag === "_PEDI")) {
          // 7.0 BÜYÜK harf yazar, 5.5.1 küçük — ikisi de buradan geçer.
          const v = value.toLowerCase();
          if (v === "adopted") pedigree.set(curIndi.gedId, "adoptive");
          else if (v === "foster") pedigree.set(curIndi.gedId, "foster");
          else if (v === "step") pedigree.set(curIndi.gedId, "step");
          // 7.0'da "üvey" standart bir PEDI değeri değil; OTHER + PHRASE ile
          // gelir. PHRASE bir sonraki satırdadır, o yüzden burada bayrak
          // bırakılır ve PHRASE görülünce karara bağlanır.
          else if (v === "other") pediOther.add(curIndi.gedId);
        } else if (ctx === "EVEN" && curEvent) {
          if (tag === "TYPE") curEvent.type = value || "diger";
          else if (tag === "DATE") curEvent.date = gedcomToDate(value);
          else if (tag === "PLAC") curEvent.place = value || undefined;
          else if (tag === "NOTE") { curEvent.title = value; inEvenNote = true; }
        } else if (ctx === "NOTE" && (tag === "CONT" || tag === "CONC")) {
          curIndi.bio += (tag === "CONT" ? "\n" : "") + value;
        }
      } else if (level === 3) {
        /*
         * `PEDI OTHER` → `PHRASE`. 7.0'da "üvey" standart bir PEDI değeri
         * değil; OTHER yazılıp açıklaması PHRASE'e konur ve PHRASE bir alt
         * seviyededir (`2 PEDI OTHER` / `3 PHRASE step`). Bu yüzden burada.
         */
        if (ctx === "FAMC" && tag === "PHRASE" && pediOther.has(curIndi.gedId)) {
          pediOther.delete(curIndi.gedId);
          const v = value.trim().toLowerCase();
          if (v === "step" || v === "üvey") pedigree.set(curIndi.gedId, "step");
        }
        // EVEN → NOTE altındaki çok satırlı serbest not
        if (ctx === "EVEN" && curEvent && inEvenNote && (tag === "CONT" || tag === "CONC")) {
          // İlk satırda baştan newline eklenmez; sonraki CONT'lar satır kırar
          curEvent.note = curEvent.note
            ? curEvent.note + (tag === "CONT" ? "\n" : "") + value
            : value;
        }
      }
    }

    if (curFam && level === 1) {
      if (tag === "HUSB") curFam.husb = value;
      else if (tag === "WIFE") curFam.wife = value;
      else if (tag === "CHIL") curFam.children.push(value);
      else if (tag === "DIV" && value.toUpperCase() !== "N") curFam.divorced = true;
    }

    // Üst-düzey `0 @M@ OBJE` kaydının dosya URL'i.
    if (curObje && level === 1 && tag === "FILE" && !curObje.file) curObje.file = value;
  }
  flush();

  const people: Person[] = [];
  for (const [, gi] of individuals) {
    const events: LifeEvent[] = gi.events.map((e) => ({
      id: nanoid(),
      type: e.type || "diger",
      title: e.title,
      date: e.date,
      place: e.place,
      note: e.note || undefined,
    }));
    // Fotoğraflar: satır-içi FILE'lar + çözülmüş işaretçiler (yinelenensiz).
    const photos: string[] = [];
    for (const u of [...gi.photos, ...gi.mediaRefs.map((r) => mediaRecords.get(r) ?? "")]) {
      if (u && !photos.includes(u)) photos.push(u);
    }
    people.push({
      id: gi.ourId,
      firstName: gi.firstName || "?",
      lastName: gi.lastName || "?",
      gender: gi.gender,
      birthDate: gi.birthDate,
      deathDate: gi.deathDate,
      deathCause: gi.deathCause,
      birthPlace: gi.birthPlace,
      occupation: gi.occupation,
      education: gi.education,
      photo: photos[0],
      photos: photos.length ? photos : undefined,
      bio: gi.bio || undefined,
      events: events.length ? events : undefined,
      parentIds: [],
      spouseIds: [],
      formerSpouseIds: [],
    });
  }

  for (const fam of families) {
    const hi = fam.husb ? individuals.get(fam.husb) : undefined;
    const wi = fam.wife ? individuals.get(fam.wife) : undefined;
    const hp = hi ? people.find((p) => p.id === hi.ourId) : undefined;
    const wp = wi ? people.find((p) => p.id === wi.ourId) : undefined;

    // GEDCOM'da SEX etiketi eksik olabilir; aile rolü (HUSB/WIFE) cinsiyeti
    // kesin verir. Belirsiz kalmasın diye buradan tamamlanır (ada bakılmaz).
    if (hp && hp.gender === "unknown") hp.gender = "male";
    if (wp && wp.gender === "unknown") wp.gender = "female";

    if (hp && wp) {
      if (fam.divorced) {
        if (!hp.formerSpouseIds!.includes(wp.id)) hp.formerSpouseIds!.push(wp.id);
        if (!wp.formerSpouseIds!.includes(hp.id)) wp.formerSpouseIds!.push(hp.id);
      } else {
        if (!hp.spouseIds.includes(wp.id)) hp.spouseIds.push(wp.id);
        if (!wp.spouseIds.includes(hp.id)) wp.spouseIds.push(hp.id);
      }
    }

    for (const childGedId of fam.children) {
      const ci = individuals.get(childGedId);
      const cp = ci ? people.find((p) => p.id === ci.ourId) : undefined;
      if (!cp) continue;
      if (hp && !cp.parentIds.includes(hp.id)) cp.parentIds.push(hp.id);
      if (wp && !cp.parentIds.includes(wp.id)) cp.parentIds.push(wp.id);
      if (cp.parentIds.length > 2) cp.parentIds = cp.parentIds.slice(0, 2);

      const kind = pedigree.get(childGedId);
      if (kind) {
        cp.parentLinks = Object.fromEntries(cp.parentIds.map((pid) => [pid, { kind }]));
      }
    }
  }

  return people;
}
