"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { Person } from "@/types/family";
import PersonModal from "@/components/PersonModal";

const FamilyTree = dynamic(() => import("@/components/FamilyTree"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <div className="text-gray-400">Ağaç yükleniyor…</div>
    </div>
  ),
});

export default function TreeClient({ people }: { people: Person[] }) {
  const router = useRouter();
  const [modal, setModal] = useState<{ open: boolean; personId?: string }>({ open: false });

  const openAdd = useCallback(() => setModal({ open: true }), []);
  const closeModal = useCallback(() => setModal({ open: false }), []);
  const handleSaved = useCallback(() => router.refresh(), [router]);

  return (
    <div className="relative w-full h-full">
      <FamilyTree people={people} onAddPerson={openAdd} />

      {/* Floating Add Button */}
      <button
        onClick={openAdd}
        className="absolute bottom-6 right-6 z-10 flex items-center gap-1.5 px-4 py-2.5 bg-green-700 hover:bg-green-800 text-white font-semibold rounded-full shadow-lg transition-colors text-sm"
      >
        <span className="text-xl leading-none font-light">+</span>
        <span>Kişi Ekle</span>
      </button>

      {modal.open && (
        <PersonModal
          people={people}
          personId={modal.personId}
          onClose={closeModal}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
