"use client";

import { useEffect, useMemo, useState } from "react";
import type { Person } from "@/types/family";
import type { Recipe } from "@/types/recipe";
import Avatar from "./ui/Avatar";
import Button from "./ui/Button";
import PersonPicker from "./PersonPicker";
import { fromLines, groupByOccasion, groupByPerson, matches } from "@/lib/recipes";
import { fullName } from "@/lib/name";
import { useReadOnly } from "./ReadOnlyContext";
import { useT } from "@/lib/i18n";

/**
 * Aile tarif defteri.
 *
 * Tarifler `Person` içinde değil AYRI bir koleksiyonda (`recipes-<treeId>`);
 * bu yüzden görünüm ağacın verisini değil kendi ucunu (`/api/family/recipes`)
 * okur. Kişi yalnız "kimden geldi" bağı için kullanılır ve bağ koparsa
 * (kişi silinirse) tarif adıyla kalmayı sürdürür.
 */
export default function RecipesView({
  people,
  onSelect,
}: {
  people: Person[];
  onSelect: (id: string) => void;
}) {
  const t = useT();
  const { readOnly } = useReadOnly();
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [grouping, setGrouping] = useState<"person" | "occasion">("person");
  const [editing, setEditing] = useState<Recipe | "new" | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/family/recipes");
        const data = await res.json();
        if (!alive) return;
        if (!res.ok) throw new Error(data?.error ?? t("recipes.failed"));
        setRecipes(data.recipes ?? []);
      } catch (e) {
        if (alive) { setError((e as Error).message); setRecipes([]); }
      }
    })();
    return () => { alive = false; };
  }, [t]);

  const call = async (method: "POST" | "PUT" | "DELETE", body: unknown) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/family/recipes", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? t("recipes.failed"));
      setRecipes(data.recipes ?? []);
      setEditing(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const shown = useMemo(
    () => (recipes ?? []).filter((r) => matches(r, query)),
    [recipes, query]
  );
  const groups = useMemo(
    () =>
      grouping === "person"
        ? groupByPerson(shown, t("recipes.unattributed"))
        : groupByOccasion(shown, t("recipes.otherOccasion")),
    [shown, grouping, t]
  );

  if (editing) {
    return (
      <RecipeForm
        people={people}
        recipe={editing === "new" ? null : editing}
        busy={busy}
        error={error}
        onCancel={() => { setEditing(null); setError(""); }}
        onSave={(input) =>
          call(editing === "new" ? "POST" : "PUT", editing === "new" ? input : { ...input, id: editing.id })
        }
      />
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto p-4 sm:p-6 grid gap-5">
        <header>
          <h1 className="font-serif text-xl font-semibold text-text">{t("recipes.title")}</h1>
          <p className="text-sm text-text-muted mt-0.5">{t("recipes.subtitle")}</p>
        </header>

        {recipes === null ? (
          <p className="text-sm text-text-muted">…</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("recipes.search")}
                className="flex-1 min-w-[12rem] h-9 px-3 rounded-xl bg-surface-2 border border-border text-text text-sm placeholder:text-text-subtle focus:outline-none focus:border-primary"
              />
              <div className="flex gap-1">
                {(["person", "occasion"] as const).map((g) => (
                  <button
                    key={g}
                    onClick={() => setGrouping(g)}
                    aria-pressed={grouping === g}
                    className={`text-[11px] px-2 py-1.5 rounded-lg border transition-colors ${
                      grouping === g
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-border text-text-subtle hover:bg-surface-2"
                    }`}
                  >
                    {t(g === "person" ? "recipes.groupPerson" : "recipes.groupOccasion")}
                  </button>
                ))}
              </div>
              {!readOnly && (
                <Button size="sm" onClick={() => setEditing("new")}>{t("recipes.add")}</Button>
              )}
            </div>

            {error && <p className="text-xs text-danger bg-danger-soft px-3 py-2.5 rounded-xl">{error}</p>}

            {recipes.length === 0 ? (
              <div className="rounded-2xl border border-border bg-surface p-5">
                <p className="text-sm text-text">{t("recipes.empty")}</p>
                <p className="text-[11px] text-text-subtle mt-1">{t("recipes.emptyHint")}</p>
              </div>
            ) : shown.length === 0 ? (
              <p className="text-sm text-text-subtle">{t("recipes.noMatch")}</p>
            ) : (
              <>
                <p className="text-[11px] text-text-subtle">{t("recipes.count", { count: shown.length })}</p>
                {groups.map((g) => (
                  <section key={g.key || "__yok"} className="grid gap-2">
                    <div className="flex items-center gap-2">
                      {grouping === "person" && g.key && byId.get(g.key) && (
                        <button onClick={() => onSelect(g.key)} className="shrink-0">
                          <Avatar person={byId.get(g.key)!} size="sm" />
                        </button>
                      )}
                      <h2 className="font-serif text-base font-semibold text-text">{g.label}</h2>
                      <span className="text-[11px] text-text-subtle tabular-nums">{g.recipes.length}</span>
                    </div>
                    {g.recipes.map((r) => (
                      <RecipeCard
                        key={r.id}
                        recipe={r}
                        readOnly={readOnly}
                        busy={busy}
                        onEdit={() => setEditing(r)}
                        onDelete={() => {
                          if (window.confirm(t("recipes.deleteConfirm"))) call("DELETE", { id: r.id });
                        }}
                      />
                    ))}
                  </section>
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function RecipeCard({
  recipe, readOnly, busy, onEdit, onDelete,
}: {
  recipe: Recipe; readOnly: boolean; busy: boolean; onEdit: () => void; onDelete: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const meta = [recipe.place, recipe.occasion, recipe.servings].filter(Boolean).join(" · ");
  return (
    <article className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="min-w-0 text-left flex-1">
          <p className="text-sm font-medium text-text">{recipe.title}</p>
          {meta && <p className="text-[11px] text-text-subtle mt-0.5">{meta}</p>}
        </button>
        {!readOnly && (
          <div className="flex gap-1 shrink-0">
            <button
              onClick={onEdit}
              disabled={busy}
              className="text-[11px] px-2 py-1 rounded-lg text-text-subtle hover:text-text hover:bg-surface-2 transition-colors"
            >
              {t("recipes.edit")}
            </button>
            <button
              onClick={onDelete}
              disabled={busy}
              className="text-[11px] px-2 py-1 rounded-lg text-text-subtle hover:text-danger hover:bg-danger-soft transition-colors"
            >
              {t("recipes.delete")}
            </button>
          </div>
        )}
      </div>

      {open && (
        <div className="mt-3 grid gap-3 text-sm">
          {recipe.ingredients.length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-text-subtle mb-1">
                {t("recipes.field.ingredients")}
              </p>
              <ul className="list-disc pl-5 space-y-0.5 text-text">
                {recipe.ingredients.map((x, i) => <li key={i}>{x}</li>)}
              </ul>
            </div>
          )}
          {recipe.steps.length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-text-subtle mb-1">
                {t("recipes.field.steps")}
              </p>
              <ol className="list-decimal pl-5 space-y-0.5 text-text">
                {recipe.steps.map((x, i) => <li key={i}>{x}</li>)}
              </ol>
            </div>
          )}
          {recipe.note && <p className="text-text-muted italic">{recipe.note}</p>}
        </div>
      )}
    </article>
  );
}

function RecipeForm({
  people, recipe, busy, error, onCancel, onSave,
}: {
  people: Person[];
  recipe: Recipe | null;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onSave: (input: Record<string, unknown>) => void;
}) {
  const t = useT();
  const [title, setTitle] = useState(recipe?.title ?? "");
  const [fromPersonId, setFromPersonId] = useState(recipe?.fromPersonId ?? "");
  const [place, setPlace] = useState(recipe?.place ?? "");
  const [occasion, setOccasion] = useState(recipe?.occasion ?? "");
  const [servings, setServings] = useState(recipe?.servings ?? "");
  const [ingredientsText, setIngredients] = useState(fromLines(recipe?.ingredients ?? []));
  const [stepsText, setSteps] = useState(fromLines(recipe?.steps ?? []));
  const [note, setNote] = useState(recipe?.note ?? "");

  const person = people.find((p) => p.id === fromPersonId);
  const input = {
    title,
    fromPersonId,
    // Ad, kişi silinse de tarifin kimden geldiğini unutmasın diye AYRICA
    // saklanır; bağ koptuğunda geriye bu kalır.
    fromName: person ? fullName(person) : "",
    place, occasion, servings, ingredientsText, stepsText, note,
  };

  const field = "w-full h-10 px-3 rounded-xl bg-surface-2 border border-border text-text text-sm placeholder:text-text-subtle focus:outline-none focus:border-primary";
  const area = "w-full px-3 py-2 rounded-xl bg-surface-2 border border-border text-text text-sm placeholder:text-text-subtle focus:outline-none focus:border-primary";

  return (
    <div className="h-full overflow-y-auto">
      <form
        className="max-w-2xl mx-auto p-4 sm:p-6 grid gap-3"
        onSubmit={(e) => { e.preventDefault(); onSave(input); }}
      >
        <h1 className="font-serif text-lg font-semibold text-text">
          {recipe ? recipe.title : t("recipes.add")}
        </h1>

        <label className="grid gap-1">
          <span className="text-[11px] uppercase tracking-wide text-text-subtle">{t("recipes.field.title")}</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={field} autoFocus />
        </label>

        <label className="grid gap-1">
          <span className="text-[11px] uppercase tracking-wide text-text-subtle">{t("recipes.field.from")}</span>
          <PersonPicker people={people} value={fromPersonId} onChange={setFromPersonId} />
        </label>

        <div className="grid gap-3 sm:grid-cols-3">
          {([
            [t("recipes.field.place"), place, setPlace],
            [t("recipes.field.occasion"), occasion, setOccasion],
            [t("recipes.field.servings"), servings, setServings],
          ] as const).map(([label, value, set]) => (
            <label key={label} className="grid gap-1">
              <span className="text-[11px] uppercase tracking-wide text-text-subtle">{label}</span>
              <input value={value} onChange={(e) => set(e.target.value)} className={field} />
            </label>
          ))}
        </div>

        {([
          [t("recipes.field.ingredients"), ingredientsText, setIngredients, 6],
          [t("recipes.field.steps"), stepsText, setSteps, 8],
        ] as const).map(([label, value, set, rows]) => (
          <label key={label} className="grid gap-1">
            <span className="text-[11px] uppercase tracking-wide text-text-subtle">
              {label} <span className="normal-case tracking-normal">· {t("recipes.linesHint")}</span>
            </span>
            <textarea value={value} onChange={(e) => set(e.target.value)} rows={rows} className={area} />
          </label>
        ))}

        <label className="grid gap-1">
          <span className="text-[11px] uppercase tracking-wide text-text-subtle">{t("recipes.field.note")}</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={area} />
        </label>

        {error && <p className="text-xs text-danger bg-danger-soft px-3 py-2.5 rounded-xl">{error}</p>}

        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={busy || !title.trim()}>{t("recipes.save")}</Button>
          <Button type="button" variant="secondary" size="sm" onClick={onCancel} disabled={busy}>
            {t("recipes.cancel")}
          </Button>
          {!title.trim() && <span className="text-[11px] text-text-subtle self-center">{t("recipes.titleRequired")}</span>}
        </div>
      </form>
    </div>
  );
}
