import type { Person } from "@/types/family";

/** İnsan-okur kimlik ön eki: kodlar "289" ile başlar, toplam 6 hane. */
export const CODE_PREFIX = "289";

/** Sıra numarasını 6 haneli koda çevirir: 1 → "289001". */
export function formatCode(n: number): string {
  return CODE_PREFIX + String(n).padStart(3, "0");
}

/** Mevcut kayıtlardaki en yüksek koddan sonraki boş kodu döndürür. */
export function nextCode(people: Person[]): string {
  let max = 0;
  for (const p of people) {
    if (p.code?.startsWith(CODE_PREFIX)) {
      const n = Number(p.code.slice(CODE_PREFIX.length));
      if (!Number.isNaN(n) && n > max) max = n;
    }
  }
  return formatCode(max + 1);
}
