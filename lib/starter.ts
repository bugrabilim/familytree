import type { Person } from "@/types/family";
import { nanoid } from "nanoid";

/**
 * Yeni kullanıcı için başlangıç iskeleti — SAF, test edilebilir.
 *
 * Boş bir ağaçla karşılaşmak yerine kullanıcı, doldurulacak hazır kartlar
 * görür: kendisi, anne–baba ve dört büyükanne/büyükbaba. Kartların adı boştur;
 * `placeholder` alanı hangi rol olduğunu söyler (arayüz etiketi).
 *
 * App runtime importu yoktur (yalnız Person TÜR'ü + nanoid) → Node ile test
 * edilebilir.
 */

/** İskeletteki rol anahtarları — i18n `starter.role.*` ile eşleşir. */
export const STARTER_ROLES = [
  "self",
  "father",
  "mother",
  "fatherFather",
  "fatherMother",
  "motherFather",
  "motherMother",
] as const;

export type StarterRole = (typeof STARTER_ROLES)[number];

export function buildStarterTree(): Person[] {
  const id = () => nanoid();
  const self = id(), fa = id(), mo = id();
  const ff = id(), fm = id(), mf = id(), mm = id();

  const p = (
    pid: string,
    role: StarterRole,
    gender: Person["gender"],
    parents: string[],
    spouses: string[]
  ): Person => ({
    id: pid,
    firstName: "",
    lastName: "",
    gender,
    placeholder: role,
    parentIds: parents,
    spouseIds: spouses,
  });

  return [
    p(self, "self", "unknown", [fa, mo], []),
    p(fa, "father", "male", [ff, fm], [mo]),
    p(mo, "mother", "female", [mf, mm], [fa]),
    p(ff, "fatherFather", "male", [], [fm]),
    p(fm, "fatherMother", "female", [], [ff]),
    p(mf, "motherFather", "male", [], [mm]),
    p(mm, "motherMother", "female", [], [mf]),
  ];
}
