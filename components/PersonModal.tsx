"use client";

import { useEffect } from "react";
import type { Person } from "@/types/family";
import PersonForm from "./PersonForm";

interface Props {
  people: Person[];
  personId?: string;
  onClose: () => void;
  onSaved?: (person: Person) => void;
}

export default function PersonModal({ people, personId, onClose, onSaved }: Props) {
  const person = personId ? people.find((p) => p.id === personId) : undefined;
  const title = personId
    ? `${person?.firstName ?? ""} ${person?.lastName ?? ""} — Düzenle`
    : "Yeni Kişi Ekle";

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Panel — bottom sheet on mobile, centered on sm+ */}
      <div className="relative z-10 bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[88vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-base font-bold text-gray-900 truncate pr-4">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Kapat"
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
          >
            ✕
          </button>
        </div>

        {/* Scrollable form */}
        <div className="overflow-y-auto flex-1 px-5 py-4">
          <PersonForm
            people={people}
            initial={person}
            personId={personId}
            onClose={onClose}
            onSaved={onSaved}
          />
        </div>
      </div>
    </div>
  );
}
