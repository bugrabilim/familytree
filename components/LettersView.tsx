"use client";

import { useEffect, useState } from "react";
import type { Person } from "@/types/family";
import type { Letter } from "@/types/letter";
import Button from "./ui/Button";
import PersonPicker from "./PersonPicker";
import { daysUntilOpen, isUnlocked, today } from "@/lib/letters";
import { formatLong } from "@/lib/date";
import { fullName } from "@/lib/name";
import { useReadOnly } from "./ReadOnlyContext";
import { useT } from "@/lib/i18n";

/**
 * Zaman kilitli mektuplar.
 *
 * Bu görünüm kilidi UYGULAMAZ, yalnız gösterir. Kilitli bir mektubun metni
 * buraya hiç gelmez: sunucu `body` alanını yanıttan çıkarır. Yani "gizle"
 * demiyoruz, veri elimizde değil. Fark önemli — gizleyen bir arayüz, metni
 * ağ sekmesinde ve sayfa kaynağında bırakırdı.
 */
export default function LettersView({
  people,
  onSelect,
}: {
  people: Person[];
  onSelect: (id: string) => void;
}) {
  const t = useT();
  const { readOnly } = useReadOnly();
  const [letters, setLetters] = useState<Letter[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Letter | "new" | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/family/letters");
        const data = await res.json();
        if (!alive) return;
        if (!res.ok) throw new Error(data?.error ?? t("letters.failed"));
        setLetters(data.letters ?? []);
      } catch (e) {
        if (alive) { setError((e as Error).message); setLetters([]); }
      }
    })();
    return () => { alive = false; };
  }, [t]);

  const call = async (method: "POST" | "PUT" | "DELETE", body: unknown) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/family/letters", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? t("letters.failed"));
      setLetters(data.letters ?? []);
      setEditing(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <LetterForm
        people={people}
        letter={editing === "new" ? null : editing}
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
          <h1 className="font-serif text-xl font-semibold text-text">{t("letters.title")}</h1>
          <p className="text-sm text-text-muted mt-0.5">{t("letters.subtitle")}</p>
        </header>

        {letters === null ? (
          <p className="text-sm text-text-muted">…</p>
        ) : (
          <>
            {!readOnly && (
              <div>
                <Button size="sm" onClick={() => setEditing("new")}>{t("letters.add")}</Button>
              </div>
            )}
            {error && <p className="text-xs text-danger bg-danger-soft px-3 py-2.5 rounded-xl">{error}</p>}

            {letters.length === 0 ? (
              <div className="rounded-2xl border border-border bg-surface p-5">
                <p className="text-sm text-text">{t("letters.empty")}</p>
                <p className="text-[11px] text-text-subtle mt-1">{t("letters.emptyHint")}</p>
              </div>
            ) : (
              <>
                <p className="text-[11px] text-text-subtle">{t("letters.count", { count: letters.length })}</p>
                {letters.map((l) => (
                  <LetterCard
                    key={l.id}
                    letter={l}
                    readOnly={readOnly}
                    busy={busy}
                    people={people}
                    onSelect={onSelect}
                    onEdit={() => setEditing(l)}
                    onDelete={() => {
                      if (window.confirm(t("letters.deleteConfirm"))) call("DELETE", { id: l.id });
                    }}
                  />
                ))}
                <p className="text-[11px] text-text-subtle">{t("letters.lockedNote")}</p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function LetterCard({
  letter, readOnly, busy, people, onSelect, onEdit, onDelete,
}: {
  letter: Letter; readOnly: boolean; busy: boolean; people: Person[];
  onSelect: (id: string) => void; onEdit: () => void; onDelete: () => void;
}) {
  const t = useT();
  const acik = isUnlocked(letter);
  const kalan = daysUntilOpen(letter);
  const kisi = (id?: string, ad?: string) => {
    const p = id ? people.find((x) => x.id === id) : undefined;
    if (p) return <button onClick={() => onSelect(p.id)} className="hover:underline">{fullName(p)}</button>;
    return ad ? <span>{ad}</span> : null;
  };
  const kimden = kisi(letter.fromPersonId, letter.fromName);
  const kime = kisi(letter.toPersonId, letter.toName);

  return (
    <article
      className={`rounded-2xl border p-4 ${
        acik ? "border-border bg-surface" : "border-accent/40 bg-accent-soft/30"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-text">
            {acik ? "" : "🔒 "}
            {letter.title}
          </p>
          <p className="text-[11px] text-text-subtle mt-0.5">
            {acik
              ? t("letters.openedOn", { date: formatLong(letter.opensOn) })
              : kalan !== null && kalan <= 60
              ? t("letters.opensIn", { count: kalan })
              : t("letters.opensOnDate", { date: formatLong(letter.opensOn) })}
          </p>
          {(kimden || kime) && (
            <p className="text-[11px] text-text-muted mt-0.5">
              {kimden}
              {kimden && kime ? " → " : ""}
              {kime}
            </p>
          )}
        </div>
        {!readOnly && (
          <div className="flex gap-1 shrink-0">
            <button
              onClick={onEdit}
              disabled={busy}
              className="text-[11px] px-2 py-1 rounded-lg text-text-subtle hover:text-text hover:bg-surface-2 transition-colors"
            >
              {t("letters.edit")}
            </button>
            <button
              onClick={onDelete}
              disabled={busy}
              className="text-[11px] px-2 py-1 rounded-lg text-text-subtle hover:text-danger hover:bg-danger-soft transition-colors"
            >
              {t("letters.delete")}
            </button>
          </div>
        )}
      </div>

      {/* Metin YALNIZ açıldıysa vardır — kilitliyken sunucu göndermemiştir. */}
      {acik && letter.body && (
        <p className="mt-3 text-sm text-text whitespace-pre-wrap leading-relaxed">{letter.body}</p>
      )}
    </article>
  );
}

function LetterForm({
  people, letter, busy, error, onCancel, onSave,
}: {
  people: Person[];
  letter: Letter | null;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onSave: (input: Record<string, unknown>) => void;
}) {
  const t = useT();
  const acik = letter ? isUnlocked(letter) : true;
  const [title, setTitle] = useState(letter?.title ?? "");
  const [fromPersonId, setFrom] = useState(letter?.fromPersonId ?? "");
  const [toPersonId, setTo] = useState(letter?.toPersonId ?? "");
  const [opensOn, setOpensOn] = useState(letter?.opensOn ?? "");
  // Kilitli bir mektubun metni ELİMİZDE YOK; kutu boş açılır.
  const [body, setBody] = useState(letter?.body ?? "");

  const adOf = (id: string) => {
    const p = people.find((x) => x.id === id);
    return p ? fullName(p) : "";
  };

  const gecerliTarih = /^\d{4}-\d{2}-\d{2}$/.test(opensOn);
  const input: Record<string, unknown> = {
    title,
    fromPersonId,
    fromName: adOf(fromPersonId),
    toPersonId,
    toName: adOf(toPersonId),
    opensOn,
  };
  /*
   * Metin YALNIZ kullanıcı bir şey yazdıysa gönderilir.
   *
   * Kilitli bir mektubu düzenlerken kutu boş gelir (metin sunucudan hiç
   * çıkmadı). Boş kutuyu göndermek, dokunulmamış bir metni SİLERDİ. Bu yüzden
   * boşsa alan hiç gönderilmez ve sunucudaki mevcut metin korunur.
   */
  if (body.trim()) input.body = body;

  const field = "w-full h-10 px-3 rounded-xl bg-surface-2 border border-border text-text text-sm placeholder:text-text-subtle focus:outline-none focus:border-primary";

  return (
    <div className="h-full overflow-y-auto">
      <form
        className="max-w-xl mx-auto p-4 sm:p-6 grid gap-3"
        onSubmit={(e) => { e.preventDefault(); onSave(input); }}
      >
        <h1 className="font-serif text-lg font-semibold text-text">
          {letter ? letter.title : t("letters.add")}
        </h1>

        <label className="grid gap-1">
          <span className="text-[11px] uppercase tracking-wide text-text-subtle">{t("letters.field.title")}</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={field} autoFocus />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1">
            <span className="text-[11px] uppercase tracking-wide text-text-subtle">{t("letters.field.from")}</span>
            <PersonPicker people={people} value={fromPersonId} onChange={setFrom} />
          </label>
          <label className="grid gap-1">
            <span className="text-[11px] uppercase tracking-wide text-text-subtle">{t("letters.field.to")}</span>
            <PersonPicker people={people} value={toPersonId} onChange={setTo} />
          </label>
        </div>

        <label className="grid gap-1">
          <span className="text-[11px] uppercase tracking-wide text-text-subtle">{t("letters.field.opensOn")}</span>
          <input
            type="date"
            value={opensOn}
            min={today()}
            onChange={(e) => setOpensOn(e.target.value)}
            className={field}
          />
        </label>

        <label className="grid gap-1">
          <span className="text-[11px] uppercase tracking-wide text-text-subtle">{t("letters.field.body")}</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-border text-text text-sm focus:outline-none focus:border-primary"
          />
          {letter && !acik && (
            <span className="text-[11px] text-text-subtle">{t("letters.bodyHiddenHint")}</span>
          )}
        </label>

        {error && <p className="text-xs text-danger bg-danger-soft px-3 py-2.5 rounded-xl">{error}</p>}

        <div className="flex gap-2 items-center">
          <Button type="submit" size="sm" disabled={busy || !title.trim() || !gecerliTarih}>
            {t("letters.save")}
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={onCancel} disabled={busy}>
            {t("letters.cancel")}
          </Button>
          {(!title.trim() || !gecerliTarih) && (
            <span className="text-[11px] text-text-subtle">{t("letters.invalid")}</span>
          )}
        </div>
      </form>
    </div>
  );
}
