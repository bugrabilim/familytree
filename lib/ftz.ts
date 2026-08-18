import type { Gender, Person } from "@/types/family";
import { nanoid } from "nanoid";

/**
 * Quick Family Tree / digital-gene ".ftz" içe aktarımının SAF çekirdeği.
 *
 * .ftz aslında bir ZIP paketidir: `<AğaçAdı>/node.ftt` (veri) + `face/` (fotoğraf
 * klasörü). ZIP açma işi server-only `lib/ftz-unzip` içinde (node:zlib); burada
 * yalnız açılmış `node.ftt` METNİ ayrıştırılır → hiçbir app runtime bağımlılığı
 * yok (yalnız Person TÜR'ü + nanoid), Node ile doğrudan test edilebilir.
 *
 * node.ftt biçimi (UTF-8, BOM'lu, TAB ayraçlı):
 *  · 1. satır  = başlık: kişiSayısı, evlilikSayısı, evId (home/kök kişi)
 *  · kişi satırı (29 sütun): 0:id 2:doğduğu-evlilik-id 3:kardeş-sırası
 *      12:soyad 13:ad 16..19:doğum(bayrak,Y,A,G) 20..23:ölüm(bayrak,Y,A,G)
 *      24:cinsiyet(1E/2K) 25:lakap 28:not
 *  · evlilik satırı (12 sütun): 0:evId 1:boşanma(1=boşandı) 2:koca-id 4:eş-id
 *
 * İlişkiler: kişinin ebeveynleri, "doğduğu evlilik"in koca+eş kişileridir;
 * o evliliğin eşleri de birbirinin eşidir (boşanma=1 ise eski eş).
 */

const PERSON_COLS = 29;
const UNION_COLS = 12;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** node.ftt bayrak/Y/A/G alanlarından "YYYY" | "YYYY-MM" | "YYYY-MM-DD" üretir. */
function builtDate(year: string, month: string, day: string): string | undefined {
  const y = Number(year);
  if (!y || Number.isNaN(y)) return undefined;
  const m = Number(month);
  const d = Number(day);
  if (!m) return String(y);
  if (!d) return `${y}-${pad(m)}`;
  return `${y}-${pad(m)}-${pad(d)}`;
}

function toGender(v: string): Gender {
  if (v === "1") return "male";
  if (v === "2") return "female";
  return "unknown";
}

/** Açılmış node.ftt metnini `Person[]`'e çevirir. */
export function parseFttText(text: string): Person[] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l !== "");
  if (lines.length === 0) return [];

  const rows = lines.map((l) => l.split("\t"));
  const persons = rows.filter((r) => r.length >= PERSON_COLS);
  const unions = rows.filter((r) => r.length === UNION_COLS);

  // Eski (sayısal) id → yeni kararlı id. İlişkiler yeni id ile kurulur.
  const idMap = new Map<string, string>();
  for (const p of persons) idMap.set(p[0], nanoid());

  // Evlilikler: evId → { koca, eş, boşanma }
  type Union = { husband?: string; wife?: string; divorced: boolean };
  const unionById = new Map<string, Union>();
  for (const u of unions) {
    unionById.set(u[0], {
      husband: u[2] !== "0" ? u[2] : undefined,
      wife: u[4] !== "0" ? u[4] : undefined,
      divorced: u[1] === "1",
    });
  }

  const spouse = new Map<string, Set<string>>();
  const formerSpouse = new Map<string, Set<string>>();
  const add = (m: Map<string, Set<string>>, a: string, b: string) => {
    const s = m.get(a) ?? new Set<string>();
    s.add(b);
    m.set(a, s);
  };

  // Eş bağları — her evlilikteki koca & eş birbirinin (eski) eşi
  for (const u of unionById.values()) {
    const h = u.husband && idMap.get(u.husband);
    const w = u.wife && idMap.get(u.wife);
    if (h && w) {
      const m = u.divorced ? formerSpouse : spouse;
      add(m, h, w);
      add(m, w, h);
    }
  }

  const people: Person[] = persons.map((p) => {
    const id = idMap.get(p[0])!;
    const parentUnion = p[2] !== "0" ? unionById.get(p[2]) : undefined;
    const parentIds = parentUnion
      ? [parentUnion.husband, parentUnion.wife]
          .map((old) => (old ? idMap.get(old) : undefined))
          .filter((x): x is string => !!x)
      : [];

    const person: Person = {
      id,
      firstName: (p[13] ?? "").trim(),
      lastName: (p[12] ?? "").trim(),
      gender: toGender(p[24] ?? ""),
      parentIds,
      spouseIds: [...(spouse.get(id) ?? [])],
    };
    const nick = (p[25] ?? "").trim();
    if (nick) person.nickname = nick;
    const birth = builtDate(p[17], p[18], p[19]);
    if (birth) person.birthDate = birth;
    const death = builtDate(p[21], p[22], p[23]);
    if (death) person.deathDate = death;
    const note = (p[28] ?? "").trim();
    if (note) person.bio = note;
    const former = formerSpouse.get(id);
    if (former && former.size) person.formerSpouseIds = [...former];
    return person;
  });

  return people;
}
