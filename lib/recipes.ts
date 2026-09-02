import type { Recipe } from "@/types/recipe";
import { fold } from "./turkish.ts";

// Katlama tek kaynaktan; çağıranlar için buradan da açık kalsın.
export { fold };

/**
 * Tarif defteri — saf yardımcılar (arama, ayıklama, öbekleme).
 *
 * Depolama `lib/recipe-store.ts`te; burası bağımlılıksız kalır ki birim testi
 * koşulabilsin.
 */

/** Tek bir tarifte en fazla kaç satır/karakter — kaza ve kötüye kullanım sınırı. */
export const MAX_LINES = 200;
export const MAX_LINE = 500;
export const MAX_TITLE = 200;
export const MAX_NOTE = 4000;
/** Bir ağaçta en fazla tarif. */
export const MAX_RECIPES = 500;

/**
 * Serbest metni satır listesine çevirir.
 *
 * Kullanıcı malzemeleri tek kutuya yazıyor; satır sonu ayracı odur. Boş
 * satırlar düşer, baştaki madde imleri ("-", "•", "1.") temizlenir — insan
 * yazarken koyar, listeye ikinci kez eklemenin anlamı yok.
 *
 * Numaralı imden sonra BOŞLUK aranır. Aranmayınca "1.5 çay kaşığı tuz"
 * satırındaki "1." im sanılıp siliniyor ve satır "5 çay kaşığı tuz" oluyordu —
 * yani tarifin ölçüsü sessizce üçe katlanıyordu. Bir tarif kaydında bundan
 * kötü bir sessiz hata az bulunur.
 */
export function toLines(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-•*–—]\s*|\d+[.)]\s+)/, "").trim())
    .filter(Boolean)
    .slice(0, MAX_LINES)
    .map((l) => l.slice(0, MAX_LINE));
}

/** Satır listesini düzenlenebilir metne geri çevirir. */
export function fromLines(lines: readonly string[]): string {
  return lines.join("\n");
}

/**
 * Türkçe arama katlaması — `lib/duplicates.ts` ve `lib/surnames.ts` ile aynı
 * kural. "İ" büyük harfli i'dir; `toLowerCase()` onu "i̇" yapıp aramayı bozar.
 */


/** Tarifte aranan metin geçiyor mu — başlık, malzeme, adım, yöre, not. */
export function matches(recipe: Recipe, query: string): boolean {
  const q = fold(query);
  if (!q) return true;
  const alanlar = [
    recipe.title,
    recipe.fromName ?? "",
    recipe.place ?? "",
    recipe.occasion ?? "",
    recipe.note ?? "",
    ...recipe.ingredients,
    ...recipe.steps,
  ];
  return alanlar.some((a) => fold(a).includes(q));
}

const collator = new Intl.Collator("tr");

/** Başlığa göre Türkçe sıralı. */
export function sortRecipes(recipes: readonly Recipe[]): Recipe[] {
  return [...recipes].sort((a, b) => collator.compare(a.title, b.title));
}

export interface RecipeGroup {
  /** Öbek anahtarı (kişi kimliği ya da vesile metni); bağsızlar için boş. */
  key: string;
  label: string;
  recipes: Recipe[];
}

/**
 * Kime ait olduğuna göre öbekler. Kimseye bağlı olmayanlar SON öbekte toplanır
 * ve atılmaz: yörenin tarifi de aile tarifidir.
 */
export function groupByPerson(recipes: readonly Recipe[], unnamed: string): RecipeGroup[] {
  const m = new Map<string, RecipeGroup>();
  const bagsiz: Recipe[] = [];
  for (const r of sortRecipes(recipes)) {
    const key = r.fromPersonId?.trim();
    if (!key) { bagsiz.push(r); continue; }
    const g = m.get(key);
    if (g) g.recipes.push(r);
    else m.set(key, { key, label: r.fromName?.trim() || unnamed, recipes: [r] });
  }
  const out = [...m.values()].sort((a, b) => collator.compare(a.label, b.label));
  if (bagsiz.length > 0) out.push({ key: "", label: unnamed, recipes: bagsiz });
  return out;
}

/** Vesileye göre öbekler (bayram, kış…). Vesilesizler son öbekte. */
export function groupByOccasion(recipes: readonly Recipe[], other: string): RecipeGroup[] {
  const m = new Map<string, RecipeGroup>();
  const yok: Recipe[] = [];
  for (const r of sortRecipes(recipes)) {
    const raw = r.occasion?.trim();
    if (!raw) { yok.push(r); continue; }
    // Yazım farkları ("Bayram" / "bayram") tek öbek olsun; gösterimde ilk
    // karşılaşılan özgün yazım kullanılır.
    const key = fold(raw);
    const g = m.get(key);
    if (g) g.recipes.push(r);
    else m.set(key, { key, label: raw, recipes: [r] });
  }
  const out = [...m.values()].sort((a, b) => collator.compare(a.label, b.label));
  if (yok.length > 0) out.push({ key: "", label: other, recipes: yok });
  return out;
}

/**
 * Gelen (güvenilmez) gövdeyi kaydedilebilir bir tarife çevirir.
 *
 * Başlık zorunlu — başlıksız bir tarif listede bulunamaz. Onun dışında her şey
 * isteğe bağlı: eksik hatırlanan bir tarif de kayda değer, "önce tamamla"
 * demek çoğu zaman "hiç yazma" demek olur.
 */
export function normalizeRecipe(
  input: Partial<Recipe> & { ingredientsText?: string; stepsText?: string },
  now: string,
  existing?: Recipe
): Recipe | null {
  const title = (input.title ?? existing?.title ?? "").trim().slice(0, MAX_TITLE);
  if (!title) return null;

  const lines = (
    text: string | undefined,
    arr: string[] | undefined,
    fallback: string[]
  ): string[] => {
    if (text !== undefined) return toLines(text);
    if (Array.isArray(arr)) return toLines(arr.join("\n"));
    return fallback;
  };

  const str = (v: unknown, prev: string | undefined, max = MAX_LINE) =>
    v === undefined ? prev : String(v).trim().slice(0, max) || undefined;

  return {
    id: existing?.id ?? input.id ?? "",
    title,
    fromPersonId: str(input.fromPersonId, existing?.fromPersonId),
    fromName: str(input.fromName, existing?.fromName),
    place: str(input.place, existing?.place),
    occasion: str(input.occasion, existing?.occasion),
    servings: str(input.servings, existing?.servings),
    ingredients: lines(input.ingredientsText, input.ingredients, existing?.ingredients ?? []),
    steps: lines(input.stepsText, input.steps, existing?.steps ?? []),
    note: str(input.note, existing?.note, MAX_NOTE),
    photo: str(input.photo, existing?.photo, 2000),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}
