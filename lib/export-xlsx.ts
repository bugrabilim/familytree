import "server-only";
import type { Person } from "@/types/family";

/** Kişileri Excel (.xlsx) çalışma kitabına dışa aktarır. Tek sayfa: "Kişiler". */
export async function exportXlsx(people: Person[]): Promise<Buffer> {
  const XLSX = await import("xlsx");
  const rows = people.map((p) => ({
    Kod: p.code ?? "",
    Ad: p.firstName ?? "",
    Soyad: p.lastName ?? "",
    Cinsiyet: p.gender ?? "",
    Doğum: p.birthDate ?? "",
    "Doğum Yeri": p.birthPlace ?? "",
    Ölüm: p.deathDate ?? "",
    "Defin Yeri": p.burialPlace ?? "",
    Meslek: p.occupation ?? "",
    Din: p.religion ?? "",
    "Etnik Köken": p.ethnicity ?? "",
    Uyruk: p.nationality ?? "",
    Not: p.bio ?? "",
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Kişiler");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
