"use client";

import dynamic from "next/dynamic";
import type { Person } from "@/types/family";

const FamilyTree = dynamic(() => import("@/components/FamilyTree"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <div className="text-gray-400">Ağaç yükleniyor...</div>
    </div>
  ),
});

export default function TreeClient({ people }: { people: Person[] }) {
  return <FamilyTree people={people} />;
}
