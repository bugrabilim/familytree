"use client";

import { useEffect, useState } from "react";
import type { Person } from "@/types/family";
import type { Obituary } from "@/types/obituary";
import Button from "./ui/Button";
import PersonPicker from "./PersonPicker";
import { formatLong } from "@/lib/date";
import { fullName } from "@/lib/name";
import { useReadOnly } from "./ReadOnlyContext";
import { useT } from "@/lib/i18n";

/**
 * Taziye duyuruları.
 *
 * Bu, uygulamanın kültürel olarak en hassas yüzeyi. İki kural görünümü de
 * belirliyor:
 *  · Hiçbir alan TAHMİN EDİLMEZ — boş alan boş görünür. Uydurulmuş bir tören
 *    saati gerçek bir aileyi yanlış yere gönderir.
 *  · Uygulama METİN YAZMAZ. Dua, başsağlığı, anma sözü — hepsi ailenindir.
 *    Bu ağaçlarda farklı inançlardan ve inançsız aileler var.
 */
export default function ObituaryView({
  people,
  onSelect,
}: {
  people: Person[];
  onSelect: (id: string) => void;
}) {
  const t = useT();
  const { readOnly } = useReadOnly();
  const [list, setList] = useState<Obituary[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Obituary | "new" | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/family/obituaries");
        const data = await res.json();
        if (!alive) return;
        if (!res.ok) throw new Error(data?.error ?? t("obit.failed"));
        setList(data.obituaries ?? []);
      } catch (e) {
        if (alive) { setError((e as Error).message); setList([]); }
      }
    })();
    return () => { alive = false; };
  }, [t]);

  const call = async (method: "POST" | "PUT" | "DELETE", body: unknown) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/family/obituaries", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? t("obit.failed"));
      setList(data.obituaries ?? []);
      setEditing(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <ObituaryForm
        people={people}
        obituary={editing === "new" ? null : editing}
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
      <div className="max-w-2xl mx-auto p-4 sm:p-6 grid gap-5">
        <header>
          <h1 className="font-serif text-xl font-semibold text-text">{t("obit.title")}</h1>
          <p className="text-sm text-text-muted mt-0.5">{t("obit.subtitle")}</p>
        </header>

        {list === null ? (
          <p className="text-sm text-text-muted">…</p>
        ) : (
          <>
            {!readOnly && (
              <div><Button size="sm" onClick={() => setEditing("new")}>{t("obit.add")}</Button></div>
            )}
            {error && <p className="text-xs text-danger bg-danger-soft px-3 py-2.5 rounded-xl">{error}</p>}

            {list.length === 0 ? (
              <div className="rounded-2xl border border-border bg-surface p-5">
                <p className="text-sm text-text">{t("obit.empty")}</p>
                <p className="text-[11px] text-text-subtle mt-1">{t("obit.emptyHint")}</p>
              </div>
            ) : (
              <>
                <p className="text-[11px] text-text-subtle">{t("obit.count", { count: list.length })}</p>
                {list.map((o) => (
                  <ObituaryCard
                    key={o.id}
                    obituary={o}
                    people={people}
                    readOnly={readOnly}
                    busy={busy}
                    onSelect={onSelect}
                    onEdit={() => setEditing(o)}
                    onDelete={() => {
                      if (window.confirm(t("obit.deleteConfirm"))) call("DELETE", { id: o.id });
                    }}
                  />
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Değeri boşsa satır hiç çizilmez — boş bir "Tören yeri:" satırı, bilgi yokken
 *  bilgi varmış izlenimi verir. */
function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 py-1 border-b border-border/60 last:border-0">
      <span className="text-[11px] uppercase tracking-wide text-text-subtle w-32 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-text flex-1 min-w-0">{value}</span>
    </div>
  );
}

function ObituaryCard({
  obituary: o, people, readOnly, busy, onSelect, onEdit, onDelete,
}: {
  obituary: Obituary; people: Person[]; readOnly: boolean; busy: boolean;
  onSelect: (id: string) => void; onEdit: () => void; onDelete: () => void;
}) {
  const t = useT();
  const person = people.find((p) => p.id === o.personId);
  return (
    <article className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {person ? (
            <button onClick={() => onSelect(person.id)} className="text-sm font-medium text-text hover:underline">
              {fullName(person)}
            </button>
          ) : (
            <p className="text-sm font-medium text-text">{o.personName}</p>
          )}
          {o.diedOn && (
            <p className="text-[11px] text-text-subtle mt-0.5">{formatLong(o.diedOn)}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {o.publicShare && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-soft text-accent">
              {t("obit.publicBadge")}
            </span>
          )}
          {!readOnly && (
            <>
              <button onClick={onEdit} disabled={busy}
                className="text-[11px] px-2 py-1 rounded-lg text-text-subtle hover:text-text hover:bg-surface-2 transition-colors">
                {t("obit.edit")}
              </button>
              <button onClick={onDelete} disabled={busy}
                className="text-[11px] px-2 py-1 rounded-lg text-text-subtle hover:text-danger hover:bg-danger-soft transition-colors">
                {t("obit.delete")}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="mt-3">
        <Row label={t("obit.field.serviceOn")} value={o.serviceOn ? formatLong(o.serviceOn) : undefined} />
        <Row label={t("obit.field.serviceAt")} value={o.serviceAt} />
        <Row label={t("obit.field.burialAt")} value={o.burialAt} />
        <Row label={t("obit.field.condolenceAt")} value={o.condolenceAt} />
      </div>

      {o.message && (
        <p className="mt-3 text-sm text-text whitespace-pre-wrap leading-relaxed">{o.message}</p>
      )}
    </article>
  );
}

function ObituaryForm({
  people, obituary, busy, error, onCancel, onSave,
}: {
  people: Person[]; obituary: Obituary | null; busy: boolean; error: string;
  onCancel: () => void; onSave: (input: Record<string, unknown>) => void;
}) {
  const t = useT();
  const [personId, setPersonId] = useState(obituary?.personId ?? "");
  const [diedOn, setDiedOn] = useState(obituary?.diedOn ?? "");
  const [serviceOn, setServiceOn] = useState(obituary?.serviceOn ?? "");
  const [serviceAt, setServiceAt] = useState(obituary?.serviceAt ?? "");
  const [burialAt, setBurialAt] = useState(obituary?.burialAt ?? "");
  const [condolenceAt, setCondolenceAt] = useState(obituary?.condolenceAt ?? "");
  const [message, setMessage] = useState(obituary?.message ?? "");
  const [publicShare, setPublicShare] = useState(obituary?.publicShare === true);

  const person = people.find((p) => p.id === personId);
  /*
   * Vefat tarihi kişinin kaydından ÖNERİLİR ama otomatik yazılmaz: öneri
   * kutuya konur, aile onaylayarak bırakır ya da değiştirir. Sessizce
   * doldurmak, ailenin görmediği bir tarihi duyuruya basmak olurdu.
   */
  const oneri = person?.deathDate && /^\d{4}-\d{2}-\d{2}$/.test(person.deathDate) ? person.deathDate : "";

  const input: Record<string, unknown> = {
    personId,
    personName: person ? fullName(person) : obituary?.personName ?? "",
    diedOn, serviceOn, serviceAt, burialAt, condolenceAt, message, publicShare,
  };

  const field = "w-full h-10 px-3 rounded-xl bg-surface-2 border border-border text-text text-sm focus:outline-none focus:border-primary";

  return (
    <div className="h-full overflow-y-auto">
      <form className="max-w-xl mx-auto p-4 sm:p-6 grid gap-3"
        onSubmit={(e) => { e.preventDefault(); onSave(input); }}>
        <h1 className="font-serif text-lg font-semibold text-text">
          {obituary ? obituary.personName : t("obit.add")}
        </h1>

        <label className="grid gap-1">
          <span className="text-[11px] uppercase tracking-wide text-text-subtle">{t("obit.field.person")}</span>
          <PersonPicker people={people} value={personId} onChange={(id) => {
            setPersonId(id);
            // Öneriyi yalnız kutu BOŞKEN doldur: elle yazılmış bir tarihi ezmeyelim.
            const p = people.find((x) => x.id === id);
            if (!diedOn && p?.deathDate && /^\d{4}-\d{2}-\d{2}$/.test(p.deathDate)) setDiedOn(p.deathDate);
          }} />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1">
            <span className="text-[11px] uppercase tracking-wide text-text-subtle">{t("obit.field.diedOn")}</span>
            <input type="date" value={diedOn} onChange={(e) => setDiedOn(e.target.value)} className={field} />
          </label>
          <label className="grid gap-1">
            <span className="text-[11px] uppercase tracking-wide text-text-subtle">{t("obit.field.serviceOn")}</span>
            <input type="date" value={serviceOn} onChange={(e) => setServiceOn(e.target.value)} className={field} />
          </label>
        </div>

        {([
          [t("obit.field.serviceAt"), serviceAt, setServiceAt],
          [t("obit.field.burialAt"), burialAt, setBurialAt],
          [t("obit.field.condolenceAt"), condolenceAt, setCondolenceAt],
        ] as const).map(([label, value, set]) => (
          <label key={label} className="grid gap-1">
            <span className="text-[11px] uppercase tracking-wide text-text-subtle">{label}</span>
            <input value={value} onChange={(e) => set(e.target.value)} className={field} />
          </label>
        ))}

        <label className="grid gap-1">
          <span className="text-[11px] uppercase tracking-wide text-text-subtle">{t("obit.field.message")}</span>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5}
            className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-border text-text text-sm focus:outline-none focus:border-primary" />
          <span className="text-[11px] text-text-subtle">{t("obit.messageHint")}</span>
        </label>

        <div className="rounded-xl border border-border bg-surface-2/50 p-3">
          <label className="flex items-start gap-2 text-sm text-text cursor-pointer">
            <input type="checkbox" checked={publicShare} onChange={(e) => setPublicShare(e.target.checked)}
              className="mt-0.5" />
            <span>
              {t("obit.public")}
              <span className="block text-[11px] text-text-subtle mt-0.5">{t("obit.publicNote")}</span>
            </span>
          </label>
        </div>

        {error && <p className="text-xs text-danger bg-danger-soft px-3 py-2.5 rounded-xl">{error}</p>}

        <div className="flex gap-2 items-center">
          <Button type="submit" size="sm" disabled={busy || !personId}>{t("obit.save")}</Button>
          <Button type="button" variant="secondary" size="sm" onClick={onCancel} disabled={busy}>
            {t("obit.cancel")}
          </Button>
          {!personId && <span className="text-[11px] text-text-subtle">{t("obit.invalid")}</span>}
          {oneri && !diedOn && <span className="text-[11px] text-text-subtle">·</span>}
        </div>
      </form>
    </div>
  );
}
