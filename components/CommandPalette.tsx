"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Person } from "@/types/family";
import Avatar from "./ui/Avatar";
import { lifeSpan } from "@/lib/date";
import { fullName } from "@/lib/name";
import useEscapeKey from "@/lib/useEscapeKey";
import { usePrivacy } from "./PrivacyContext";
import { isMasked } from "@/lib/privacy";
import { useT } from "@/lib/i18n";

interface Props {
  people: Person[];
  onSelect: (id: string) => void;
  onClose: () => void;
  onAdd: () => void;
}

export default function CommandPalette({ people: rawPeople, onSelect, onClose, onAdd }: Props) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const t = useT();
  const { view, hideLiving } = usePrivacy();
  // Arama ve gösterim maskeli görünüm üzerinden — gizli alanlar eşleşmez.
  const people = useMemo(() => rawPeople.map(view), [rawPeople, view]);

  const results = useMemo(() => {
    const q = query.toLocaleLowerCase("tr").trim();
    if (!q) return people.slice(0, 8);

    const scored = people
      .map((p) => {
        const full = fullName(p).toLocaleLowerCase("tr");
        let score = -1;
        if (full.startsWith(q)) score = 0;
        else if (p.firstName.toLocaleLowerCase("tr").startsWith(q)) score = 1;
        else if (p.lastName.toLocaleLowerCase("tr").startsWith(q)) score = 2;
        else if (full.includes(q)) score = 3;
        else if ((p.birthPlace ?? "").toLocaleLowerCase("tr").includes(q)) score = 4;
        else if ((p.bio ?? "").toLocaleLowerCase("tr").includes(q)) score = 5;
        else if ((p.orientation ?? "").toLocaleLowerCase("tr").includes(q)) score = 6;
        return { p, score };
      })
      .filter((x) => x.score >= 0)
      .sort((a, b) => a.score - b.score);

    return scored.slice(0, 12).map((x) => x.p);
  }, [people, query]);

  useEffect(() => {
    inputRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEscapeKey(onClose);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setCursor((c) => Math.min(c + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((c) => Math.max(c - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const hit = results[cursor];
        if (hit) {
          onSelect(hit.id);
          onClose();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [results, cursor, onSelect, onClose]);

  useEffect(() => {
    listRef.current?.children[cursor]?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh] px-4">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px] animate-fade-in" onClick={onClose} aria-hidden />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("palette.aria")}
        className="relative z-10 w-full max-w-lg rounded-2xl bg-bg-elevated border border-border shadow-modal overflow-hidden animate-scale-in"
      >
        <div className="flex items-center gap-3 px-4 h-14 border-b border-border">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden className="text-text-subtle shrink-0">
            <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.9" />
            <path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            placeholder={t("palette.placeholder")}
            className="flex-1 bg-transparent text-[15px] text-text placeholder:text-text-subtle focus:outline-none"
          />
          <kbd className="text-[10px] px-1.5 py-0.5 rounded border border-border bg-surface-2 text-text-subtle shrink-0">
            ESC
          </kbd>
        </div>

        <div className="max-h-[52vh] overflow-y-auto">
          {results.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-text-muted mb-3">
                {query ? t("palette.notFound", { query }) : t("palette.empty")}
              </p>
              <button
                onClick={() => {
                  onClose();
                  onAdd();
                }}
                className="text-sm text-primary font-medium hover:underline"
              >
                {t("palette.addNew")}
              </button>
            </div>
          ) : (
            <ul ref={listRef} className="p-1.5">
              {results.map((p, i) => (
                <li key={p.id}>
                  <button
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => {
                      onSelect(p.id);
                      onClose();
                    }}
                    className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-left transition-colors ${
                      i === cursor ? "bg-surface-2" : ""
                    }`}
                  >
                    <Avatar person={p} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-text truncate leading-tight">
                        {fullName(p)}
                      </p>
                      <p className="text-[11px] text-text-subtle truncate leading-tight">
                        {isMasked(p, hideLiving)
                          ? t("common.living")
                          : [lifeSpan(p.birthDate, p.deathDate), p.birthPlace]
                              .filter(Boolean)
                              .join(" · ") || t("palette.noDetail")}
                      </p>
                    </div>
                    {i === cursor && (
                      <kbd className="text-[10px] px-1.5 py-0.5 rounded border border-border bg-surface text-text-subtle shrink-0">
                        ↵
                      </kbd>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
