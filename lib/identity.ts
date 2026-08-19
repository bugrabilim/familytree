import type { Person } from "@/types/family";

/**
 * LGBT+ göstergesi — kartların zemini gökkuşağı yapılır (Madde 16). Ölçüt:
 * cinsiyet "diğer" (ikili olmayan) YA DA heteroseksüel olmayan bir cinsel
 * yönelim kayıtlı. Yönelim serbest metin olduğundan hetero/düz/straight ile
 * başlayanlar dışlanır; boş yönelim rainbow saymaz.
 */
export function isRainbow(p: Pick<Person, "gender" | "orientation">): boolean {
  if (p.gender === "other") return true;
  const o = p.orientation?.trim().toLocaleLowerCase("tr");
  if (!o) return false;
  return !/^(hetero|düz|straight)/.test(o);
}
