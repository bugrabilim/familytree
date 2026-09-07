import { mutateStore } from "@/lib/store-mutate";
import "server-only";
import { put, list, get } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import type { Recipe, RecipeBook } from "@/types/recipe";
import { MAX_RECIPES, normalizeRecipe, sortRecipes } from "@/lib/recipes";

/**
 * Tarif defteri deposu — ağaç başına ayrı blob: `recipes-<treeId>.json`.
 *
 * `family-data-<treeId>.json`e KATILMADI: tarif defteri ağacın her okumasında
 * indirilip yazılacak bir şey değil, ve bir tarif kaydı ağacın sürüm/çakışma
 * denetimini (kişi düzenleme akışı) tetiklememeli. Ayrı dosya, ayrı ömür.
 */

function pathname(treeId: string) {
  return `recipes-${treeId}.json`;
}

const empty = (): RecipeBook => ({ recipes: [], updatedAt: new Date(0).toISOString() });

export async function getRecipeBook(treeId: string): Promise<RecipeBook> {
  const path = pathname(treeId);

  // `lib/members.ts` ile aynı iki aşamalı okuma: önce doğrudan `get` (yeni
  // yazılanı hemen görür), olmazsa `list` yedeği. Blob `list()` eventual
  // consistent; taze bir kayıt hemen görünmeyebiliyor.
  try {
    const direct = await get(path, { access: "private", useCache: false });
    if (direct && direct.statusCode === 200) {
      return normalizeBook((await new Response(direct.stream).json()) as RecipeBook);
    }
  } catch {
    /* (2)'ye düş */
  }
  try {
    const found = await list({ prefix: path, limit: 1 });
    const blob = found.blobs[0];
    if (!blob) return empty();
    const res = await fetch(blob.url, { cache: "no-store" });
    if (!res.ok) throw new Error(`tarif defteri okunamadı (HTTP ${res.status})`);
    return normalizeBook((await res.json()) as RecipeBook);
  } catch (e) {
    /*
     * OKUNAMAYAN dosya, BOŞ dosya DEĞİLDİR.
     *
     * Burada eskiden `empty()` dönülüyordu ve çağıran onun üstüne yazıyordu:
     * tek bir geçici indirme hatası, o ana kadarki BÜTÜN kayıtları siliyordu.
     * Üstelik sessizce — uç 200 dönüyor, kullanıcı listeyi boş görüyor ve
     * yeniden yazmaya başlıyor; ilk yazma da eski dosyanın üstüne biniyor.
     *
     * Dosya GERÇEKTEN yoksa (yukarıdaki `!blob`) boş sayılıyor — o doğru.
     * Ama "var ama okuyamadım" hata olarak yükseliyor: gürültülü bir arıza,
     * sessiz bir veri kaybından her zaman iyidir.
     */
    throw e;
  }
}

/** Bozuk/eski bir dosya görünümü kırmasın. */
function normalizeBook(raw: Partial<RecipeBook> | null): RecipeBook {
  const list = Array.isArray(raw?.recipes) ? raw!.recipes : [];
  return {
    recipes: list.filter((r): r is Recipe => !!r && typeof r.id === "string" && typeof r.title === "string"),
    updatedAt: typeof raw?.updatedAt === "string" ? raw.updatedAt : new Date(0).toISOString(),
  };
}

async function saveBook(treeId: string, book: RecipeBook): Promise<void> {
  book.updatedAt = new Date().toISOString();
  await put(pathname(treeId), JSON.stringify(book), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

/**
 * Bu deponun oku→değiştir→yaz sarmalayıcısı (`lib/store-mutate.ts`).
 *
 * Kilit yokken kayıp yazma gerçekti: iki kişi aynı anda tarif eklediğinde
 * ikisi de defteri AYNI hâlde okuyor, sırayla yazıyor ve ikinci yazma
 * birincinin tarifini siliyordu. Burada kaybolan şey geri getirilemez —
 * ninenin tarifi kimsenin belleğinde ikinci bir kopyayla durmuyor.
 */
function mutate<T>(treeId: string, degistir: (book: RecipeBook) => { yaz: boolean; sonuc: T }): Promise<T> {
  return mutateStore(() => getRecipeBook(treeId), (b) => saveBook(treeId, b), degistir, "Tarif");
}

export type RecipeInput = Partial<Recipe> & { ingredientsText?: string; stepsText?: string };

/** Yeni tarif. Başlık yoksa ya da defter doluysa null. */
export async function addRecipe(treeId: string, input: RecipeInput): Promise<Recipe | null> {
  return mutate<Recipe | null>(treeId, (book) => {
    if (book.recipes.length >= MAX_RECIPES) return { yaz: false, sonuc: null };
    const recipe = normalizeRecipe(input, new Date().toISOString());
    if (!recipe) return { yaz: false, sonuc: null };
    recipe.id = randomUUID();
    book.recipes.push(recipe);
    return { yaz: true, sonuc: recipe };
  });
}

/** Var olan tarifi günceller. Bulunamazsa null. */
export async function updateRecipe(
  treeId: string,
  id: string,
  input: RecipeInput
): Promise<Recipe | null> {
  return mutate<Recipe | null>(treeId, (book) => {
    const i = book.recipes.findIndex((r) => r.id === id);
    if (i === -1) return { yaz: false, sonuc: null };
    const next = normalizeRecipe(input, new Date().toISOString(), book.recipes[i]);
    if (!next) return { yaz: false, sonuc: null };
    book.recipes[i] = next;
    return { yaz: true, sonuc: next };
  });
}

/** Siler; silinen bulunduysa true. */
export async function deleteRecipe(treeId: string, id: string): Promise<boolean> {
  return mutate<boolean>(treeId, (book) => {
    const before = book.recipes.length;
    book.recipes = book.recipes.filter((r) => r.id !== id);
    if (book.recipes.length === before) return { yaz: false, sonuc: false };
    return { yaz: true, sonuc: true };
  });
}

/** Listeleme — başlığa göre Türkçe sıralı. */
export async function listRecipes(treeId: string): Promise<Recipe[]> {
  return sortRecipes((await getRecipeBook(treeId)).recipes);
}
