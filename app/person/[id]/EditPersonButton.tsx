"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Person } from "@/types/family";
import PersonModal from "@/components/PersonModal";

export default function EditPersonButton({
  people,
  personId,
}: {
  people: Person[];
  personId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 bg-green-700 text-white text-sm rounded-lg hover:bg-green-800 transition-colors"
      >
        Düzenle
      </button>
      {open && (
        <PersonModal
          people={people}
          personId={personId}
          onClose={() => setOpen(false)}
          onSaved={() => router.refresh()}
        />
      )}
    </>
  );
}
